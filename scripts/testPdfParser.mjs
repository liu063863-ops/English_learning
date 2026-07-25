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
  papersPath: resolveRoot(args.papers || "backend/data/imported/cet_repo_papers.robust.json"),
  output: resolveRoot(args.output || "backend/data/reports/pdf-parser-test-report.json"),
  python: normalizeUserPath(args.python || process.env.PYTHON || defaultPythonPath()),
  timeoutMs: Number(args.timeout || 45_000)
};

const paper = await pickPaper();
const workDir = await prepareWorkDir(paper);
const pythonOutput = resolveRoot("backend/data/reports/pdf-parser-test-python-output.json");

const report = {
  generated_at: new Date().toISOString(),
  paper: {
    paperId: paper.paperId,
    level: paper.level || paper.examType,
    year: paper.year,
    month: paper.month,
    set_num: paper.set_num || paper.paperNo,
    assets: {
      question: paper.paperAssets?.questionPdf?.localPath || paper.paperAssets?.questionPdf?.rawUrl || paper.paperAssets?.questionDoc?.localPath || "",
      answer: paper.paperAssets?.answerAnalysisPdf?.localPath || paper.paperAssets?.answerAnalysisPdf?.rawUrl || "",
      audio: paper.paperAssets?.audioMp3?.localPath || paper.paperAssets?.audioMp3?.rawUrl || ""
    }
  },
  python: null,
  node: null,
  recommendation: null
};

report.python = await runPythonParser(workDir, pythonOutput);
report.node = await testNodeParserAvailability();
report.recommendation = recommend(report);

await fs.mkdir(path.dirname(config.output), { recursive: true });
await fs.writeFile(config.output, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ ok: true, report: config.output, recommendation: report.recommendation, python: report.python.summary, node: report.node.summary }, null, 2));

async function pickPaper() {
  const papers = JSON.parse(await fs.readFile(config.papersPath, "utf8"));
  const complete = papers.filter((item) => item.completeness?.hasQuestion && item.completeness?.hasAnswer && item.completeness?.hasAudio);
  if (!complete.length) throw new Error("No complete paper found.");
  for (const paper of complete) {
    const localDir = resolveRoot("backend/data/extracted/robust-import/_downloads", paper.paperId);
    if (await exists(path.join(localDir, "question.pdf"))) return paper;
  }
  return complete[0];
}

async function prepareWorkDir(paper) {
  const dir = resolveRoot("backend/data/reports/pdf-parser-test-input");
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  await copyAsset(paper.paperAssets?.questionPdf || paper.paperAssets?.questionDoc, path.join(dir, "question.pdf"), paper.paperId);
  await copyAsset(paper.paperAssets?.answerAnalysisPdf, path.join(dir, "answer.pdf"), paper.paperId);
  await copyAsset(paper.paperAssets?.audioMp3, path.join(dir, "audio.mp3"), paper.paperId);
  return dir;
}

async function copyAsset(asset, target, paperId) {
  if (!asset) return;
  const localDownload = path.join(path.dirname(target), path.basename(target));
  const paperDownload = resolveRoot("backend/data/extracted/robust-import/_downloads", paperId, path.basename(target));
  if (await exists(localDownload)) return;
  if (await exists(paperDownload)) {
    await fs.copyFile(paperDownload, target);
    return;
  }
  if (asset.localPath && await exists(asset.localPath)) {
    await fs.copyFile(asset.localPath, target);
    return;
  }
  const url = asset.rawUrl || asset.githubUrl;
  if (!/^https?:\/\//i.test(url || "")) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.warn(`Asset download skipped: ${url} (${error.message})`);
  } finally {
    clearTimeout(timer);
  }
}

async function runPythonParser(inputDir, outputPath) {
  const started = Date.now();
  const result = await runCommand(config.python, [
    "scripts/extract_cet_pdf.py",
    "--input", inputDir,
    "--output", outputPath,
    "--copy-audio"
  ], config.timeoutMs);
  let parsed = null;
  try {
    parsed = JSON.parse(await fs.readFile(outputPath, "utf8"));
  } catch {
    parsed = null;
  }
  return {
    ...result,
    elapsedMs: Date.now() - started,
    output: outputPath,
    summary: {
      exitCode: result.code,
      timedOut: result.timedOut,
      outputExists: Boolean(parsed),
      exams: parsed?.exams?.length || 0,
      sections: parsed?.sections?.length || 0,
      passages: parsed?.passages?.length || 0,
      questions: parsed?.questions?.length || 0,
      warnings: parsed?.extract_meta?.warnings || []
    }
  };
}

async function testNodeParserAvailability() {
  const result = await runCommand(process.execPath, ["-e", "import('pdf-parse').then(()=>console.log('pdf-parse OK')).catch(e=>{console.error(e.message); process.exit(1)})"], 10_000);
  return {
    ...result,
    summary: {
      available: result.code === 0,
      reason: result.code === 0 ? "pdf-parse is available" : "pdf-parse is not installed/resolvable"
    }
  };
}

function recommend(payload) {
  if (payload.python?.summary?.outputExists && payload.python.summary.questions > 0) {
    return {
      plan: "A",
      reason: "Python parser produced structured JSON. Continue with the repaired Python parser plus timeout runner.",
    };
  }
  if (payload.node?.summary?.available) {
    return {
      plan: "B",
      reason: "Python did not produce useful output, and Node pdf-parse is available for a replacement parser.",
    };
  }
  return {
    plan: "C",
    reason: "Automatic text extraction failed and Node parser dependency is unavailable. Use placeholder import plus manual/AI review.",
  };
}

function runCommand(command, commandArgs, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"], shell: false });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ code: 124, timedOut: true, stdout, stderr, error: `Timed out after ${Math.round(timeoutMs / 1000)}s` });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); process.stderr.write(chunk); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: 1, timedOut: false, stdout, stderr, error: error.message });
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, timedOut: false, stdout, stderr, error: code === 0 ? "" : stderr || stdout });
    });
  });
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function resolveRoot(...parts) {
  return path.resolve(projectRoot, ...parts.map(normalizeUserPath));
}

function normalizeUserPath(value) {
  return String(value || "").replace(/^file:\/\//i, "").replace(/%20/g, " ").replace(/\\/g, path.sep).replace(/\//g, path.sep);
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
