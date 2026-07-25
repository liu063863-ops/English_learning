import mongoose from "mongoose";
import { AudioFile, Question, Section } from "../../task4-question-admin/models/QuestionBankModels.js";
import { QuestionRevision } from "../../task6-quality-monitor/models/QualityModels.js";
import { AiCompletionCandidate } from "../models/AiCompletionModels.js";
import {
  generateExplanationCandidate,
  sliceSegmentsByRange,
  transcribeAudioToSegments
} from "../services/openaiCompletionService.js";

const DEFAULT_USER_ID = "64f000000000000000000001";

export async function generateTranscriptCandidates(req, res, next) {
  try {
    const { audioFileId } = req.params;
    const audio = await AudioFile.findById(audioFileId).lean();
    if (!audio) return res.status(404).json({ success: false, error: { code: "AUDIO_NOT_FOUND", message: "音频不存在" } });

    const section = await Section.findById(audio.section_id).lean();
    const questions = await Question.find({ section_id: audio.section_id }).sort({ order_index: 1 }).lean();
    const transcription = await transcribeAudioToSegments(audio.file_url);
    const candidates = [];

    for (const question of questions) {
      if (question.transcript?.trim()) continue;
      const sliced = sliceSegmentsByRange(transcription.segments, question.audio_start_time, question.audio_end_time);
      const text = sliced || transcription.text;
      const candidate = await AiCompletionCandidate.create({
        exam_id: audio.exam_id,
        section_id: audio.section_id,
        question_id: question._id,
        audio_file_id: audio._id,
        candidate_type: "transcript",
        model: transcription.model,
        status: "pending_review",
        content: {
          text,
          segments: transcription.segments,
          raw_response: transcription.raw_response
        },
        source_snapshot: snapshotQuestion(question, text)
      });
      candidates.push(candidate);
    }

    res.json({
      success: true,
      message: "听力原文候选已生成，等待人工审核",
      data: { audioFileId, sectionType: section?.section_type, candidates }
    });
  } catch (error) {
    next(error);
  }
}

export async function generateExplanationCandidates(req, res, next) {
  try {
    const filter = buildMissingExplanationFilter(req);
    const questions = await Question.find(filter).sort({ section_id: 1, order_index: 1 }).limit(Number(req.body.limit || 20)).lean();
    const candidates = [];

    for (const question of questions) {
      const section = await Section.findById(question.section_id).lean();
      const transcript = question.transcript || req.body.transcriptMap?.[String(question._id)] || "";
      const generated = await generateExplanationCandidate({ question, transcript });
      const candidate = await AiCompletionCandidate.create({
        exam_id: section.exam_id,
        section_id: question.section_id,
        question_id: question._id,
        audio_file_id: question.audio_file_id || null,
        candidate_type: "explanation",
        model: generated.model,
        status: "pending_review",
        content: {
          text: generated.text,
          evidence_sentence: generated.evidence_sentence,
          why_correct: generated.why_correct,
          option_analysis: generated.option_analysis,
          raw_response: generated.raw_response
        },
        source_snapshot: snapshotQuestion(question, transcript)
      });
      candidates.push(candidate);
    }

    res.json({ success: true, message: "解析候选已生成，等待人工审核", data: { count: candidates.length, candidates } });
  } catch (error) {
    next(error);
  }
}

export async function listAiCandidates(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 100);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.candidate_type) filter.candidate_type = req.query.candidate_type;
    if (req.query.question_id) filter.question_id = req.query.question_id;

    const [rows, total] = await Promise.all([
      AiCompletionCandidate.find(filter)
        .populate("question_id", "order_index question_text explanation transcript")
        .populate("section_id", "section_type section_name")
        .populate("exam_id", "title level year month set_num")
        .sort({ created_at: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      AiCompletionCandidate.countDocuments(filter)
    ]);

    res.json({ success: true, data: rows, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (error) {
    next(error);
  }
}

export async function approveAiCandidate(req, res, next) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const candidate = await AiCompletionCandidate.findById(req.params.candidateId).session(session);
      if (!candidate) throw Object.assign(new Error("候选内容不存在"), { statusCode: 404, code: "CANDIDATE_NOT_FOUND" });
      if (candidate.status !== "pending_review") throw Object.assign(new Error("候选内容已处理"), { statusCode: 409, code: "CANDIDATE_ALREADY_REVIEWED" });

      const question = await Question.findById(candidate.question_id).session(session);
      if (!question) throw Object.assign(new Error("题目不存在"), { statusCode: 404, code: "QUESTION_NOT_FOUND" });

      const before = question.toObject();
      const patch = buildSafeApprovalPatch(question, candidate, req.body.force === true);
      Object.assign(question, patch);
      await question.save({ session });

      candidate.status = "approved";
      candidate.review_note = req.body.review_note || "";
      candidate.reviewed_by = getUserId(req);
      candidate.reviewed_at = new Date();
      await candidate.save({ session });

      await AiCompletionCandidate.updateMany(
        {
          _id: { $ne: candidate._id },
          question_id: candidate.question_id,
          candidate_type: candidate.candidate_type,
          status: "pending_review"
        },
        { status: "superseded", review_note: "已有候选被审核通过" },
        { session }
      );

      await QuestionRevision.create([{
        question_id: question._id,
        exam_id: candidate.exam_id,
        changed_by: getUserId(req),
        reason: req.body.review_note || "AI 候选审核通过",
        change_source: "quality_fix",
        before,
        after: question.toObject(),
        changed_fields: Object.keys(patch)
      }], { session });

      res.json({ success: true, message: "候选内容已确认并写入题目", data: { question, candidate, patch } });
    });
  } catch (error) {
    next(error);
  } finally {
    await session.endSession();
  }
}

export async function rejectAiCandidate(req, res, next) {
  try {
    const candidate = await AiCompletionCandidate.findByIdAndUpdate(
      req.params.candidateId,
      {
        status: "rejected",
        review_note: req.body.review_note || "",
        reviewed_by: getUserId(req),
        reviewed_at: new Date()
      },
      { new: true }
    ).lean();
    if (!candidate) return res.status(404).json({ success: false, error: { code: "CANDIDATE_NOT_FOUND", message: "候选内容不存在" } });
    res.json({ success: true, message: "候选内容已驳回", data: candidate });
  } catch (error) {
    next(error);
  }
}

function buildMissingExplanationFilter(req) {
  const filter = {};
  if (req.body.question_ids?.length) filter._id = { $in: req.body.question_ids };
  if (req.body.section_id) filter.section_id = req.body.section_id;
  if (!req.body.includeFilled) filter["explanation.raw"] = { $in: ["", null] };
  return filter;
}

function buildSafeApprovalPatch(question, candidate, force) {
  const patch = {};
  if (candidate.candidate_type === "transcript" && (force || !question.transcript?.trim())) {
    patch.transcript = candidate.content.text || "";
  }
  if (candidate.candidate_type === "explanation" && (force || !question.explanation?.raw?.trim())) {
    patch.explanation = {
      raw: candidate.content.text || "",
      html: ""
    };
    if (candidate.content.evidence_sentence && !question.passage_ref?.evidence_text) {
      patch.passage_ref = {
        ...(question.passage_ref?.toObject?.() || question.passage_ref || {}),
        evidence_text: candidate.content.evidence_sentence
      };
    }
  }
  return patch;
}

function snapshotQuestion(question, transcript) {
  return {
    question_text: question.question_text,
    options: question.options,
    correct_answer: question.correct_answer,
    transcript,
    audio_start_time: question.audio_start_time,
    audio_end_time: question.audio_end_time
  };
}

function getUserId(req) {
  return req.user?.id || req.header("x-user-id") || DEFAULT_USER_ID;
}
