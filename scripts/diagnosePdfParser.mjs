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
  reportPath: resolveRoot(args.output || "backend/data/reports/pdf-parser-diagnosis.json"),
  python: normalizeUserPath(args.python || process.env.PYTHON || defaultPythonPath()),
  timeoutMs: Number(args.timeout || 20_000),
  paperId: args.paperId || ""
};

const paper = await selectPaper();
const questionPdf = await resolvePdfPath(paper, "question");
const answerPdf = await resolvePdfPath(paper, "answer");
const report = {
  generated_at: new Date().toISOString(),
  paper: pickPaper(paper),
  files: { questionPdf, answerPdf },
  steps: []
};

console.log("=== PDF Parser Diagnosis ===");
console.log(`Paper: ${paperLabel(paper)}`);
console.log(`Question PDF: ${questionPdf || "(not found)"}`);
console.log(`Answer PDF: ${answerPdf || "(not found)"}`);

if (!questionPdf) {
  report.verdict = "question_pdf_missing";
  await writeReport(report);
  process.exit(1);
}

await step("python dependency check", pythonDependencyCode());
await step("pdfplumber open question PDF", pdfplumberOpenCode(questionPdf));
await step("pypdf open question PDF", pypdfOpenCode(questionPdf));
await step("pdfplumber extract first page", pdfplumberExtractPageCode(questionPdf, 0));
await step("pdfplumber extract first 3 pages", pdfplumberExtractPagesCode(questionPdf, 3));
await step("pypdf extract first 3 pages", pypdfExtractPagesCode(questionPdf, 3));
if (answerPdf) {
  await step("pdfplumber open answer PDF", pdfplumberOpenCode(answerPdf));
  await step("pdfplumber extract answer first page", pdfplumberExtractPageCode(answerPdf, 0));
}

report.verdict = buildVerdict(report.steps);
await writeReport(report);
console.log("\nDiagnosis complete.");
console.log(`Verdict: ${report.verdict}`);
console.log(`Report: ${config.reportPath}`);
process.exitCode = report.verdict.includes("timeout") ? 1 : 0;

async function step(name, code) {
  console.log(`\n--- ${name} ---`);
  const started = Date.now();
  const result = await runPython(code, config.timeoutMs);
  const row = {
    name,
    status: result.timedOut ? "timeout" : result.code === 0 ? "ok" : "failed",
    durationMs: Date.now() - started,
    code: result.code,
    timedOut: result.timedOut,
    stdout: result.stdout.slice(0, 4000),
    stderr: result.stderr.slice(0, 4000),
    error: result.error || ""
  };
  report.steps.push(row);
  console.log(JSON.stringify({
    status: row.status,
    durationMs: row.durationMs,
    error: row.error || undefined,
    stdout: row.stdout ? row.stdout.slice(0, 800) : undefined,
    stderr: row.stderr ? row.stderr.slice(0, 800) : undefined
  }, null, 2));
}

function runPython(code, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(config.python, ["-c", code], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ code: 124, timedOut: true, stdout, stderr, error: `timeout after ${Math.round(timeoutMs / 1000)}s` });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
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
      resolve({ code: code ?? 1, timedOut: false, stdout, stderr, error: code === 0 ? "" : `exit ${code}` });
    });
  });
}

function pythonDependencyCode() {
  return [
    "import importlib, json, sys",
    "mods=['pdfplumber','pypdf','PIL','pdfminer']",
    "out={'python':sys.version,'modules':{}}",
    "for m in mods:",
    "    try:",
    "        importlib.import_module(m); out['modules'][m]='OK'",
    "    except Exception as e:",
    "        out['modules'][m]=type(e).__name__+': '+str(e)",
    "print(json.dumps(out, ensure_ascii=False))"
  ].join("\n");
}

function pdfplumberOpenCode(file) {
  return [
    "import json, time, pdfplumber",
    `file=${JSON.stringify(file)}`,
    "t=time.perf_counter()",
    "with pdfplumber.open(file) as pdf:",
    "    out={'pages':len(pdf.pages),'elapsed':round(time.perf_counter()-t,3)}",
    "print(json.dumps(out, ensure_ascii=False))"
  ].join("\n");
}

function pypdfOpenCode(file) {
  return [
    "import json, time",
    "from pypdf import PdfReader",
    `file=${JSON.stringify(file)}`,
    "t=time.perf_counter()",
    "reader=PdfReader(file)",
    "out={'pages':len(reader.pages),'encrypted':bool(getattr(reader,'is_encrypted',False)),'elapsed':round(time.perf_counter()-t,3)}",
    "print(json.dumps(out, ensure_ascii=False))"
  ].join("\n");
}

function pdfplumberExtractPageCode(file, pageIndex) {
  return [
    "import json, time, pdfplumber",
    `file=${JSON.stringify(file)}`,
    `page_index=${pageIndex}`,
    "with pdfplumber.open(file) as pdf:",
    "    t=time.perf_counter()",
    "    text=pdf.pages[page_index].extract_text(x_tolerance=1, y_tolerance=3) or ''",
    "    out={'page':page_index+1,'chars':len(text),'elapsed':round(time.perf_counter()-t,3),'preview':text[:300]}",
    "print(json.dumps(out, ensure_ascii=False))"
  ].join("\n");
}

function pdfplumberExtractPagesCode(file, count) {
  return [
    "import json, time, pdfplumber",
    `file=${JSON.stringify(file)}`,
    `count=${count}`,
    "rows=[]",
    "with pdfplumber.open(file) as pdf:",
    "    for i,page in enumerate(pdf.pages[:count]):",
    "        t=time.perf_counter()",
    "        text=page.extract_text(x_tolerance=1, y_tolerance=3) or ''",
    "        rows.append({'page':i+1,'chars':len(text),'elapsed':round(time.perf_counter()-t,3),'preview':text[:120]})",
    "print(json.dumps({'rows':rows}, ensure_ascii=False))"
  ].join("\n");
}

function pypdfExtractPagesCode(file, count) {
  return [
    "import json, time",
    "from pypdf import PdfReader",
    `file=${JSON.stringify(file)}`,
    `count=${count}`,
    "reader=PdfReader(file)",
    "rows=[]",
    "for i,page in enumerate(reader.pages[:count]):",
    "    t=time.perf_counter()",
    "    text=page.extract_text() or ''",
    "    rows.append({'page':i+1,'chars':len(text),'elapsed':round(time.perf_counter()-t,3),'preview':text[:120]})",
    "print(json.dumps({'rows':rows}, ensure_ascii=False))"
  ].join("\n");
}

async function selectPaper() {
  const papers = JSON.parse(await fs.readFile(config.papersPath, "utf8"));
  const complete = papers.filter((item) => item.completeness?.hasQuestion && item.completeness?.hasAnswer && item.completeness?.hasAudio);
  if (config.paperId) {
    const matched = complete.find((item) => item.paperId === config.paperId);
    if (!matched) throw new Error(`paperId not found: ${config.paperId}`);
    return matched;
  }
  return complete.find((item) => item.paperId?.includes("2023")) || complete[0];
}

async function resolvePdfPath(paper, kind) {
  const asset = kind === "question"
    ? paper.paperAssets?.questionPdf || paper.paperAssets?.questionDoc
    : paper.paperAssets?.answerAnalysisPdf;
  const localDownloaded = resolveRoot("backend/data/extracted/robust-import/_downloads", paper.paperId, kind === "question" ? "question.pdf" : "answer.pdf");
  if (await exists(localDownloaded)) return localDownloaded;
  if (asset?.localPath && await exists(asset.localPath)) return asset.localPath;
  return "";
}

function buildVerdict(steps) {
  const timeout = steps.find((item) => item.status === "timeout");
  if (timeout) return `timeout_at_${timeout.name.replace(/\s+/g, "_")}`;
  const failed = steps.find((item) => item.status === "failed");
  if (failed) return `failed_at_${failed.name.replace(/\s+/g, "_")}`;
  const extracted = steps.filter((item) => item.name.includes("extract")).some((item) => /"chars":\s*[1-9]/.test(item.stdout));
  return extracted ? "text_extractable" : "image_or_empty_pdf";
}

async function writeReport(payload) {
  await fs.mkdir(path.dirname(config.reportPath), { recursive: true });
  await fs.writeFile(config.reportPath, JSON.stringify(payload, null, 2), "utf8");
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function paperLabel(paper) {
  return `${paper.year}-${paper.month} ${paper.level || paper.examType} set ${paper.set_num || paper.paperNo} (${paper.paperId})`;
}

function pickPaper(paper) {
  return { paperId: paper.paperId, year: paper.year, month: paper.month, level: paper.level || paper.examType, set_num: paper.set_num || paper.paperNo };
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
