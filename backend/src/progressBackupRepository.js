import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const sqlitePath = path.resolve(projectRoot, process.env.SQLITE_DB_PATH || process.env.DB_PATH || "backend/data/english_exam.db");
const bridgePath = path.join(projectRoot, "scripts", "sqliteProgressBridge.py");
const pythonPath = process.env.PYTHON_PATH || "python";

export async function exportSqliteProgress() {
  return callBridge("export", {});
}

export async function importSqliteProgress(progress) {
  return callBridge("import", { progress });
}

function callBridge(op, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, [bridgePath], {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`SQLite progress bridge timed out for op=${op}`));
    }, 30000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr || stdout || `SQLite progress bridge exited with code ${code}`));
        return;
      }
      try {
        const result = JSON.parse(stdout || "{}");
        if (!result.ok) reject(new Error(result.error || "SQLite progress bridge failed"));
        else resolve(result.data);
      } catch (error) {
        reject(new Error(`Invalid SQLite progress bridge output: ${error.message}`));
      }
    });

    child.stdin.end(JSON.stringify({ dbPath: sqlitePath, op, ...payload }));
  });
}
