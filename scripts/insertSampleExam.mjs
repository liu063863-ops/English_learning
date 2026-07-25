import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const sqlitePath = path.resolve(projectRoot, "backend/data/english_exam.db");
const python = process.env.PYTHON || defaultPythonPath();
const inputPath = resolveRoot(process.argv[2] || "backend/data/generated/sample-cet4-2023-06-set1.json");

const payload = JSON.parse(await fs.readFile(inputPath, "utf8"));
const result = await callBridge("replacePayload", { payload });

console.log(JSON.stringify({
  ok: true,
  input: inputPath,
  database: sqlitePath,
  report: result.report
}, null, 2));

function callBridge(op, extra = {}) {
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
        reject(new Error(`Bridge failed with exit code ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout || "{}"));
      } catch (error) {
        reject(new Error(`Bridge returned invalid JSON: ${error.message}\n${stdout}\n${stderr}`));
      }
    });
    child.stdin.end(JSON.stringify({ op, dbPath: sqlitePath, ...extra }));
  });
}

function defaultPythonPath() {
  return process.platform === "win32"
    ? "C:/Users/liujinhao/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe"
    : "python3";
}

function resolveRoot(...parts) {
  return path.resolve(projectRoot, ...parts);
}
