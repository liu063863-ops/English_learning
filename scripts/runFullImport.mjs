import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));

const config = {
  db: args.db || "auto",
  mongoUri: args.mongo || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/english_exam",
  mongoHost: args.mongoHost || "127.0.0.1",
  mongoPort: Number(args.mongoPort || 27017),
  sqlitePath: normalizeRelativePath(args.sqlite || "backend/data/english_exam.db"),
  python: normalizeUserPath(args.python || process.env.PYTHON || defaultPythonPath()),
  papers: normalizeRelativePath(args.papers || "backend/data/imported/cet_repo_papers.robust.json"),
  reportsDir: normalizeRelativePath(args.reportsDir || "backend/data/reports"),
  download: !args.skipDownload,
  limit: args.limit ? Number(args.limit) : null
};

const state = {
  startedAt: new Date().toISOString(),
  projectRoot,
  selectedDb: null,
  steps: [],
  ok: false
};

try {
  await run();
  state.ok = true;
  await writeRunReport();
  console.log("\nSUCCESS: full import flow finished.");
  console.log(`Database backend: ${state.selectedDb}`);
  if (state.selectedDb === "sqlite") console.log(`SQLite file: ${resolveFromRoot(config.sqlitePath)}`);
  console.log(`Reports: ${resolveFromRoot(config.reportsDir)}`);
} catch (error) {
  state.ok = false;
  state.error = { message: error.message, stack: error.stack };
  await writeRunReport();
  console.error("\nFAILED: full import flow stopped.");
  console.error(`Reason: ${error.message}`);
  printFixAdvice(error);
  process.exitCode = 1;
}

async function run() {
  console.log("=== CET Full Import Runner ===");
  console.log(`Project root: ${projectRoot}`);
  console.log(`Papers mapping: ${resolveFromRoot(config.papers)}`);
  console.log(`Python: ${config.python}`);

  await step("Environment check", async () => {
    await checkNode();
    await checkScannerOutput();
    await checkPython();
    state.selectedDb = await chooseDatabase();
    console.log(`Selected database: ${state.selectedDb}`);
  });

  await step("Check current database state", async () => {
    const result = await runNodeScript("scripts/checkCetDatabaseImport.mjs", [
      "--db", state.selectedDb,
      "--mongo", config.mongoUri,
      "--sqlite", config.sqlitePath,
      "--python", config.python,
      "--papers", config.papers,
      "--output", joinReportPath("cet-db-import-check-before.json")
    ], { allowFailure: true });
    if (result.code !== 0) console.log("Database is not fully imported yet. Continuing.");
  });

  await step("Dry-run import", async () => {
    await runNodeScript("scripts/importCompleteCetPapers.mjs", buildImportArgs(false));
  });

  await step("Apply idempotent import", async () => {
    await runNodeScript("scripts/importCompleteCetPapers.mjs", buildImportArgs(true));
  });

  await step("Final verification", async () => {
    await runNodeScript("scripts/checkCetDatabaseImport.mjs", [
      "--db", state.selectedDb,
      "--mongo", config.mongoUri,
      "--sqlite", config.sqlitePath,
      "--python", config.python,
      "--papers", config.papers,
      "--output", joinReportPath("cet-db-import-check-after.json")
    ], { allowFailure: true });
  });
}

function buildImportArgs(apply) {
  const scriptArgs = [
    "--db", state.selectedDb,
    "--mongo", config.mongoUri,
    "--sqlite", config.sqlitePath,
    "--python", config.python,
    "--papers", config.papers,
    "--output", joinReportPath(apply ? "cet-import-apply.json" : "cet-import-dry-run.json")
  ];
  if (apply) scriptArgs.push("--apply");
  if (config.download) scriptArgs.push("--download");
  if (config.limit) scriptArgs.push("--limit", String(config.limit));
  return scriptArgs;
}

async function chooseDatabase() {
  if (config.db === "sqlite") {
    await ensureSqliteReady();
    return "sqlite";
  }
  const mongoReachable = await canConnect(config.mongoHost, config.mongoPort, 1500);
  if (mongoReachable) {
    console.log(`MongoDB reachable at ${config.mongoHost}:${config.mongoPort}.`);
    return "mongo";
  }
  if (config.db === "mongo") {
    throw new Error(`MongoDB is not reachable at ${config.mongoHost}:${config.mongoPort}`);
  }
  console.log(`MongoDB unavailable at ${config.mongoHost}:${config.mongoPort}; falling back to SQLite.`);
  await ensureSqliteReady();
  return "sqlite";
}

async function ensureSqliteReady() {
  await fs.mkdir(path.dirname(resolveFromRoot(config.sqlitePath)), { recursive: true });
  await runPythonBridge({ op: "init", dbPath: resolveFromRoot(config.sqlitePath) });
}

function runPythonBridge(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.python, [resolveFromRoot("scripts/sqliteQuestionBankBridge.py")], {
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
      if (code !== 0) reject(new Error(`SQLite init failed: ${stderr || stdout}`));
      else resolve(stdout);
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

async function step(name, fn) {
  console.log(`\n--- ${name} ---`);
  const startedAt = Date.now();
  const record = { name, startedAt: new Date(startedAt).toISOString(), status: "running" };
  state.steps.push(record);
  try {
    await fn();
    record.status = "success";
    record.finishedAt = new Date().toISOString();
    record.durationMs = Date.now() - startedAt;
    console.log(`OK: ${name}`);
  } catch (error) {
    record.status = "failed";
    record.finishedAt = new Date().toISOString();
    record.durationMs = Date.now() - startedAt;
    record.error = error.message;
    throw error;
  }
}

async function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  console.log(`Node.js: ${process.version}`);
  if (major < 18) throw new Error("Node.js 18 or newer is required.");
}

async function checkScannerOutput() {
  const raw = await fs.readFile(resolveFromRoot(config.papers), "utf8").catch(() => null);
  if (!raw) throw new Error(`Scanner output not found: ${resolveFromRoot(config.papers)}. Run: node scripts/robustCetFileScanner.mjs`);
  const papers = JSON.parse(raw);
  const complete = papers.filter((paper) => paper.completeness?.hasQuestion && paper.completeness?.hasAnswer && paper.completeness?.hasAudio);
  console.log(`Scanner output: ${papers.length} papers, ${complete.length} complete papers.`);
  if (complete.length < 67) throw new Error(`Complete papers are fewer than 67. Current complete count: ${complete.length}.`);
}

async function checkPython() {
  const exists = await fileExists(config.python);
  if (!exists) throw new Error(`Python executable not found: ${config.python}`);
  const result = await runCommand(config.python, ["--version"], { allowFailure: true });
  if (result.code !== 0) throw new Error(`Python cannot be executed: ${config.python}`);
}

async function runNodeScript(script, scriptArgs, options = {}) {
  return runCommand(process.execPath, [normalizeRelativePath(script), ...scriptArgs], options);
}

function runCommand(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`$ ${quote(command)} ${commandArgs.map(quote).join(" ")}`);
    const child = spawn(command, commandArgs, { cwd: projectRoot, stdio: "inherit", shell: false, env: { ...process.env, MONGODB_URI: config.mongoUri } });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || options.allowFailure) resolve({ code });
      else reject(new Error(`Command failed with exit code ${code}: ${command} ${commandArgs.join(" ")}`));
    });
  });
}

function canConnect(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

async function writeRunReport() {
  const file = joinReportPath("cet-full-import-run-report.json");
  state.finishedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(state, null, 2), "utf8");
}

async function fileExists(file) {
  try {
    await fs.access(path.isAbsolute(file) ? file : resolveFromRoot(file));
    return true;
  } catch {
    return false;
  }
}

function printFixAdvice(error) {
  const message = error.message || "";
  console.error("\nFix advice:");
  if (message.includes("Python")) {
    console.error(`Check Python path: ${config.python}`);
    console.error('Or run: node scripts/runFullImport.mjs --python "C:/path/to/python.exe"');
  } else if (message.includes("Scanner output")) {
    console.error("Run: node scripts/robustCetFileScanner.mjs");
  } else if (message.includes("SQLite")) {
    console.error(`Check SQLite DB directory: ${path.dirname(resolveFromRoot(config.sqlitePath))}`);
    console.error("The SQLite fallback uses Python stdlib sqlite3, so no MongoDB install is required.");
  } else {
    console.error(`Main report: ${joinReportPath("cet-full-import-run-report.json")}`);
  }
}

function resolveFromRoot(...parts) {
  return path.resolve(projectRoot, ...parts.map(normalizeUserPath));
}

function joinReportPath(fileName) {
  return resolveFromRoot(config.reportsDir, fileName);
}

function normalizeRelativePath(value) {
  return normalizeUserPath(value).replace(/^[\\/]+/, "");
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
