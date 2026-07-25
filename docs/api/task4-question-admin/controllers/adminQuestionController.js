import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { AudioFile, Exam, Passage, Question, Section } from "../models/QuestionBankModels.js";
import { validateImportPayload } from "../validators/bulkImportValidator.js";

const COLLECTION_ORDER = [
  ["exams", Exam],
  ["sections", Section],
  ["audio_files", AudioFile],
  ["passages", Passage],
  ["questions", Question]
];

export async function previewBulkImport(req, res, next) {
  try {
    const payload = await readImportPayload(req);
    const validationErrors = validateImportPayload(payload);
    const duplicate = await findDuplicateExam(payload.exams?.[0]);
    res.json({
      success: true,
      data: {
        validationErrors,
        duplicate,
        summary: summarizePayload(payload)
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function bulkImportQuestions(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const payload = await readImportPayload(req);
    const mode = req.query.mode || req.body?.mode || "skip"; // skip | update
    const validationErrors = validateImportPayload(payload);
    if (validationErrors.length) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_FAILED", message: "导入数据校验失败", details: validationErrors } });
    }

    const report = { mode, successCount: 0, skippedCount: 0, failedCount: 0, errors: [], collections: {} };
    await session.withTransaction(async () => {
      const duplicate = await findDuplicateExam(payload.exams[0], session);
      if (duplicate && mode === "skip") {
        report.skippedCount += 1;
        report.errors.push({ code: "DUPLICATE_EXAM", message: "同年同月同级别同套数试卷已存在，已跳过", duplicateId: duplicate._id });
        return;
      }
      if (duplicate && mode === "update") {
        await removeExistingExamTree(duplicate._id, session);
      }

      for (const [key, Model] of COLLECTION_ORDER) {
        const rows = normalizeMongoExtendedJson(payload[key] || []);
        if (!rows.length) continue;
        const result = await Model.insertMany(rows, { session, ordered: false });
        report.collections[key] = result.length;
        report.successCount += result.length;
      }
    });

    res.json({ success: true, message: "导入完成", data: report });
  } catch (error) {
    if (error?.writeErrors) {
      return res.status(409).json({
        success: false,
        error: {
          code: "BULK_WRITE_FAILED",
          message: "批量写入失败",
          details: error.writeErrors.map((item) => ({ index: item.index, message: item.errmsg }))
        }
      });
    }
    next(error);
  } finally {
    await session.endSession();
  }
}

export async function listQuestionBank(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 100);
    const filter = {};
    if (req.query.year) filter.year = Number(req.query.year);
    if (req.query.level) filter.level = req.query.level;
    if (req.query.source) filter.source = req.query.source;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.keyword) filter.title = { $regex: req.query.keyword, $options: "i" };

    const [items, total] = await Promise.all([
      Exam.find(filter).sort({ year: -1, month: -1, level: 1, set_num: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      Exam.countDocuments(filter)
    ]);
    res.json({ success: true, data: items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (error) {
    next(error);
  }
}

export async function getExamPreview(req, res, next) {
  try {
    const exam = await Exam.findById(req.params.examId).lean();
    if (!exam) return res.status(404).json({ success: false, error: { code: "EXAM_NOT_FOUND", message: "试卷不存在" } });
    const sections = await Section.find({ exam_id: exam._id }).sort({ order_index: 1 }).lean();
    const sectionIds = sections.map((item) => item._id);
    const [passages, audioFiles, questions] = await Promise.all([
      Passage.find({ section_id: { $in: sectionIds } }).sort({ order_index: 1 }).lean(),
      AudioFile.find({ exam_id: exam._id }).lean(),
      Question.find({ section_id: { $in: sectionIds } }).sort({ order_index: 1 }).lean()
    ]);
    res.json({ success: true, data: { exam, sections, passages, audioFiles, questions } });
  } catch (error) {
    next(error);
  }
}

export async function updateQuestion(req, res, next) {
  try {
    const question = await Question.findByIdAndUpdate(req.params.questionId, req.body, { new: true, runValidators: true });
    if (!question) return res.status(404).json({ success: false, error: { code: "QUESTION_NOT_FOUND", message: "题目不存在" } });
    res.json({ success: true, data: question });
  } catch (error) {
    next(error);
  }
}

export async function replaceAudio(req, res, next) {
  try {
    const fileUrl = req.file ? `/uploads/audio/${req.file.filename}` : req.body.file_url;
    const audio = await AudioFile.findByIdAndUpdate(req.params.audioId, { file_url: fileUrl }, { new: true, runValidators: true });
    if (!audio) return res.status(404).json({ success: false, error: { code: "AUDIO_NOT_FOUND", message: "音频不存在" } });
    res.json({ success: true, data: audio });
  } catch (error) {
    next(error);
  }
}

export async function updateQuestionTimeline(req, res, next) {
  try {
    const question = await Question.findByIdAndUpdate(
      req.params.questionId,
      { audio_start_time: req.body.audio_start_time, audio_end_time: req.body.audio_end_time, transcript: req.body.transcript || "" },
      { new: true, runValidators: true }
    );
    if (!question) return res.status(404).json({ success: false, error: { code: "QUESTION_NOT_FOUND", message: "题目不存在" } });
    res.json({ success: true, data: question });
  } catch (error) {
    next(error);
  }
}

async function readImportPayload(req) {
  if (req.file) return JSON.parse(await fs.readFile(req.file.path, "utf8"));
  if (req.body?.folderPath) {
    const files = await fs.readdir(req.body.folderPath);
    const jsonFile = files.find((file) => file.endsWith(".mongo-import.json") || file.endsWith(".json"));
    if (!jsonFile) throw new Error("folderPath 中未找到 JSON 文件");
    return JSON.parse(await fs.readFile(path.join(req.body.folderPath, jsonFile), "utf8"));
  }
  return req.body;
}

async function findDuplicateExam(exam, session) {
  if (!exam) return null;
  return Exam.findOne({
    level: exam.level,
    year: exam.year,
    month: exam.month,
    set_num: exam.set_num,
    source: exam.source
  }).session(session || null).lean();
}

async function removeExistingExamTree(examId, session) {
  const sections = await Section.find({ exam_id: examId }).session(session).lean();
  const sectionIds = sections.map((item) => item._id);
  await Promise.all([
    Question.deleteMany({ section_id: { $in: sectionIds } }).session(session),
    Passage.deleteMany({ section_id: { $in: sectionIds } }).session(session),
    AudioFile.deleteMany({ exam_id: examId }).session(session),
    Section.deleteMany({ exam_id: examId }).session(session),
    Exam.deleteOne({ _id: examId }).session(session)
  ]);
}

function summarizePayload(payload) {
  return Object.fromEntries(["exams", "sections", "audio_files", "passages", "questions"].map((key) => [key, payload[key]?.length || 0]));
}

function normalizeMongoExtendedJson(rows) {
  return rows.map((row) => JSON.parse(JSON.stringify(row), (_key, value) => {
    if (value && typeof value === "object" && value.$oid) return new mongoose.Types.ObjectId(value.$oid);
    if (value && typeof value === "object" && value.$date) return new Date(value.$date);
    return value;
  }));
}
