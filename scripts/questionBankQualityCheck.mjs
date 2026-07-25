import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import mongoose from "mongoose";
import {
  AudioFile,
  Exam,
  Passage,
  Question,
  Section
} from "../docs/database/unified-question-bank.schema.js";
import { QualityIssue } from "../docs/api/task6-quality-monitor/models/QualityModels.js";

const args = parseArgs(process.argv.slice(2));
const mongoUri = args.mongo || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/english_exam";
const output = args.output || "backend/data/reports/question-bank-quality-report.json";
const shouldPersist = Boolean(args.persist);
const runId = args.runId || `quality-${new Date().toISOString().replace(/[:.]/g, "-")}`;

await mongoose.connect(mongoUri);

try {
  const report = await runQualityCheck(runId);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");

  if (shouldPersist) {
    await persistIssues(report.issues);
  }

  console.log(JSON.stringify({
    ok: true,
    runId,
    output,
    persisted: shouldPersist,
    summary: report.summary
  }, null, 2));
} finally {
  await mongoose.disconnect();
}

async function runQualityCheck(reportRunId) {
  const [exams, sections, questions, passages, audioFiles] = await Promise.all([
    Exam.find({}).lean(),
    Section.find({}).lean(),
    Question.find({}).lean(),
    Passage.find({}).lean(),
    AudioFile.find({}).lean()
  ]);

  const sectionById = new Map(sections.map((item) => [String(item._id), item]));
  const examById = new Map(exams.map((item) => [String(item._id), item]));
  const passageById = new Map(passages.map((item) => [String(item._id), item]));
  const audioById = new Map(audioFiles.map((item) => [String(item._id), item]));
  const audioBySection = groupBy(audioFiles.filter((item) => item.section_id), "section_id");
  const questionsBySection = groupBy(questions, "section_id");

  const issues = [];
  const emptyFieldStats = {
    missingQuestionText: 0,
    missingExplanation: 0,
    missingCorrectAnswer: 0,
    missingTranscript: 0,
    missingAudioReference: 0,
    missingPassageReference: 0
  };

  for (const question of questions) {
    const section = sectionById.get(String(question.section_id));
    const exam = section ? examById.get(String(section.exam_id)) : null;
    const context = makeContext(question, section, exam, reportRunId);

    if (!question.question_text?.raw?.trim()) {
      emptyFieldStats.missingQuestionText += 1;
      issues.push(issue(context, "missing_field", "critical", "题干为空", "question_text.raw"));
    }

    if (!question.explanation?.raw?.trim()) {
      emptyFieldStats.missingExplanation += 1;
      issues.push(issue(context, "missing_field", "medium", "缺少详细解析", "explanation.raw"));
    }

    if (question.correct_answer === null || question.correct_answer === undefined || question.correct_answer === "") {
      emptyFieldStats.missingCorrectAnswer += 1;
      issues.push(issue(context, "missing_field", "high", "缺少正确答案", "correct_answer"));
    }

    if (question.import_meta?.needs_review || Number(question.import_meta?.confidence || 1) < 0.72) {
      issues.push(issue(context, "low_confidence", "medium", "PDF 提取置信度较低，需要人工校对", "import_meta.confidence"));
    }

    if (isChoiceQuestion(question)) {
      issues.push(...checkChoiceOptions(question, context));
    }

    if (section?.section_type === "listening") {
      const listeningIssues = checkListeningQuestion(question, section, audioById, audioBySection, context);
      issues.push(...listeningIssues);
      if (!question.transcript?.trim()) emptyFieldStats.missingTranscript += 1;
      if (!question.audio_file_id && !audioBySection.get(String(section._id))?.length) {
        emptyFieldStats.missingAudioReference += 1;
      }
    }

    if (section?.section_type === "reading") {
      const passageId = question.passage_id || question.passage_ref?.passage_id;
      if (!passageId || !passageById.has(String(passageId))) {
        emptyFieldStats.missingPassageReference += 1;
        issues.push(issue(context, "missing_field", "high", "阅读题缺少文章关联", "passage_id"));
      }
    }
  }

  for (const section of sections.filter((item) => item.section_type === "listening")) {
    const sectionQuestions = questionsBySection.get(String(section._id)) || [];
    const sectionAudio = audioBySection.get(String(section._id)) || [];
    if (sectionQuestions.length && !sectionAudio.length) {
      issues.push(issue({
        exam_id: section.exam_id,
        section_id: section._id,
        question_id: null,
        audio_file_id: null,
        report_run_id: reportRunId
      }, "missing_audio", "critical", "听力区块有题目但未关联音频文件", "audio_files"));
    }
  }

  return {
    generated_at: new Date().toISOString(),
    run_id: reportRunId,
    summary: {
      exams: exams.length,
      sections: sections.length,
      questions: questions.length,
      passages: passages.length,
      audioFiles: audioFiles.length,
      issues: issues.length,
      bySeverity: countBy(issues, "severity"),
      byType: countBy(issues, "issue_type"),
      emptyFieldStats
    },
    issues
  };
}

function checkChoiceOptions(question, context) {
  const issues = [];
  const optionKeys = new Set((question.options || []).map((item) => item.key));
  const correct = normalizeAnswer(question.correct_answer);
  const markedCorrect = (question.options || []).filter((item) => item.is_correct);

  if ((question.options || []).length < 2) {
    issues.push(issue(context, "option_error", "critical", "选择题选项少于 2 个", "options"));
  }

  for (const answer of correct) {
    if (!optionKeys.has(answer)) {
      issues.push(issue(context, "option_error", "critical", `正确答案 ${answer} 不在选项中`, "correct_answer"));
    }
  }

  if (question.question_type === "single_choice" && markedCorrect.length > 1) {
    issues.push(issue(context, "option_error", "high", "单选题存在多个 is_correct=true 的选项", "options.is_correct"));
  }

  if (markedCorrect.length && JSON.stringify(markedCorrect.map((item) => item.key).sort()) !== JSON.stringify(correct)) {
    issues.push(issue(context, "option_error", "medium", "选项 is_correct 标记与 correct_answer 不一致", "options.is_correct"));
  }

  return issues;
}

function checkListeningQuestion(question, section, audioById, audioBySection, context) {
  const issues = [];
  const audio = question.audio_file_id
    ? audioById.get(String(question.audio_file_id))
    : (audioBySection.get(String(section._id)) || [])[0];

  if (!audio) {
    issues.push(issue(context, "missing_audio", "critical", "听力题缺少对应音频", "audio_file_id"));
    return issues;
  }

  if (question.audio_start_time === null || question.audio_end_time === null) {
    issues.push(issue({ ...context, audio_file_id: audio._id }, "timeline_error", "high", "听力题缺少音频开始/结束时间", "audio_start_time/audio_end_time"));
  } else if (Number(question.audio_start_time) >= Number(question.audio_end_time)) {
    issues.push(issue({ ...context, audio_file_id: audio._id }, "timeline_error", "critical", "音频开始时间大于或等于结束时间", "audio_start_time/audio_end_time"));
  } else if (audio.duration && Number(question.audio_end_time) > Number(audio.duration) + 1) {
    issues.push(issue({ ...context, audio_file_id: audio._id }, "timeline_error", "critical", "题目音频结束时间超出音频总时长", "audio_end_time"));
  }

  if (!question.transcript?.trim()) {
    issues.push(issue({ ...context, audio_file_id: audio._id }, "missing_field", "medium", "听力题缺少原文片段", "transcript"));
  }

  return issues;
}

async function persistIssues(issues) {
  if (!issues.length) return;
  await QualityIssue.bulkWrite(issues.map((item) => ({
    updateOne: {
      filter: {
        question_id: item.question_id,
        section_id: item.section_id,
        issue_type: item.issue_type,
        field_path: item.field_path,
        status: { $in: ["open", "confirmed"] }
      },
      update: { $set: item, $setOnInsert: { created_at: new Date() } },
      upsert: true
    }
  })));
}

function makeContext(question, section, exam, reportRunId) {
  return {
    exam_id: exam?._id || section?.exam_id || null,
    section_id: section?._id || question.section_id || null,
    question_id: question._id,
    audio_file_id: question.audio_file_id || null,
    report_run_id: reportRunId
  };
}

function issue(context, issueType, severity, title, fieldPath, detail = "") {
  return {
    ...context,
    issue_type: issueType,
    severity,
    title,
    detail,
    field_path: fieldPath,
    status: "open",
    detected_by: "script"
  };
}

function isChoiceQuestion(question) {
  return question.question_type === "single_choice" || question.question_type === "multiple_choice";
}

function normalizeAnswer(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean).sort();
  if (value === undefined || value === null) return [];
  return [String(value).trim()].filter(Boolean).sort();
}

function groupBy(rows, key) {
  const map = new Map();
  rows.forEach((row) => {
    const id = String(row[key]);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  });
  return map;
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}
