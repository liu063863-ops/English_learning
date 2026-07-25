import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createQuestionBankDataAccess } from "./questionBankDataAccess.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));

const config = {
  db: args.db || "auto",
  papersPath: args.papers || "backend/data/imported/cet_repo_papers.robust.json",
  output: args.output || "backend/data/reports/cet-db-import-check-report.json",
  mongoUri: args.mongo || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/english_exam",
  sqlitePath: args.sqlite || "backend/data/english_exam.db",
  python: args.python || process.env.PYTHON || defaultPythonPath()
};

const papers = JSON.parse(await fs.readFile(resolveRoot(config.papersPath), "utf8"));
const completePapers = papers.filter(isCompletePaper);
const incompletePapers = papers.filter((paper) => !isCompletePaper(paper));

const report = {
  generated_at: new Date().toISOString(),
  inputs: {
    papersPath: config.papersPath,
    db: config.db,
    sqlitePath: config.sqlitePath,
    mongoUri: maskMongoUri(config.mongoUri)
  },
  expected: {
    paperCount: papers.length,
    completePaperCount: completePapers.length,
    incompletePaperCount: incompletePapers.length,
    expectedImportedCount: completePapers.length
  },
  database: {
    selected: null,
    connected: false,
    examCount: 0,
    importedCompleteCount: 0,
    missingCompleteCount: completePapers.length
  },
  missingPapers: [],
  incompletePapers: incompletePapers.map(pickPaper),
  stats: null,
  verdict: "not_checked"
};

let db = null;
try {
  db = await createQuestionBankDataAccess({
    db: config.db,
    mongoUri: config.mongoUri,
    sqlitePath: config.sqlitePath,
    python: config.python
  });
  report.database.selected = db.type;
  report.database.connected = true;
  report.stats = await db.stats();
  const check = await db.checkExpected(papers);
  report.database.examCount = report.stats.counts?.exams || check.existing || 0;
  report.database.importedCompleteCount = Math.max(0, completePapers.length - (check.missing?.length || 0));
  report.database.missingCompleteCount = check.missing?.length || 0;
  report.missingPapers = completePapers.filter((paper) => (check.missing || []).includes(makePaperKey(paper))).map(pickPaper);
  report.verdict = report.database.missingCompleteCount === 0 ? "pass" : "needs_import_or_repair";
} catch (error) {
  report.verdict = "database_unavailable";
  report.error = error.message;
} finally {
  if (db) await db.close();
}

await writeReport(config.output, report);
console.log(JSON.stringify({
  ok: report.verdict === "pass",
  report: resolveRoot(config.output),
  verdict: report.verdict,
  database: report.database,
  expectedImportedCount: report.expected.expectedImportedCount,
  importedCompleteCount: report.database.importedCompleteCount,
  missingCompleteCount: report.database.missingCompleteCount
}, null, 2));
process.exitCode = report.verdict === "pass" ? 0 : 1;

function isCompletePaper(paper) {
  return Boolean(paper.completeness?.hasQuestion && paper.completeness?.hasAnswer && paper.completeness?.hasAudio);
}

function makePaperKey(paper) {
  return `${paper.level || paper.examType}:${paper.year}:${paper.month}:${paper.set_num || paper.paperNo}:past_exam`;
}

function pickPaper(paper) {
  return {
    paperId: paper.paperId,
    key: makePaperKey(paper),
    level: paper.level || paper.examType,
    year: paper.year,
    month: paper.month,
    set_num: paper.set_num || paper.paperNo,
    completeness: paper.completeness,
    warnings: paper.warnings || []
  };
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
