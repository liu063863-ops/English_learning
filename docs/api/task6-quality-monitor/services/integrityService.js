import fs from "node:fs/promises";
import path from "node:path";
import { AudioFile, Exam, Passage, Question, Section } from "../../task4-question-admin/models/QuestionBankModels.js";
import { QualityIssue } from "../models/QualityModels.js";

const REQUIRED_SECTION_TYPES = ["listening", "reading", "translation", "writing"];
const OBJECTIVE_TYPES = new Set(["single_choice", "multiple_choice", "blank", "fill_blank"]);

export async function runIntegrityReconcile(options = {}) {
  const runId = options.runId || `integrity-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const repoPapers = await readRepoPapers(options.repoPapersPath);
  const [exams, sections, questions, passages, audioFiles] = await Promise.all([
    Exam.find({ source: "past_exam" }).lean(),
    Section.find({}).lean(),
    Question.find({}).lean(),
    Passage.find({}).lean(),
    AudioFile.find({}).lean()
  ]);

  const examByKey = new Map(exams.map((exam) => [makeExamKey(exam), exam]));
  const sectionsByExam = groupBy(sections, "exam_id");
  const questionsBySection = groupBy(questions, "section_id");
  const audioBySection = groupBy(audioFiles.filter((audio) => audio.section_id), "section_id");
  const passagesBySection = groupBy(passages, "section_id");
  const issues = [];

  for (const paper of repoPapers.filter((item) => item.examType && item.year && item.month && item.paperNo)) {
    const key = makeExamKey({
      level: paper.examType,
      year: paper.year,
      month: paper.month,
      set_num: paper.paperNo,
      source: "past_exam"
    });
    const exam = examByKey.get(key);
    if (!exam) {
      issues.push(makeIssue({
        issue_type: "missing_exam",
        severity: "critical",
        title: `缺失试卷：${key}`,
        detail: paper.sourceFolder || "",
        field_path: "exam",
        report_run_id: runId
      }));
      continue;
    }

    const examSections = sectionsByExam.get(String(exam._id)) || [];
    const sectionByType = new Map(examSections.map((section) => [section.section_type, section]));
    for (const type of REQUIRED_SECTION_TYPES) {
      const section = sectionByType.get(type);
      if (!section) {
        issues.push(makeIssue({
          exam_id: exam._id,
          issue_type: "coverage_gap",
          severity: "high",
          title: `缺失题型区块：${type}`,
          field_path: "sections.section_type",
          report_run_id: runId
        }));
        continue;
      }

      const sectionQuestions = questionsBySection.get(String(section._id)) || [];
      if (!sectionQuestions.length) {
        issues.push(makeIssue({
          exam_id: exam._id,
          section_id: section._id,
          issue_type: "missing_question",
          severity: "critical",
          title: `题型区块无题目：${type}`,
          field_path: "questions",
          report_run_id: runId
        }));
      }
      issues.push(...checkQuestionContinuity(exam, section, sectionQuestions, runId));
      issues.push(...checkRequiredFields(exam, section, sectionQuestions, runId));

      if (type === "listening") {
        const audios = audioBySection.get(String(section._id)) || [];
        if (!audios.length) {
          issues.push(makeIssue({
            exam_id: exam._id,
            section_id: section._id,
            issue_type: "missing_audio",
            severity: "critical",
            title: "听力区块缺少音频文件",
            field_path: "audio_files",
            report_run_id: runId
          }));
        }
      }

      if (type === "reading") {
        const readingPassages = passagesBySection.get(String(section._id)) || [];
        if (!readingPassages.length) {
          issues.push(makeIssue({
            exam_id: exam._id,
            section_id: section._id,
            issue_type: "missing_field",
            severity: "high",
            title: "阅读区块缺少文章",
            field_path: "passages",
            report_run_id: runId
          }));
        }
      }
    }
  }

  if (options.persistIssues) await persistIssues(issues);

  const summary = {
    expectedPapers: repoPapers.filter((item) => item.examType && item.year && item.month && item.paperNo).length,
    importedPapers: exams.length,
    totalQuestions: questions.length,
    missingCount: issues.filter((issue) => ["missing_exam", "missing_question", "missing_audio"].includes(issue.issue_type)).length,
    issueCount: issues.length,
    byType: countBy(issues, "issue_type"),
    bySeverity: countBy(issues, "severity"),
    completenessRate: repoPapers.length ? Math.round((exams.length / repoPapers.length) * 1000) / 10 : 0
  };

  return { runId, generated_at: new Date().toISOString(), summary, issues };
}

export async function validateImportPayloadIntegrity(payload, options = {}) {
  const issues = [];
  const sections = payload.sections || [];
  const questions = payload.questions || [];
  const passages = payload.passages || [];
  const audioFiles = payload.audio_files || [];
  const sectionsByExam = groupByPayload(sections, "exam_id");
  const questionsBySection = groupByPayload(questions, "section_id");
  const audioBySection = groupByPayload(audioFiles.filter((audio) => audio.section_id), "section_id");
  const passagesBySection = groupByPayload(passages, "section_id");

  for (const exam of payload.exams || []) {
    const examId = idOf(exam._id);
    const examSections = sectionsByExam.get(examId) || [];
    const sectionByType = new Map(examSections.map((section) => [section.section_type, section]));
    for (const type of REQUIRED_SECTION_TYPES) {
      const section = sectionByType.get(type);
      if (!section) {
        issues.push(importIssue("coverage_gap", "high", `导入数据缺少题型区块：${type}`, `sections.${type}`));
        continue;
      }
      const sectionId = idOf(section._id);
      const sectionQuestions = questionsBySection.get(sectionId) || [];
      if (!sectionQuestions.length) issues.push(importIssue("missing_question", "critical", `导入数据 ${type} 区块无题目`, "questions"));
      issues.push(...checkPayloadQuestionContinuity(type, sectionQuestions));
      issues.push(...checkPayloadRequiredFields(type, sectionQuestions));
      if (type === "listening") {
        const audios = audioBySection.get(sectionId) || [];
        if (!audios.length) issues.push(importIssue("missing_audio", "critical", "导入数据听力区块缺少音频", "audio_files"));
        if (options.checkAudioReachable) {
          for (const audio of audios) {
            if (!(await isAudioReachable(audio.file_url))) {
              issues.push(importIssue("missing_audio", "high", `音频不可访问：${audio.file_url}`, "audio_files.file_url"));
            }
          }
        }
      }
      if (type === "reading" && !(passagesBySection.get(sectionId) || []).length) {
        issues.push(importIssue("missing_field", "high", "导入数据阅读区块缺少文章", "passages"));
      }
    }
  }

  return {
    passed: !issues.some((issue) => ["high", "critical"].includes(issue.severity)),
    issues,
    summary: { issueCount: issues.length, byType: countBy(issues, "issue_type"), bySeverity: countBy(issues, "severity") }
  };
}

export async function buildQualityDashboardData(options = {}) {
  const repoPapers = await readRepoPapers(options.repoPapersPath);
  const [exams, sections, questions, issues] = await Promise.all([
    Exam.find({ source: "past_exam" }).lean(),
    Section.find({}).lean(),
    Question.find({}).lean(),
    QualityIssue.find({ status: { $in: ["open", "confirmed"] } }).lean()
  ]);
  const sectionsByExam = groupBy(sections, "exam_id");
  const questionsBySection = groupBy(questions, "section_id");
  const importedKeys = new Set(exams.map(makeExamKey));
  const expected = repoPapers.filter((item) => item.examType && item.year && item.month && item.paperNo);
  const heatmap = buildYearHeatmap(expected, importedKeys);
  const sectionCoverage = buildSectionCoverage(exams, sectionsByExam, questionsBySection);

  return {
    totals: {
      expectedPapers: expected.length,
      importedPapers: exams.length,
      missingPapers: Math.max(expected.length - exams.length, 0),
      totalQuestions: questions.length,
      openIssues: issues.length
    },
    heatmap,
    sectionCoverage,
    issueBreakdown: {
      byType: countBy(issues, "issue_type"),
      bySeverity: countBy(issues, "severity")
    },
    updatedAt: new Date().toISOString()
  };
}

async function readRepoPapers(repoPapersPath) {
  const file = repoPapersPath || "backend/data/imported/cet_repo_papers.json";
  try {
    return JSON.parse(await fs.readFile(path.resolve(file), "utf8"));
  } catch {
    return [];
  }
}

function checkQuestionContinuity(exam, section, rows, runId) {
  return findContinuityGaps(rows).map((gap) => makeIssue({
    exam_id: exam._id,
    section_id: section._id,
    issue_type: "missing_question",
    severity: "high",
    title: `题号不连续：${section.section_type} ${gap.after} 后直接到 ${gap.before}`,
    field_path: "questions.order_index",
    report_run_id: runId
  }));
}

function checkRequiredFields(exam, section, rows, runId) {
  const issues = [];
  for (const question of rows) {
    if (!question.question_text?.raw?.trim()) issues.push(questionIssue(exam, section, question, "missing_field", "critical", "题干为空", "question_text.raw", runId));
    if (OBJECTIVE_TYPES.has(question.question_type) && isEmpty(question.correct_answer)) issues.push(questionIssue(exam, section, question, "missing_field", "critical", "客观题缺少答案", "correct_answer", runId));
    if (OBJECTIVE_TYPES.has(question.question_type) && (!question.options || question.options.length < 2)) issues.push(questionIssue(exam, section, question, "missing_field", "high", "选择题选项不足", "options", runId));
    if (!question.explanation?.raw?.trim()) issues.push(questionIssue(exam, section, question, "missing_field", "medium", "解析为空", "explanation.raw", runId));
  }
  return issues;
}

function checkPayloadQuestionContinuity(sectionType, rows) {
  return findContinuityGaps(rows).map((gap) => importIssue("missing_question", "high", `导入数据题号不连续：${sectionType} ${gap.after} 后直接到 ${gap.before}`, "questions.order_index"));
}

function checkPayloadRequiredFields(sectionType, rows) {
  const issues = [];
  for (const question of rows) {
    if (!question.question_text?.raw?.trim()) issues.push(importIssue("missing_field", "critical", `导入数据 ${sectionType} 题干为空`, "question_text.raw"));
    if (OBJECTIVE_TYPES.has(question.question_type) && isEmpty(question.correct_answer)) issues.push(importIssue("missing_field", "critical", `导入数据 ${sectionType} 客观题缺少答案`, "correct_answer"));
    if (OBJECTIVE_TYPES.has(question.question_type) && (!question.options || question.options.length < 2)) issues.push(importIssue("missing_field", "high", `导入数据 ${sectionType} 选项不足`, "options"));
  }
  return issues;
}

function buildYearHeatmap(expected, importedKeys) {
  const cells = new Map();
  for (const paper of expected) {
    const key = `${paper.year}:${paper.month}:${paper.examType}`;
    if (!cells.has(key)) cells.set(key, { year: paper.year, month: paper.month, level: paper.examType, expected: 0, imported: 0 });
    const cell = cells.get(key);
    cell.expected += 1;
    const paperKey = makeExamKey({ level: paper.examType, year: paper.year, month: paper.month, set_num: paper.paperNo, source: "past_exam" });
    if (importedKeys.has(paperKey)) cell.imported += 1;
  }
  return [...cells.values()].map((cell) => ({
    ...cell,
    missing: cell.expected - cell.imported,
    completeness: cell.expected ? Math.round((cell.imported / cell.expected) * 100) : 0
  })).sort((a, b) => b.year - a.year || b.month - a.month || a.level.localeCompare(b.level));
}

function buildSectionCoverage(exams, sectionsByExam, questionsBySection) {
  const coverage = Object.fromEntries(REQUIRED_SECTION_TYPES.map((type) => [type, { examsWithSection: 0, questionCount: 0, missingExams: 0 }]));
  for (const exam of exams) {
    const sections = sectionsByExam.get(String(exam._id)) || [];
    const byType = new Map(sections.map((section) => [section.section_type, section]));
    for (const type of REQUIRED_SECTION_TYPES) {
      const section = byType.get(type);
      if (!section) {
        coverage[type].missingExams += 1;
        continue;
      }
      coverage[type].examsWithSection += 1;
      coverage[type].questionCount += (questionsBySection.get(String(section._id)) || []).length;
    }
  }
  return coverage;
}

async function persistIssues(issues) {
  if (!issues.length) return;
  await QualityIssue.bulkWrite(issues.map((item) => ({
    updateOne: {
      filter: {
        exam_id: item.exam_id || null,
        section_id: item.section_id || null,
        question_id: item.question_id || null,
        issue_type: item.issue_type,
        field_path: item.field_path,
        status: { $in: ["open", "confirmed"] }
      },
      update: { $set: item, $setOnInsert: { created_at: new Date() } },
      upsert: true
    }
  })));
}

async function isAudioReachable(fileUrl) {
  if (!fileUrl) return false;
  if (/^https?:\/\//i.test(fileUrl)) {
    try {
      const response = await fetch(fileUrl, { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  }
  try {
    await fs.access(path.resolve(fileUrl));
    return true;
  } catch {
    return false;
  }
}

function makeIssue(input) {
  return { status: "open", detected_by: "script", ...input };
}

function questionIssue(exam, section, question, issueType, severity, title, fieldPath, runId) {
  return makeIssue({ exam_id: exam._id, section_id: section._id, question_id: question._id, issue_type: issueType, severity, title, field_path: fieldPath, report_run_id: runId });
}

function importIssue(issueType, severity, title, fieldPath) {
  return { issue_type: issueType, severity, title, field_path: fieldPath };
}

function findContinuityGaps(rows) {
  const nums = rows.map((row) => Number(row.order_index)).filter(Boolean).sort((a, b) => a - b);
  const gaps = [];
  for (let index = 1; index < nums.length; index += 1) {
    if (nums[index] !== nums[index - 1] + 1) gaps.push({ after: nums[index - 1], before: nums[index] });
  }
  return gaps;
}

function makeExamKey(exam) {
  return `${exam.level}:${exam.year}:${exam.month}:${exam.set_num}:${exam.source || "past_exam"}`;
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

function groupByPayload(rows, key) {
  const map = new Map();
  rows.forEach((row) => {
    const id = idOf(row[key]);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  });
  return map;
}

function idOf(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.$oid || String(value);
}

function isEmpty(value) {
  if (Array.isArray(value)) return value.length === 0;
  return value === undefined || value === null || String(value).trim() === "";
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}
