import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
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
  yes: Boolean(args.yes),
  limit: args.limit ? Number(args.limit) : null
};

try {
  await main();
} catch (error) {
  console.error("\nImport stopped.");
  console.error(`Reason: ${error.message}`);
  printFixAdvice(error);
  process.exitCode = 1;
}

async function main() {
  console.log("=== Interactive CET Import ===");
  console.log(`Project root: ${projectRoot}`);

  await checkNode();
  await checkPython();
  const completeCount = await checkScannerOutput();
  const selectedDb = await chooseDatabase();
  console.log(`Database backend: ${selectedDb}`);
  if (selectedDb === "sqlite") console.log(`SQLite file: ${resolveFromRoot(config.sqlitePath)}`);

  console.log("\nStep 1/4: current database check");
  await runNodeScript("scripts/checkCetDatabaseImport.mjs", [
    "--db", selectedDb,
    "--mongo", config.mongoUri,
    "--sqlite", config.sqlitePath,
    "--python", config.python,
    "--papers", config.papers,
    "--output", joinReportPath("interactive-check-before.json")
  ], { allowFailure: true });

  console.log("\nStep 2/4: dry-run import");
  await runNodeScript("scripts/importCompleteCetPapers.mjs", buildImportArgs(selectedDb, false));
  const dryRun = await readJsonReport(joinReportPath("interactive-dry-run.json"));
  if (dryRun.summary?.failed > 0) {
    throw new Error(`Dry-run failed for ${dryRun.summary.failed} papers. See report: ${joinReportPath("interactive-dry-run.json")}`);
  }

  const shouldApply = config.yes || await askYesNo(`\nDry-run completed. ${completeCount} complete papers can be imported. Apply import now? (y/n) `);
  if (!shouldApply) {
    console.log("Canceled by user. No data was written.");
    return;
  }

  console.log("\nStep 3/4: apply idempotent import");
  await runNodeScript("scripts/importCompleteCetPapers.mjs", buildImportArgs(selectedDb, true));

  console.log("\nStep 4/4: verify import");
  await runNodeScript("scripts/verifyImport.mjs", [
    "--sqlite", config.sqlitePath,
    "--python", config.python,
    "--papers", config.papers,
    "--output", joinReportPath("interactive-verify-import.json")
  ], { allowFailure: true });

  console.log("\nDone.");
  console.log(`Dry-run report: ${joinReportPath("interactive-dry-run.json")}`);
  console.log(`Apply report: ${joinReportPath("interactive-apply.json")}`);
  console.log(`Verify report: ${joinReportPath("interactive-verify-import.json")}`);
}

function buildImportArgs(selectedDb, apply) {
  const scriptArgs = [
    "--db", selectedDb,
    "--mongo", config.mongoUri,
    "--sqlite", config.sqlitePath,
    "--python", config.python,
    "--papers", config.papers,
    "--output", joinReportPath(apply ? "interactive-apply.json" : "interactive-dry-run.json")
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
  const mongoReachable = await canConnect(config.mongoHost, config.mongoPort, 1200);
  if (mongoReachable) return "mongo";
  if (config.db === "mongo") throw new Error(`MongoDB is not reachable at ${config.mongoHost}:${config.mongoPort}`);
  console.log(`MongoDB unavailable at ${config.mongoHost}:${config.mongoPort}; using SQLite fallback.`);
  await ensureSqliteReady();
  return "sqlite";
}

async function ensureSqliteReady() {
  await fs.mkdir(path.dirname(resolveFromRoot(config.sqlitePath)), { recursive: true });
  await runPythonBridge({ op: "init", dbPath: resolveFromRoot(config.sqlitePath) });
}

async function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  console.log(`Node.js: ${process.version}`);
  if (major < 18) throw new Error("Node.js 18 or newer is required.");
}

async function checkPython() {
  if (!(await fileExists(config.python))) throw new Error(`Python executable not found: ${config.python}`);
  await runCommand(config.python, ["--version"]);
}

async function checkScannerOutput() {
  const raw = await fs.readFile(resolveFromRoot(config.papers), "utf8");
  const papers = JSON.parse(raw);
  const complete = papers.filter((paper) => paper.completeness?.hasQuestion && paper.completeness?.hasAnswer && paper.completeness?.hasAudio);
  console.log(`Scanner output: ${papers.length} papers, ${complete.length} complete papers.`);
  if (complete.length === 0) throw new Error("No complete papers found in scanner output.");
  return complete.length;
}

async function askYesNo(question) {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = String(await rl.question(question)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
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

async function runNodeScript(script, scriptArgs, options = {}) {
  return runCommand(process.execPath, [normalizeRelativePath(script), ...scriptArgs], options);
}

function runCommand(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`$ ${quote(command)} ${commandArgs.map(quote).join(" ")}`);
    const child = spawn(command, commandArgs, {
      cwd: projectRoot,
      stdio: "inherit",
      shell: false,
      env: { ...process.env, MONGODB_URI: config.mongoUri }
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || options.allowFailure) resolve({ code });
      else reject(new Error(`Command failed with exit code ${code}: ${command} ${commandArgs.join(" ")}`));
    });
  });
}

async function readJsonReport(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
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
  if (message.includes("Dry-run failed")) {
    console.error(`Open dry-run report: ${joinReportPath("interactive-dry-run.json")}`);
  } else if (message.includes("Python")) {
    console.error(`Current Python path: ${config.python}`);
    console.error('Use: node scripts/runImportInteractive.mjs --python "C:/path/to/python.exe"');
  } else {
    console.error(`Reports directory: ${resolveFromRoot(config.reportsDir)}`);
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
