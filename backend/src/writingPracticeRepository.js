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

export async function listTranslations(filters = {}) {
  const result = await callWritingBridge("listTranslations", { filters });
  return result.data || [];
}

export async function listWritings(filters = {}) {
  const result = await callWritingBridge("listWritings", { filters });
  return result.data || [];
}

export async function submitTranslationDraft(draft) {
  const result = await callWritingBridge("submitTranslation", { draft });
  return result.data;
}

export async function saveWritingDraft(draft) {
  const result = await callWritingBridge("saveWriting", { draft });
  return result.data;
}

function callWritingBridge(op, extra = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(projectRoot, "scripts", "sqliteWritingPracticeBridge.py")], {
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
        reject(new Error(`Writing practice query failed: ${stderr || stdout}`));
        return;
      }
      try {
        const result = JSON.parse(stdout || "{}");
        if (result.ok === false) reject(new Error(result.error || "Writing practice operation failed"));
        else resolve(result);
      } catch (error) {
        reject(new Error(`Writing practice returned invalid JSON: ${error.message}`));
      }
    });
    child.stdin.end(JSON.stringify({ op, dbPath: sqlitePath, ...extra }));
  });
}
