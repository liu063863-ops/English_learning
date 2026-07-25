import fs from "node:fs/promises";
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
  db: args.db || "sqlite",
  sqlitePath: normalizeRelativePath(args.sqlite || "backend/data/english_exam.db"),
  papersPath: normalizeRelativePath(args.papers || "backend/data/imported/cet_repo_papers.robust.json"),
  reportsDir: normalizeRelativePath(args.reportsDir || "backend/data/reports"),
  tempDir: normalizeRelativePath(args.tempDir || "backend/data/imported/_timeout_batches"),
  python: normalizeUserPath(args.python || process.env.PYTHON || defaultPythonPath()),
  batchSize: Number(args.batchSize || args["batch-size"] || 10),
  timeoutMs: Number(args.timeoutMs || args.timeout || 60_000),
  yes: Boolean(args.yes),
  retryFailed: Boolean(args.retryFailed),
  skipDownload: Boolean(args.skipDownload),
  startAt: args.startAt ? Number(args.startAt) : 1
};

const statePath = resolveRoot(config.reportsDir, "timeout-import-state.json");
const reportPath = resolveRoot(config.reportsDir, "timeout-import-report.json");
const logPath = resolveRoot(config.reportsDir, "timeout-import-errors.log");

try {
  await main();
} catch (error) {
  console.error(`\nImport runner failed: ${error.message}`);
  process.exitCode = 1;
}

async function main() {
  await fs.mkdir(resolveRoot(config.reportsDir), { recursive: true });
  await fs.mkdir(resolveRoot(config.tempDir), { recursive: true });

  const allPapers = JSON.parse(await fs.readFile(resolveRoot(config.papersPath), "utf8"));
  const completePapers = allPapers.filter(isCompletePaper);
  if (!completePapers.length) throw new Error("No complete papers found in scanner output.");

  const state = await loadState();
  const startedAt = Date.now();
  const queue = completePapers.filter((paper, index) => shouldProcessPaper(state, paper, index));

  console.log("=== CET SQLite Import With Timeout ===");
  console.log(`Project root: ${projectRoot}`);
  console.log(`SQLite: ${resolveRoot(config.sqlitePath)}`);
  console.log(`Complete papers: ${completePapers.length}`);
  console.log(`Pending this run: ${queue.length}`);
  console.log(`Batch size: ${config.batchSize}`);
  console.log(`Timeout per paper: ${Math.round(config.timeoutMs / 1000)}s`);
  console.log(`Resume state: ${statePath}`);

  if (!queue.length) {
    console.log("Nothing to import. Run verifyImport.mjs to confirm database status.");
    return;
  }

  let processedThisRun = 0;
  for (let offset = 0; offset < queue.length; offset += config.batchSize) {
    const batch = queue.slice(offset, offset + config.batchSize);
    const batchNo = Math.floor(offset / config.batchSize) + 1;
    const batchTotal = Math.ceil(queue.length / config.batchSize);
    console.log(`\n--- Batch ${batchNo}/${batchTotal}: ${batch.length} papers ---`);

    for (const paper of batch) {
      processedThisRun += 1;
      const globalIndex = completePapers.findIndex((item) => item.paperId === paper.paperId) + 1;
      const elapsedMs = Date.now() - startedAt;
      const avgMs = processedThisRun > 1 ? elapsedMs / (processedThisRun - 1) : config.timeoutMs;
      const remaining = queue.length - processedThisRun + 1;
      console.log(`\n[${globalIndex}/${completePapers.length}] ${paperLabel(paper)}`);
      console.log(`ETA: ${formatDuration(avgMs * remaining)} remaining`);

      const result = await importOnePaper(paper, globalIndex);
      state.papers[paper.paperId] = {
        paperId: paper.paperId,
        key: makePaperKey(paper),
        label: paperLabel(paper),
        status: result.ok ? "success" : "failed",
        finishedAt: new Date().toISOString(),
        durationMs: result.durationMs,
        report: result.report,
        error: result.error || null,
        exitCode: result.code,
        timedOut: result.timedOut
      };
      state.updatedAt = new Date().toISOString();
      await writeJson(statePath, state);
      await writeSummaryReport(state, completePapers);

      if (result.ok) console.log(`OK: imported ${paperLabel(paper)} in ${formatDuration(result.durationMs)}`);
      else {
        console.log(`FAILED: ${paperLabel(paper)} - ${result.error}`);
        await fs.appendFile(logPath, `[${new Date().toISOString()}] ${paperLabel(paper)} ${result.error}\n`, "utf8");
      }
    }

    await runBatchVerification(batchNo);
    if (offset + config.batchSize < queue.length && !config.yes) {
      const keepGoing = await askYesNo(`Batch ${batchNo} finished. Continue next batch? (y/n) `);
      if (!keepGoing) {
        console.log("Paused by user. Re-run this script later to resume.");
        break;
      }
    }
  }

  console.log("\nImport run finished.");
  console.log(`State: ${statePath}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Errors: ${logPath}`);
}

async function importOnePaper(paper, index) {
  const tempPapersPath = resolveRoot(config.tempDir, `${String(index).padStart(3, "0")}-${sanitizeFileName(paper.paperId)}.json`);
  const outputReport = resolveRoot(config.reportsDir, `timeout-paper-${String(index).padStart(3, "0")}-${sanitizeFileName(paper.paperId)}.json`);
  await writeJson(tempPapersPath, [paper]);

  const scriptArgs = [
    "scripts/importCompleteCetPapers.mjs",
    "--db", config.db,
    "--sqlite", config.sqlitePath,
    "--python", config.python,
    "--papers", tempPapersPath,
    "--output", outputReport,
    "--apply"
  ];
  if (!config.skipDownload) scriptArgs.push("--download");

  const started = Date.now();
  const result = await runCommandWithTimeout(process.execPath, scriptArgs, config.timeoutMs);
  return {
    ...result,
    ok: result.code === 0 && !result.timedOut,
    durationMs: Date.now() - started,
    report: outputReport
  };
}

function runCommandWithTimeout(command, commandArgs, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: { ...process.env, PYTHON: config.python }
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ code: 124, timedOut: true, error: `Timed out after ${Math.round(timeoutMs / 1000)}s`, stdout, stderr });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: 1, timedOut: false, error: error.message, stdout, stderr });
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const error = code === 0 ? "" : extractUsefulError(stdout, stderr) || `Exited with code ${code}`;
      resolve({ code, timedOut: false, error, stdout, stderr });
    });
  });
}

async function runBatchVerification(batchNo) {
  console.log(`\nVerifying after batch ${batchNo}...`);
  await runCommandWithTimeout(process.execPath, [
    "scripts/verifyImport.mjs",
    "--sqlite", config.sqlitePath,
    "--python", config.python,
    "--papers", config.papersPath,
    "--failed-report", reportPath,
    "--output", resolveRoot(config.reportsDir, `timeout-verify-batch-${batchNo}.json`)
  ], 30_000);
}

function shouldProcessPaper(state, paper, index) {
  if (index + 1 < config.startAt) return false;
  const previous = state.papers[paper.paperId];
  if (!previous) return true;
  if (previous.status === "success") return false;
  return config.retryFailed;
}

async function loadState() {
  try {
    const state = JSON.parse(await fs.readFile(statePath, "utf8"));
    return { papers: {}, ...state };
  } catch {
    return {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      papers: {}
    };
  }
}

async function writeSummaryReport(state, completePapers) {
  const rows = Object.values(state.papers);
  const report = {
    generated_at: new Date().toISOString(),
    expected: completePapers.length,
    succeeded: rows.filter((row) => row.status === "success").length,
    failed: rows.filter((row) => row.status === "failed").length,
    pending: completePapers.length - rows.filter((row) => row.status === "success").length,
    failedPapers: rows.filter((row) => row.status === "failed"),
    papers: rows
  };
  await writeJson(reportPath, report);
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

function extractUsefulError(stdout, stderr) {
  const text = `${stderr}\n${stdout}`.trim();
  const lines = text.split(/\r?\n/).filter(Boolean);
  return lines.slice(-8).join("\n");
}

function isCompletePaper(paper) {
  return Boolean(paper.completeness?.hasQuestion && paper.completeness?.hasAnswer && paper.completeness?.hasAudio);
}

function makePaperKey(paper) {
  return `${paper.level || paper.examType}:${paper.year}:${paper.month}:${paper.set_num || paper.paperNo}:past_exam`;
}

function paperLabel(paper) {
  return `${paper.year}-${paper.month} ${paper.level || paper.examType} set ${paper.set_num || paper.paperNo} (${paper.paperId})`;
}

function sanitizeFileName(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, "_").slice(0, 100);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

async function writeJson(file, payload) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(payload, null, 2), "utf8");
}

function resolveRoot(...parts) {
  return path.resolve(projectRoot, ...parts.map(normalizeUserPath));
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
