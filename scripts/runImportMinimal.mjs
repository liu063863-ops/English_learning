import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createQuestionBankDataAccess } from "./questionBankDataAccess.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));

const config = {
  db: args.db || "sqlite",
  papersPath: resolveRoot(args.papers || "backend/data/imported/cet_repo_papers.robust.json"),
  sqlitePath: args.sqlite || "backend/data/english_exam.db",
  output: resolveRoot(args.output || "backend/data/reports/minimal-import-report.json"),
  python: normalizeUserPath(args.python || process.env.PYTHON || defaultPythonPath()),
  limit: args.limit ? Number(args.limit) : Infinity
};

const allPapers = JSON.parse(await fs.readFile(config.papersPath, "utf8"));
const completePapers = allPapers.filter(isCompletePaper).slice(0, config.limit);
const report = {
  generated_at: new Date().toISOString(),
  mode: "minimal",
  expected: completePapers.length,
  insertedOrUpdated: 0,
  skipped: 0,
  failed: 0,
  papers: []
};

let db = null;
try {
  db = await createQuestionBankDataAccess({
    db: config.db,
    sqlitePath: config.sqlitePath,
    python: config.python
  });
  console.log("=== Minimal CET Import ===");
  console.log(`Database: ${db.type}${db.sqlitePath ? ` (${db.sqlitePath})` : ""}`);
  console.log(`Papers: ${completePapers.length}`);

  for (let index = 0; index < completePapers.length; index += 1) {
    const paper = completePapers[index];
    const label = paperLabel(paper);
    process.stdout.write(`[${index + 1}/${completePapers.length}] ${label} ... `);
    try {
      const payload = sanitizeForSqlite(buildMinimalPayload(paper));
      const result = await db.importPayload(payload);
      report.insertedOrUpdated += 1;
      report.papers.push({ paper: pickPaper(paper), status: "success", result: result.report });
      console.log("OK");
    } catch (error) {
      report.failed += 1;
      report.papers.push({ paper: pickPaper(paper), status: "failed", error: error.message });
      console.log(`FAILED: ${error.message}`);
    }
  }
} finally {
  if (db) await db.close();
}

await fs.mkdir(path.dirname(config.output), { recursive: true });
await fs.writeFile(config.output, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({
  ok: report.failed === 0,
  report: config.output,
  expected: report.expected,
  insertedOrUpdated: report.insertedOrUpdated,
  failed: report.failed
}, null, 2));
process.exitCode = report.failed === 0 ? 0 : 1;

function buildMinimalPayload(paper) {
  const now = new Date().toISOString();
  const key = makePaperKey(paper);
  const examId = stableId(`${key}:exam`);
  const sectionTypes = [
    ["listening", "Listening Comprehension", 1, 35, 25],
    ["reading", "Reading Comprehension", 2, 35, 40],
    ["translation", "Translation", 3, 15, 30],
    ["writing", "Writing", 4, 15, 30]
  ];
  const sectionIds = Object.fromEntries(sectionTypes.map(([type]) => [type, stableId(`${key}:section:${type}`)]));
  const audioId = stableId(`${key}:audio:1`);
  const passageId = stableId(`${key}:passage:1`);
  const audio = paper.paperAssets?.audioMp3 || {};

  return {
    exams: [{
      _id: oid(examId),
      title: `${paper.year}-${paper.month} ${paper.level || paper.examType} Set ${paper.set_num || paper.paperNo}`,
      level: paper.level || paper.examType,
      year: paper.year,
      month: paper.month,
      set_num: paper.set_num || paper.paperNo,
      source: "past_exam",
      source_meta: {
        provider: "DieDiDi/CET4-6-past-exam-paper",
        import_mode: "minimal",
        needs_pdf_parse: true,
        folder_path: paper.sourceFolders?.[0] || "",
        question_pdf_url: paper.paperAssets?.questionPdf?.rawUrl || paper.paperAssets?.questionDoc?.rawUrl || "",
        answer_pdf_url: paper.paperAssets?.answerAnalysisPdf?.rawUrl || ""
      },
      status: "published",
      created_at: date(now),
      updated_at: date(now)
    }],
    sections: sectionTypes.map(([type, name, order, score, limit]) => ({
      _id: oid(sectionIds[type]),
      exam_id: oid(examId),
      section_type: type,
      section_name: name,
      order_index: order,
      total_score: score,
      time_limit: limit,
      created_at: date(now),
      updated_at: date(now)
    })),
    audio_files: [{
      _id: oid(audioId),
      exam_id: oid(examId),
      section_id: oid(sectionIds.listening),
      file_url: audio.rawUrl || audio.localPath || "",
      duration: 0,
      transcript_full: "",
      source_meta: {
        file_name: audio.fileName || "",
        github_url: audio.githubUrl || "",
        raw_url: audio.rawUrl || "",
        local_path: audio.localPath || ""
      },
      created_at: date(now),
      updated_at: date(now)
    }],
    passages: [{
      _id: oid(passageId),
      section_id: oid(sectionIds.reading),
      title: "Reading Passage Placeholder",
      order_index: 1,
      passage_text: "Placeholder passage. This paper was imported in minimal mode because PDF parsing timed out. Fill structured reading content later.",
      paragraph_markers: [{
        paragraph_id: "P1",
        order_index: 1,
        start_offset: 0,
        end_offset: 128,
        text_preview: "Placeholder passage."
      }],
      created_at: date(now),
      updated_at: date(now)
    }],
    questions: [
      placeholderQuestion(key, sectionIds.listening, "listening", 1, now, { audioId }),
      placeholderQuestion(key, sectionIds.reading, "reading", 1, now, { passageId }),
      placeholderQuestion(key, sectionIds.translation, "translation", 1, now, { subjective: true }),
      placeholderQuestion(key, sectionIds.writing, "writing", 1, now, { subjective: true })
    ]
  };
}

function sanitizeForSqlite(value) {
  if (Array.isArray(value)) return value.map(sanitizeForSqlite);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeForSqlite(item)]));
  }
  if (typeof value === "string") {
    return value.replace(/[\uD800-\uDFFF]/g, "?");
  }
  return value;
}

function placeholderQuestion(key, sectionId, sectionType, order, now, options = {}) {
  const subjective = Boolean(options.subjective);
  return {
    _id: oid(stableId(`${key}:question:${sectionType}:${order}`)),
    section_id: oid(sectionId),
    passage_id: options.passageId ? oid(options.passageId) : null,
    audio_file_id: options.audioId ? oid(options.audioId) : null,
    question_type: subjective ? "subjective" : "single_choice",
    order_index: order,
    question_text: {
      raw: `${sectionType} placeholder question. PDF parsing is pending; replace this item after structured extraction.`,
      html: ""
    },
    options: [],
    correct_answer: subjective ? { reference: "", rubric: [] } : null,
    explanation: {
      raw: "Minimal import placeholder. This record keeps the exam selectable while detailed questions are repaired later.",
      html: ""
    },
    audio_start_time: null,
    audio_end_time: null,
    transcript: "",
    passage_ref: options.passageId ? { passage_id: oid(options.passageId), paragraph_ids: ["P1"], evidence_text: "" } : {},
    tags: ["needs_pdf_parse", "minimal_import"],
    difficulty: 3,
    score: subjective ? 15 : 0,
    import_meta: {
      source_question_no: `${sectionType[0].toUpperCase()}P${order}`,
      confidence: 0.1,
      needs_review: true,
      import_mode: "minimal"
    },
    created_at: date(now),
    updated_at: date(now)
  };
}

function isCompletePaper(paper) {
  return Boolean(paper.completeness?.hasQuestion && paper.completeness?.hasAnswer && paper.completeness?.hasAudio);
}

function makePaperKey(paper) {
  return `${paper.level || paper.examType}:${paper.year}:${paper.month}:${paper.set_num || paper.paperNo}:past_exam`;
}

function stableId(seed) {
  return crypto.createHash("md5").update(String(seed)).digest("hex").slice(0, 24);
}

function oid(value) {
  return value ? { $oid: value } : null;
}

function date(value) {
  return { $date: value };
}

function paperLabel(paper) {
  return `${paper.year}-${paper.month} ${paper.level || paper.examType} set ${paper.set_num || paper.paperNo}`;
}

function pickPaper(paper) {
  return { paperId: paper.paperId, key: makePaperKey(paper), level: paper.level || paper.examType, year: paper.year, month: paper.month, set_num: paper.set_num || paper.paperNo };
}

function resolveRoot(...parts) {
  return path.resolve(projectRoot, ...parts.map(normalizeUserPath));
}

function normalizeUserPath(value) {
  return String(value || "").replace(/^file:\/\//i, "").replace(/%20/g, " ").replace(/\\/g, path.sep).replace(/\//g, path.sep);
}

function defaultPythonPath() {
  return process.platform === "win32"
    ? "C:/Users/liujinhao/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe"
    : "python3";
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}
