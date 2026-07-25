import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));

const config = {
  sqlitePath: resolveRoot(args.sqlite || "backend/data/english_exam.db"),
  papersPath: resolveRoot(args.papers || "backend/data/imported/cet_repo_papers.robust.json"),
  output: resolveRoot(args.output || "backend/data/reports/sqlite-import-verification.json"),
  failedReport: args.failedReport || args["failed-report"] ? resolveRoot(args.failedReport || args["failed-report"]) : "",
  python: normalizeUserPath(args.python || process.env.PYTHON || defaultPythonPath()),
  sampleSize: Number(args.sampleSize || 3)
};

const papers = JSON.parse(await fs.readFile(config.papersPath, "utf8"));
const completePapers = papers.filter(isCompletePaper);
const stats = await sqlite("stats");
const listResult = await sqlite("listExams", { filters: { status: "published" } });
const exams = listResult.data || [];
const samples = exams.slice(0, config.sampleSize);
const sampleChecks = [];

for (const exam of samples) {
  sampleChecks.push(await verifyExam(exam));
}

const missingExpectedKeys = await findMissingExpectedKeys();
const failedImportReport = await readFailedImportReport();
const report = {
  generated_at: new Date().toISOString(),
  database: {
    type: "sqlite",
    path: config.sqlitePath
  },
  expected: {
    completePaperCount: completePapers.length
  },
  totals: {
    exams: stats.counts?.exams || 0,
    sections: stats.counts?.sections || 0,
    questions: stats.counts?.questions || 0,
    audioFiles: stats.counts?.audio_files || 0,
    passages: stats.counts?.passages || 0
  },
  byYear: stats.byYear || [],
  bySectionType: stats.bySectionType || [],
  missingExpectedCount: missingExpectedKeys.length,
  missingExpectedKeys,
  failedImportReport,
  sampleChecks,
  verdict: missingExpectedKeys.length === 0 && sampleChecks.every((item) => item.structureOk)
    ? "pass"
    : "needs_repair"
};

await fs.mkdir(path.dirname(config.output), { recursive: true });
await fs.writeFile(config.output, JSON.stringify(report, null, 2), "utf8");

console.log(JSON.stringify({
  ok: report.verdict === "pass",
  verdict: report.verdict,
  report: config.output,
  totals: report.totals,
  missingExpectedCount: report.missingExpectedCount,
  failedImportCount: report.failedImportReport.failedPapers.length,
  failedImportPapers: report.failedImportReport.failedPapers.map((item) => ({
    paperId: item.paperId,
    label: item.label,
    error: item.error,
    timedOut: item.timedOut
  })),
  sampleChecks: report.sampleChecks.map((item) => ({
    examId: item.examId,
    title: item.title,
    structureOk: item.structureOk,
    sectionQuestionCounts: item.sectionQuestionCounts,
    audioFiles: item.audioFiles,
    passages: item.passages
  }))
}, null, 2));

process.exitCode = report.verdict === "pass" ? 0 : 1;

async function verifyExam(exam) {
  const sectionTypes = ["listening", "reading", "translation", "writing"];
  const sectionQuestionCounts = {};
  let audioFiles = 0;
  let passages = 0;
  const missingSections = [];

  for (const sectionType of sectionTypes) {
    const section = await sqlite("getExamSection", { examId: exam._id, sectionType });
    if (!section.ok) {
      missingSections.push(sectionType);
      sectionQuestionCounts[sectionType] = 0;
      continue;
    }
    sectionQuestionCounts[sectionType] = section.data.questions?.length || 0;
    audioFiles += section.data.audioFiles?.length || 0;
    passages += section.data.passages?.length || 0;
  }

  return {
    examId: exam._id,
    title: exam.title,
    level: exam.level,
    year: exam.year,
    month: exam.month,
    set_num: exam.set_num,
    missingSections,
    sectionQuestionCounts,
    audioFiles,
    passages,
    structureOk: missingSections.length === 0
      && Object.values(sectionQuestionCounts).some((count) => count > 0)
      && audioFiles > 0
      && passages > 0
  };
}

async function findMissingExpectedKeys() {
  const result = await sqlite("checkExpected", { papers });
  return result.missing || [];
}

async function readFailedImportReport() {
  if (!config.failedReport) return { path: "", failedPapers: [] };
  try {
    const payload = JSON.parse(await fs.readFile(config.failedReport, "utf8"));
    return {
      path: config.failedReport,
      failedPapers: payload.failedPapers || []
    };
  } catch {
    return { path: config.failedReport, failedPapers: [] };
  }
}

function sqlite(op, extra = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.python, [resolveRoot("scripts/sqliteQuestionBankBridge.py")], {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`SQLite bridge failed with exit code ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout || "{}"));
      } catch (error) {
        reject(new Error(`SQLite bridge returned invalid JSON: ${error.message}`));
      }
    });
    child.stdin.end(JSON.stringify({ op, dbPath: config.sqlitePath, ...extra }));
  });
}

function isCompletePaper(paper) {
  return Boolean(paper.completeness?.hasQuestion && paper.completeness?.hasAnswer && paper.completeness?.hasAudio);
}

function resolveRoot(...parts) {
  return path.resolve(projectRoot, ...parts.map(normalizeUserPath));
}

function normalizeUserPath(value) {
  return String(value || "")
    .replace(/^file:\/\//i, "")
    .replace(/%20/g, " ")
    .replace(/\\/g, path.sep)
    .replace(/\//g, path.sep);
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
