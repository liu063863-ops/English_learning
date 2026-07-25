import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createQuestionBankDataAccess } from "./questionBankDataAccess.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));

const config = {
  db: args.db || "auto",
  mongoUri: args.mongo || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/english_exam",
  sqlitePath: args.sqlite || "backend/data/english_exam.db",
  papersPath: args.papers || "backend/data/imported/cet_repo_papers.robust.json",
  extractedDir: args.extractedDir || "backend/data/extracted/robust-import",
  output: args.output || "backend/data/reports/cet-complete-import-report.json",
  python: args.python || process.env.PYTHON || defaultPythonPath(),
  apply: Boolean(args.apply),
  download: Boolean(args.download),
  limit: args.limit ? Number(args.limit) : Infinity
};

const papers = JSON.parse(await fs.readFile(resolveRoot(config.papersPath), "utf8"));
const completePapers = papers.filter(isCompletePaper).slice(0, config.limit);
const incompletePapers = papers.filter((paper) => !isCompletePaper(paper));
const report = {
  generated_at: new Date().toISOString(),
  mode: config.apply ? "apply" : "dry-run",
  database: { requested: config.db, selected: null },
  inputs: {
    papersPath: config.papersPath,
    extractedDir: config.extractedDir,
    sqlitePath: config.sqlitePath,
    mongoUri: maskMongoUri(config.mongoUri),
    download: config.download
  },
  summary: {
    completePapers: completePapers.length,
    incompletePapers: incompletePapers.length,
    parsed: 0,
    insertedOrUpdated: 0,
    skippedExisting: 0,
    failed: 0
  },
  incompletePapers: incompletePapers.map(pickPaper),
  papers: []
};

let db = null;
try {
  if (config.apply) {
    db = await createQuestionBankDataAccess({
      db: config.db,
      mongoUri: config.mongoUri,
      sqlitePath: config.sqlitePath,
      python: config.python
    });
    report.database.selected = db.type;
    console.log(`Database backend: ${db.type}${db.sqlitePath ? ` (${db.sqlitePath})` : ""}`);
  }

  await fs.mkdir(resolveRoot(config.extractedDir), { recursive: true });

  for (const paper of completePapers) {
    const row = await processPaper(paper, db);
    report.papers.push(row);
    if (row.status === "failed") report.summary.failed += 1;
    if (row.parsed) report.summary.parsed += 1;
    if (row.action === "skipped_existing") report.summary.skippedExisting += 1;
    if (row.action === "imported") report.summary.insertedOrUpdated += 1;
  }
} finally {
  if (db) await db.close();
}

await writeReport(config.output, report);
console.log(JSON.stringify({ ok: report.summary.failed === 0, report: resolveRoot(config.output), database: report.database, summary: report.summary }, null, 2));
process.exitCode = report.summary.failed === 0 ? 0 : 1;

async function processPaper(paper, db) {
  const outputJson = resolveRoot(config.extractedDir, `${paper.paperId}.mongo-import.json`);
  const row = {
    paper: pickPaper(paper),
    parsed: false,
    outputJson,
    action: "planned",
    status: "planned",
    errors: []
  };

  try {
    let existing = null;
    if (config.apply && db) existing = await db.findExistingExam(paper);
    if (existing && await db.existingExamLooksComplete(existing)) {
      row.action = "skipped_existing";
      row.status = "success";
      return row;
    }

    if (!(await exists(outputJson))) {
      if (!config.download) {
        row.action = "needs_parse";
        row.status = "dry_run";
        row.errors.push("Parsed JSON is missing. Re-run with --download to parse PDF/audio assets.");
        return row;
      }
      await parsePaperToJson(paper, outputJson);
    }

    row.parsed = true;
    const payload = normalizePayload(JSON.parse(await fs.readFile(outputJson, "utf8")), paper);
    const validation = validateImportPayloadShape(payload);
    row.validation = validation;
    if (!validation.passed) {
      row.status = "failed";
      row.errors.push(...validation.errors.map((item) => item.message));
      return row;
    }

    if (!config.apply) {
      row.status = "dry_run";
      row.action = existing ? "would_update_existing" : "would_insert_exam";
      return row;
    }

    row.writeResult = await db.importPayload(payload);
    row.status = "success";
    row.action = "imported";
    return row;
  } catch (error) {
    row.status = "failed";
    row.errors.push(error.message);
    return row;
  }
}

async function parsePaperToJson(paper, outputJson) {
  const workDir = resolveRoot(config.extractedDir, "_downloads", paper.paperId);
  await fs.mkdir(workDir, { recursive: true });
  await copyOrDownloadAsset(paper.paperAssets.questionPdf || paper.paperAssets.questionDoc, path.join(workDir, "question.pdf"));
  await copyOrDownloadAsset(paper.paperAssets.answerAnalysisPdf, path.join(workDir, "answer.pdf"));
  await copyOrDownloadAsset(paper.paperAssets.audioMp3, path.join(workDir, "audio.mp3"));
  await runCommand(config.python, ["scripts/extract_cet_pdf.py", "--input", workDir, "--output", outputJson, "--copy-audio"]);
}

async function copyOrDownloadAsset(asset, target) {
  if (!asset) return;
  if (asset.localPath && await exists(asset.localPath)) {
    await fs.copyFile(asset.localPath, target);
    return;
  }
  const url = asset.rawUrl || asset.githubUrl || asset.path;
  if (!/^https?:\/\//i.test(url)) throw new Error(`Asset is not a downloadable URL: ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`);
  await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
}

function normalizePayload(payload, paper) {
  const stableExamId = stableObjectId(makePaperKey(paper));
  const exam = payload.exams?.[0] || {};
  payload.exams = [{
    ...exam,
    _id: oid(stableExamId),
    title: `${paper.year}-${paper.month} ${paper.level || paper.examType} Set ${paper.set_num || paper.paperNo}`,
    level: paper.level || paper.examType,
    year: paper.year,
    month: paper.month,
    set_num: paper.set_num || paper.paperNo,
    source: "past_exam",
    status: "published",
    source_meta: {
      ...(exam.source_meta || {}),
      provider: "DieDiDi/CET4-6-past-exam-paper",
      folder_path: paper.sourceFolders?.[0] || "",
      question_pdf_url: paper.paperAssets.questionPdf?.rawUrl || paper.paperAssets.questionDoc?.rawUrl || "",
      answer_pdf_url: paper.paperAssets.answerAnalysisPdf?.rawUrl || ""
    }
  }];

  payload.sections = ensureSections(payload.sections || [], stableExamId, paper);
  const sectionIdByType = new Map(payload.sections.map((section) => [section.section_type, idOf(section._id)]));

  payload.audio_files = (payload.audio_files?.length ? payload.audio_files : [makeAudio(paper, stableExamId, sectionIdByType.get("listening"))])
    .filter(Boolean)
    .map((audio, index) => ({
      ...audio,
      _id: oid(stableObjectId(`${makePaperKey(paper)}:audio:${index + 1}`)),
      exam_id: oid(stableExamId),
      section_id: oid(sectionIdByType.get("listening")),
      file_url: audio.file_url || paper.paperAssets.audioMp3?.rawUrl || paper.paperAssets.audioMp3?.localPath || "",
      source_meta: {
        ...(audio.source_meta || {}),
        file_name: paper.paperAssets.audioMp3?.fileName || "",
        github_url: paper.paperAssets.audioMp3?.githubUrl || "",
        raw_url: paper.paperAssets.audioMp3?.rawUrl || "",
        local_path: paper.paperAssets.audioMp3?.localPath || ""
      }
    }));

  payload.passages = (payload.passages || []).map((passage, index) => ({
    ...passage,
    _id: oid(stableObjectId(`${makePaperKey(paper)}:passage:${index + 1}`)),
    section_id: oid(sectionIdByType.get("reading")),
    order_index: passage.order_index || index + 1
  }));

  payload.questions = (payload.questions || []).map((question, index) => {
    const sectionType = inferSectionType(question, index);
    return {
      ...question,
      _id: oid(stableObjectId(`${makePaperKey(paper)}:question:${sectionType}:${question.order_index || index + 1}`)),
      section_id: oid(sectionIdByType.get(sectionType)),
      question_type: question.question_type === "fill_blank" ? "blank" : question.question_type,
      order_index: question.order_index || index + 1,
      audio_file_id: sectionType === "listening" ? payload.audio_files[0]?._id : null
    };
  });

  return payload;
}

function ensureSections(existingSections, examId, paper) {
  const byType = new Map(existingSections.map((section) => [section.section_type, section]));
  const defaults = [
    ["listening", "Listening Comprehension", 1, 35, 25],
    ["reading", "Reading Comprehension", 2, 35, 40],
    ["translation", "Translation", 3, 15, 30],
    ["writing", "Writing", 4, 15, 30]
  ];
  return defaults.map(([type, name, order, score, limit]) => ({
    ...(byType.get(type) || {}),
    _id: oid(stableObjectId(`${makePaperKey(paper)}:section:${type}`)),
    exam_id: oid(examId),
    section_type: type,
    section_name: byType.get(type)?.section_name || name,
    order_index: byType.get(type)?.order_index || order,
    total_score: byType.get(type)?.total_score || score,
    time_limit: byType.get(type)?.time_limit || limit
  }));
}

function makeAudio(paper, examId, sectionId) {
  const audio = paper.paperAssets.audioMp3;
  if (!audio) return null;
  return {
    _id: oid(stableObjectId(`${makePaperKey(paper)}:audio:1`)),
    exam_id: oid(examId),
    section_id: oid(sectionId),
    file_url: audio.rawUrl || audio.localPath || "",
    duration: 0,
    transcript_full: "",
    source_meta: { file_name: audio.fileName || "", github_url: audio.githubUrl || "", raw_url: audio.rawUrl || "", local_path: audio.localPath || "" }
  };
}

function inferSectionType(question, index) {
  if (question.section_type) return question.section_type;
  if (index < 25) return "listening";
  if (index < 55) return "reading";
  if (index === 55) return "translation";
  return "writing";
}

function validateImportPayloadShape(payload) {
  const errors = [];
  if (!payload.exams?.length) errors.push({ message: "Missing exams" });
  if (!payload.sections?.length) errors.push({ message: "Missing sections" });
  if (!payload.questions?.length) errors.push({ message: "Missing questions" });
  const sectionTypes = new Set((payload.sections || []).map((section) => section.section_type));
  for (const type of ["listening", "reading", "translation", "writing"]) {
    if (!sectionTypes.has(type)) errors.push({ message: `Missing section: ${type}` });
  }
  return { passed: errors.length === 0, errors };
}

function isCompletePaper(paper) {
  return Boolean(paper.completeness?.hasQuestion && paper.completeness?.hasAnswer && paper.completeness?.hasAudio);
}

function makePaperKey(paper) {
  return `${paper.level || paper.examType}:${paper.year}:${paper.month}:${paper.set_num || paper.paperNo}:past_exam`;
}

function pickPaper(paper) {
  return { paperId: paper.paperId, key: makePaperKey(paper), level: paper.level || paper.examType, year: paper.year, month: paper.month, set_num: paper.set_num || paper.paperNo, warnings: paper.warnings || [] };
}

function stableObjectId(seed) {
  return crypto.createHash("md5").update(String(seed)).digest("hex").slice(0, 24);
}

function oid(value) {
  if (!value) return null;
  if (typeof value === "object" && value.$oid) return value;
  return { $oid: String(value) };
}

function idOf(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.$oid || String(value);
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function runCommand(command, commandArgs) {
  return new Promise((resolve, reject) => {
    console.log(`$ ${quote(command)} ${commandArgs.map(quote).join(" ")}`);
    const child = spawn(command, commandArgs, { stdio: "inherit", cwd: projectRoot, shell: false });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function writeReport(file, payload) {
  await fs.mkdir(path.dirname(resolveRoot(file)), { recursive: true });
  await fs.writeFile(resolveRoot(file), JSON.stringify(payload, null, 2), "utf8");
}

function resolveRoot(...parts) {
  return path.resolve(projectRoot, ...parts);
}

function defaultPythonPath() {
  return process.platform === "win32"
    ? "C:/Users/liujinhao/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe"
    : "python3";
}

function maskMongoUri(value) {
  return String(value).replace(/\/\/([^:/]+):([^@]+)@/, "//$1:***@");
}

function quote(value) {
  const text = String(value);
  return /\s/.test(text) ? `"${text}"` : text;
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
