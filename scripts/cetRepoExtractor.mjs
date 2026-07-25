import fs from "node:fs/promises";
import path from "node:path";

const REPO = "DieDiDi/CET4-6-past-exam-paper";
const BRANCH = "main";
const TREE_API = `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`;
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;
const BLOB_BASE = `https://github.com/${REPO}/blob/${BRANCH}/`;

const outputDir = process.argv[2] || "backend/data/imported";
const tree = await fetchRepoTree();
const assets = tree
  .filter((item) => item.type === "blob")
  .filter((item) => item.path.startsWith("四六级历年真题汇总/"))
  .map(normalizeAsset)
  .filter(Boolean);

const papers = groupAssetsIntoPapers(assets);
const report = buildReport(papers, assets);

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, "cet_repo_assets.json"), JSON.stringify(assets, null, 2), "utf8");
await fs.writeFile(path.join(outputDir, "cet_repo_papers.json"), JSON.stringify(papers, null, 2), "utf8");
await fs.writeFile(path.join(outputDir, "cet_repo_report.json"), JSON.stringify(report, null, 2), "utf8");

const firstPaper = papers.find((paper) => paper.examType && paper.paperAssets.questionPdf);
if (firstPaper) {
  await fs.writeFile(
    path.join(outputDir, `${firstPaper.paperId}.structured.stub.json`),
    JSON.stringify(toStructuredStub(firstPaper), null, 2),
    "utf8"
  );
}

console.log(JSON.stringify({ outputDir, assets: assets.length, papers: papers.length, firstPaper: firstPaper?.paperId }, null, 2));

async function fetchRepoTree() {
  const response = await fetch(TREE_API, {
    headers: {
      "User-Agent": "english-exam-importer",
      Accept: "application/vnd.github+json"
    }
  });
  if (!response.ok) {
    throw new Error(`GitHub API failed: ${response.status} ${await response.text()}`);
  }
  const payload = await response.json();
  return payload.tree || [];
}

function normalizeAsset(item) {
  const fileName = item.path.split("/").at(-1);
  const ext = fileName.includes(".") ? fileName.split(".").at(-1).toLowerCase() : "";
  if (!["pdf", "mp3", "doc", "docx", "txt"].includes(ext)) return null;

  const meta = parsePathMeta(item.path);
  return {
    path: item.path,
    fileName,
    ext,
    size: item.size || 0,
    ...meta,
    assetType: classifyAsset(fileName, ext),
    rawUrl: RAW_BASE + encodePath(item.path),
    githubUrl: BLOB_BASE + encodePath(item.path)
  };
}

function parsePathMeta(filePath) {
  const parts = filePath.split("/");
  const yearMonthText = parts.find((part) => /\d{4}年/.test(part)) || "";
  const year = Number(yearMonthText.match(/(\d{4})年/)?.[1] || 0) || null;
  const month = Number(yearMonthText.match(/(\d{1,2})月/)?.[1] || 0) || null;
  const joined = parts.join(" ");
  const examType = /CET4|四级/i.test(joined) ? "CET4" : /CET6|六级/i.test(joined) ? "CET6" : null;
  const setMatch = joined.match(/第?([一二三123])套|全([一二三123])套|全([123])套/);
  const paperNo = normalizePaperNo(setMatch?.[1] || setMatch?.[2] || setMatch?.[3]);
  return { year, month, examType, paperNo, yearMonthText };
}

function normalizePaperNo(value) {
  if (!value) return null;
  return { 一: 1, 二: 2, 三: 3, "1": 1, "2": 2, "3": 3 }[value] || null;
}

function classifyAsset(fileName, ext) {
  if (ext === "mp3") return "audio";
  if (/解析|答案|详解/i.test(fileName)) return "answerAnalysis";
  if (/真题|题目|试题|可复制|PDF版/i.test(fileName)) return ext === "pdf" ? "questionPdf" : "questionDoc";
  if (ext === "txt") return "note";
  return "other";
}

function groupAssetsIntoPapers(assetRows) {
  const grouped = new Map();
  for (const asset of assetRows) {
    const key = [
      asset.examType || "UNKNOWN",
      asset.year || "unknown-year",
      asset.month || "unknown-month",
      asset.paperNo || "all"
    ].join("-");
    if (!grouped.has(key)) {
      grouped.set(key, {
        paperId: key.toLowerCase(),
        examType: asset.examType,
        year: asset.year,
        month: asset.month,
        paperNo: asset.paperNo,
        sourceFolder: asset.path.split("/").slice(0, -1).join("/"),
        paperAssets: {
          questionPdf: null,
          questionDoc: null,
          answerAnalysisPdf: null,
          audioMp3: null,
          notes: []
        },
        rawAssets: []
      });
    }
    const paper = grouped.get(key);
    paper.rawAssets.push(asset);
    if (asset.assetType === "questionPdf" && !paper.paperAssets.questionPdf) paper.paperAssets.questionPdf = asset;
    if (asset.assetType === "questionDoc" && !paper.paperAssets.questionDoc) paper.paperAssets.questionDoc = asset;
    if (asset.assetType === "answerAnalysis" && asset.ext === "pdf" && !paper.paperAssets.answerAnalysisPdf) {
      paper.paperAssets.answerAnalysisPdf = asset;
    }
    if (asset.assetType === "audio" && !paper.paperAssets.audioMp3) paper.paperAssets.audioMp3 = asset;
    if (asset.assetType === "note") paper.paperAssets.notes.push(asset);
  }
  return [...grouped.values()].sort((a, b) => (a.examType || "").localeCompare(b.examType || "") || (b.year || 0) - (a.year || 0) || (b.month || 0) - (a.month || 0));
}

function buildReport(papers, assets) {
  const byYear = {};
  for (const paper of papers) {
    const year = paper.year || "unknown";
    byYear[year] ||= { CET4: 0, CET6: 0, UNKNOWN: 0 };
    byYear[year][paper.examType || "UNKNOWN"] += 1;
  }
  return {
    repo: REPO,
    generatedAt: new Date().toISOString(),
    assetCount: assets.length,
    paperGroupCount: papers.length,
    yearRange: {
      min: Math.min(...papers.map((paper) => paper.year).filter(Boolean)),
      max: Math.max(...papers.map((paper) => paper.year).filter(Boolean))
    },
    byYear
  };
}

function toStructuredStub(paper) {
  return {
    examType: paper.examType,
    year: paper.year,
    month: paper.month,
    paperNo: paper.paperNo || 1,
    title: `${paper.year}年${paper.month}月${paper.examType}真题`,
    source: {
      provider: REPO,
      folder: paper.sourceFolder,
      questionPdfUrl: paper.paperAssets.questionPdf?.rawUrl || "",
      answerAnalysisPdfUrl: paper.paperAssets.answerAnalysisPdf?.rawUrl || "",
      audioUrl: paper.paperAssets.audioMp3?.rawUrl || ""
    },
    status: "draft",
    extractionStatus: "metadata-only",
    sections: [
      { type: "listening", audio: { url: paper.paperAssets.audioMp3?.rawUrl || "" }, listeningSegments: [] },
      { type: "reading", readingPassages: [] },
      { type: "translation", questions: [] },
      { type: "writing", questions: [] }
    ]
  };
}

function encodePath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}
