import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = parseArgs(process.argv.slice(2));
const root = process.cwd();
const importedDir = path.resolve(root, args.imported || "backend/data/imported");
const extractedDir = path.resolve(root, args.extracted || "backend/data/extracted");
const logGlobs = [
  path.resolve(root, "backend/server-error.log"),
  path.resolve(root, "backend/server.err.log"),
  path.resolve(root, "backend/data/extracted/cet_pdf_extract.log"),
  path.resolve(root, args.log || "")
].filter((item) => item && !item.endsWith(root));
const output = path.resolve(root, args.output || "backend/data/reports/cet-import-root-cause-report.json");

const report = {
  generated_at: new Date().toISOString(),
  inputs: { importedDir, extractedDir, logs: logGlobs, output },
  priority_flow: [
    "A. 先看日志是否中途崩溃或异常退出",
    "C. 再看仓库文件是否被识别为试卷/音频/解析",
    "B. 再看解析输出是否题型缺失、题号不连续",
    "D. 再看 Mongo 导入 JSON 是否存在 Schema/唯一键冲突风险",
    "E. 最后看是否有覆盖、重复导入、数据清理痕迹"
  ],
  root_causes: {},
  evidence: {}
};

await fs.mkdir(path.dirname(output), { recursive: true });

report.root_causes.A_script_crash = await diagnoseScriptCrash(logGlobs);
report.root_causes.C_filename_match = await diagnoseFilenameMatch(importedDir);
report.root_causes.B_pdf_regex = await diagnosePdfRegex(extractedDir);
report.root_causes.D_database_write = await diagnoseDatabaseWrite(extractedDir);
report.root_causes.E_overwrite_delete = await diagnoseOverwriteDelete(root, extractedDir);
report.summary = summarize(report.root_causes);

await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ ok: true, output, summary: report.summary }, null, 2));

async function diagnoseScriptCrash(logPaths) {
  const patterns = [
    /error|exception|traceback|failed|crash|syntaxerror|validationerror|duplicate key|e11000/i,
    /FileNotFoundError|No question PDF found|Very little text extracted|No section headings found/i
  ];
  const hits = [];
  for (const file of logPaths) {
    if (!(await exists(file))) continue;
    const text = await fs.readFile(file, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (patterns.some((pattern) => pattern.test(line))) {
        hits.push({ file, line: index + 1, text: line.slice(0, 500) });
      }
    });
  }
  return {
    status: hits.length ? "suspected" : "not_detected",
    confidence: hits.length ? 0.82 : 0.2,
    evidence: hits.slice(0, 80),
    repair_template: "scripts/templates/importWithResume.template.mjs"
  };
}

async function diagnoseFilenameMatch(dir) {
  const assetsPath = path.join(dir, "cet_repo_assets.json");
  const papersPath = path.join(dir, "cet_repo_papers.json");
  if (!(await exists(assetsPath)) || !(await exists(papersPath))) {
    return {
      status: "unknown",
      confidence: 0.3,
      reason: "缺少 cet_repo_assets.json 或 cet_repo_papers.json，先运行仓库结构提取脚本",
      evidence: []
    };
  }

  const assets = JSON.parse(await fs.readFile(assetsPath, "utf8"));
  const papers = JSON.parse(await fs.readFile(papersPath, "utf8"));
  const unknownAssets = assets.filter((item) => !item.examType || !item.year || !item.month || !item.assetType || item.assetType === "other");
  const papersWithoutQuestion = papers.filter((item) => !item.paperAssets?.questionPdf && !item.paperAssets?.questionDoc);
  const papersWithoutAudio = papers.filter((item) => item.examType && !item.paperAssets?.audioMp3);
  const papersWithoutAnswer = papers.filter((item) => item.examType && !item.paperAssets?.answerAnalysisPdf);
  const mojibakePaths = assets.filter((item) => /�|鍥|绾|骞|鏈|棰|瑙|绛/.test(`${item.path} ${item.fileName}`));

  const suspicious = unknownAssets.length || papersWithoutQuestion.length || mojibakePaths.length;
  return {
    status: suspicious ? "suspected" : "not_detected",
    confidence: suspicious ? 0.9 : 0.25,
    counts: {
      assets: assets.length,
      papers: papers.length,
      unknownAssets: unknownAssets.length,
      papersWithoutQuestion: papersWithoutQuestion.length,
      papersWithoutAudio: papersWithoutAudio.length,
      papersWithoutAnswer: papersWithoutAnswer.length,
      mojibakePaths: mojibakePaths.length
    },
    evidence: {
      unknownAssets: unknownAssets.slice(0, 20).map(pickAssetEvidence),
      papersWithoutQuestion: papersWithoutQuestion.slice(0, 20).map(pickPaperEvidence),
      papersWithoutAudio: papersWithoutAudio.slice(0, 20).map(pickPaperEvidence),
      mojibakePaths: mojibakePaths.slice(0, 20).map(pickAssetEvidence)
    },
    repair_template: "scripts/templates/robustFilenameParser.template.mjs"
  };
}

async function diagnosePdfRegex(dir) {
  const files = await listFiles(dir, (file) => file.endsWith(".mongo-import.json"));
  const paperReports = [];
  for (const file of files) {
    const doc = JSON.parse(await fs.readFile(file, "utf8"));
    const questions = doc.questions || [];
    const sections = doc.sections || [];
    const sectionById = new Map(sections.map((section) => [oidToString(section._id), section]));
    const bySection = {};
    for (const question of questions) {
      const section = sectionById.get(oidToString(question.section_id));
      const type = section?.section_type || "unknown";
      bySection[type] ||= [];
      bySection[type].push(question);
    }
    const missingTypes = ["listening", "reading", "translation", "writing"].filter((type) => !bySection[type]?.length);
    const discontinuities = Object.entries(bySection).flatMap(([sectionType, rows]) => findDiscontinuities(sectionType, rows));
    const lowConfidence = questions.filter((item) => item.import_meta?.needs_review || Number(item.import_meta?.confidence || 1) < 0.72);
    const noOptions = questions.filter((item) => ["single_choice", "multiple_choice"].includes(item.question_type) && (!item.options || item.options.length < 2));
    const noAnswer = questions.filter((item) => item.correct_answer === null || item.correct_answer === undefined || item.correct_answer === "");
    paperReports.push({
      file,
      questionCount: questions.length,
      bySection: Object.fromEntries(Object.entries(bySection).map(([key, rows]) => [key, rows.length])),
      missingTypes,
      discontinuities,
      lowConfidence: lowConfidence.length,
      noOptions: noOptions.length,
      noAnswer: noAnswer.length
    });
  }

  const suspectedPapers = paperReports.filter((item) => item.missingTypes.length || item.discontinuities.length || item.noOptions || item.noAnswer);
  return {
    status: suspectedPapers.length ? "suspected" : "not_detected",
    confidence: suspectedPapers.length ? 0.86 : 0.25,
    counts: { extractedFiles: files.length, suspectedPapers: suspectedPapers.length },
    evidence: suspectedPapers.slice(0, 30),
    repair_template: "scripts/templates/pdfRegexDebug.template.py"
  };
}

async function diagnoseDatabaseWrite(dir) {
  const files = await listFiles(dir, (file) => file.endsWith(".mongo-import.json"));
  const issues = [];
  const examKeys = new Map();
  const ids = new Map();
  for (const file of files) {
    const doc = JSON.parse(await fs.readFile(file, "utf8"));
    for (const exam of doc.exams || []) {
      const key = `${exam.level}:${exam.year}:${exam.month}:${exam.set_num}:${exam.source}`;
      if (examKeys.has(key)) issues.push({ type: "duplicate_exam_key", key, files: [examKeys.get(key), file] });
      examKeys.set(key, file);
    }
    for (const collection of ["exams", "sections", "questions", "passages", "audio_files"]) {
      for (const row of doc[collection] || []) {
        const id = oidToString(row._id);
        if (!id) issues.push({ type: "missing_id", collection, file });
        if (ids.has(id)) issues.push({ type: "duplicate_object_id", id, files: [ids.get(id), file] });
        ids.set(id, file);
        if (collection === "questions") {
          if (!row.question_text?.raw) issues.push({ type: "schema_required_missing", field: "question_text.raw", file, id });
          if (!row.question_type) issues.push({ type: "schema_required_missing", field: "question_type", file, id });
          if (row.question_type === "blank") {
            issues.push({ type: "enum_compat_note", field: "question_type", value: "blank", file, id, note: "部分运行时代码可能使用 fill_blank，需要兼容" });
          }
        }
      }
    }
  }

  return {
    status: issues.some((item) => item.type !== "enum_compat_note") ? "suspected" : issues.length ? "warning" : "not_detected",
    confidence: issues.length ? 0.78 : 0.25,
    counts: { extractedFiles: files.length, issues: issues.length },
    evidence: issues.slice(0, 80),
    repair_template: "scripts/templates/mongoBulkImportSafe.template.mjs"
  };
}

async function diagnoseOverwriteDelete(projectRoot, extractedDir) {
  const scripts = await listFiles(path.join(projectRoot, "scripts"), (file) => /\.(mjs|js|py)$/.test(file));
  const suspiciousLines = [];
  for (const file of scripts) {
    const text = await fs.readFile(file, "utf8");
    text.split(/\r?\n/).forEach((line, index) => {
      if (/deleteMany|dropDatabase|remove\(|unlink|rm\s+-rf|writeFile|truncate|reset/i.test(line)) {
        suspiciousLines.push({ file, line: index + 1, text: line.trim().slice(0, 400) });
      }
    });
  }
  const extractedFiles = await listFiles(extractedDir, (file) => file.endsWith(".json"));
  const mtimes = [];
  for (const file of extractedFiles) {
    const stat = await fs.stat(file);
    mtimes.push({ file, mtime: stat.mtime.toISOString(), size: stat.size });
  }
  return {
    status: suspiciousLines.length ? "suspected" : "not_detected",
    confidence: suspiciousLines.length ? 0.6 : 0.2,
    evidence: { suspiciousLines: suspiciousLines.slice(0, 80), recentExtractedFiles: mtimes.sort((a, b) => b.mtime.localeCompare(a.mtime)).slice(0, 20) },
    repair_template: "scripts/templates/importAuditTrail.template.mjs"
  };
}

function summarize(rootCauses) {
  return Object.entries(rootCauses)
    .map(([key, value]) => ({ key, status: value.status, confidence: value.confidence }))
    .sort((a, b) => statusRank(b.status) - statusRank(a.status) || b.confidence - a.confidence);
}

function statusRank(status) {
  return { suspected: 3, warning: 2, unknown: 1, not_detected: 0 }[status] || 0;
}

function findDiscontinuities(sectionType, rows) {
  const nums = rows.map((item) => Number(item.order_index)).filter(Boolean).sort((a, b) => a - b);
  const gaps = [];
  for (let index = 1; index < nums.length; index += 1) {
    if (nums[index] !== nums[index - 1] + 1) gaps.push({ sectionType, after: nums[index - 1], before: nums[index] });
  }
  return gaps;
}

async function listFiles(dir, predicate) {
  if (!(await exists(dir))) return [];
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(full, predicate));
    if (entry.isFile() && predicate(full)) out.push(full);
  }
  return out;
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function oidToString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.$oid || String(value);
}

function pickAssetEvidence(item) {
  return { path: item.path, fileName: item.fileName, examType: item.examType, year: item.year, month: item.month, paperNo: item.paperNo, assetType: item.assetType };
}

function pickPaperEvidence(item) {
  return { paperId: item.paperId, examType: item.examType, year: item.year, month: item.month, paperNo: item.paperNo, sourceFolder: item.sourceFolder, assets: Object.keys(item.paperAssets || {}).filter((key) => item.paperAssets[key]) };
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}
