import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const sqlitePath = path.resolve(projectRoot, process.env.SQLITE_DB_PATH || "backend/data/english_exam.db");
const python = process.env.PYTHON || (
  process.platform === "win32"
    ? "C:/Users/liujinhao/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe"
    : "python3"
);

export async function listImportedExams(query = {}) {
  const result = await callSqlite("listExams", {
    filters: {
      status: "published",
      level: query.level || query.examType,
      year: query.year,
      month: query.month,
      keyword: query.keyword,
      page: query.page,
      pageSize: query.pageSize,
      set_num: query.set_num || query.setNum,
      yearMin: query.yearMin,
      yearMax: query.yearMax
    }
  });
  return { data: result.data || [], pagination: result.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
}

export async function getImportedExam(examId) {
  const sectionTypes = ["listening", "reading", "translation", "writing"];
  const sections = [];
  let exam = null;

  for (const sectionType of sectionTypes) {
    const result = await callSqlite("getExamSection", { examId, sectionType });
    if (!result.ok) continue;
    exam = result.data.exam;
    sections.push({
      ...result.data.section,
      questions: result.data.questions,
      passages: result.data.passages,
      audioFiles: result.data.audioFiles
    });
  }

  if (!exam) return null;
  return { ...exam, sections };
}

export async function getQuestionBankStats() {
  return callSqlite("stats");
}

function callSqlite(op, extra = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(projectRoot, "scripts", "sqliteQuestionBankBridge.py")], {
      cwd: projectRoot,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
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
        reject(new Error(`SQLite query failed with exit code ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout || "{}"));
      } catch (error) {
        reject(new Error(`SQLite query returned invalid JSON: ${error.message}`));
      }
    });
    child.stdin.end(JSON.stringify({ op, dbPath: sqlitePath, ...extra }));
  });
}
