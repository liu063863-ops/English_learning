import { spawn } from "node:child_process";
import path from "node:path";
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

export async function listWordBooks() {
  const result = await callVocabularyBridge("listBooks");
  return result.data || [];
}

export async function listVocabulary(filters = {}) {
  const result = await callVocabularyBridge("listWords", { filters });
  return result.data || [];
}

export async function reviewVocabularyWord(wordId, familiarity) {
  const result = await callVocabularyBridge("reviewWord", { wordId, familiarity });
  return result.data;
}

export async function importVocabularyWords(payload) {
  return callVocabularyBridge("importWords", payload);
}

export async function importVocabularyCsv(payload) {
  return callVocabularyBridge("importCsv", payload);
}

export async function getVocabularyStats() {
  const result = await callVocabularyBridge("stats");
  return result.data;
}

function callVocabularyBridge(op, extra = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(projectRoot, "scripts", "sqliteVocabularyBridge.py")], {
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
        reject(new Error(`Vocabulary SQLite query failed: ${stderr || stdout}`));
        return;
      }
      try {
        const result = JSON.parse(stdout || "{}");
        if (result.ok === false) reject(new Error(result.error || "Vocabulary operation failed"));
        else resolve(result);
      } catch (error) {
        reject(new Error(`Vocabulary SQLite returned invalid JSON: ${error.message}`));
      }
    });
    child.stdin.end(JSON.stringify({ op, dbPath: sqlitePath, ...extra }));
  });
}
