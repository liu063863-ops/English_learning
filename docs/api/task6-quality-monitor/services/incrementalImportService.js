import { AudioFile, Exam, Passage, Question, Section } from "../../task4-question-admin/models/QuestionBankModels.js";
import { QuestionRevision } from "../models/QualityModels.js";

export async function previewIncrementalImport(payload) {
  const exams = normalizePayload(payload);
  const existing = await Exam.find({
    $or: exams.length ? exams.map((item) => examIdentityFilter(item.exam)) : [{ _id: null }]
  }).lean();
  const existingKeys = new Set(existing.map(makeExamKey));

  return exams.map((item) => ({
    key: makeExamKey(item.exam),
    title: item.exam.title,
    action: existingKeys.has(makeExamKey(item.exam)) ? "skip_existing" : "insert_new",
    exam: item.exam
  }));
}

export async function runIncrementalImport(payload, options = {}) {
  const exams = normalizePayload(payload);
  const preview = await previewIncrementalImport(exams);
  const importableKeys = new Set(preview.filter((item) => item.action === "insert_new").map((item) => item.key));
  const report = { insertedExams: 0, skippedExams: 0, insertedSections: 0, insertedQuestions: 0, insertedPassages: 0, insertedAudioFiles: 0, errors: [] };

  for (const item of exams) {
    const key = makeExamKey(item.exam);
    if (!importableKeys.has(key)) {
      report.skippedExams += 1;
      continue;
    }

    try {
      const exam = await Exam.create({ ...item.exam, status: item.exam.status || "draft" });
      report.insertedExams += 1;

      const sectionIdMap = new Map();
      for (const sectionInput of item.sections || []) {
        const section = await Section.create({ ...sectionInput, exam_id: exam._id });
        sectionIdMap.set(sectionInput.client_id || sectionInput.section_type, section._id);
        report.insertedSections += 1;
      }

      const audioIdMap = new Map();
      for (const audioInput of item.audio_files || []) {
        const section_id = audioInput.section_ref ? sectionIdMap.get(audioInput.section_ref) : null;
        const audio = await AudioFile.create({ ...audioInput, exam_id: exam._id, section_id });
        audioIdMap.set(audioInput.client_id || audioInput.file_url, audio._id);
        report.insertedAudioFiles += 1;
      }

      const passageIdMap = new Map();
      for (const passageInput of item.passages || []) {
        const passage = await Passage.create({
          ...passageInput,
          section_id: sectionIdMap.get(passageInput.section_ref) || passageInput.section_id
        });
        passageIdMap.set(passageInput.client_id || passageInput.order_index, passage._id);
        report.insertedPassages += 1;
      }

      for (const questionInput of item.questions || []) {
        const question = await Question.create({
          ...questionInput,
          section_id: sectionIdMap.get(questionInput.section_ref) || questionInput.section_id,
          passage_id: questionInput.passage_ref_key ? passageIdMap.get(questionInput.passage_ref_key) : questionInput.passage_id,
          audio_file_id: questionInput.audio_ref_key ? audioIdMap.get(questionInput.audio_ref_key) : questionInput.audio_file_id
        });
        report.insertedQuestions += 1;

        await QuestionRevision.create({
          question_id: question._id,
          exam_id: exam._id,
          changed_by: options.userId || null,
          reason: "增量导入新真题",
          change_source: "bulk_import",
          before: null,
          after: question.toObject(),
          changed_fields: ["created"]
        });
      }
    } catch (error) {
      report.errors.push({ key, message: error.message });
    }
  }

  return report;
}

function normalizePayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.exams)) return payload.exams;
  return [];
}

function examIdentityFilter(exam) {
  return {
    level: exam.level,
    year: exam.year,
    month: exam.month,
    set_num: exam.set_num,
    source: exam.source || "past_exam"
  };
}

function makeExamKey(exam) {
  return `${exam.level}:${exam.year}:${exam.month}:${exam.set_num}:${exam.source || "past_exam"}`;
}
