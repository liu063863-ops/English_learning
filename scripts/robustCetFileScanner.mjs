import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = parseArgs(process.argv.slice(2));
const input = args.input || args.repo || "backend/data/imported/cet_repo_assets.json";
const output = args.output || "backend/data/imported/cet_repo_papers.robust.json";
const reportOutput = args.report || "backend/data/imported/cet_repo_scan_report.robust.json";

const assets = await loadAssets(input);
const classified = assets.map(classifyAsset).filter(Boolean);
const papers = groupIntoPapers(classified);
const report = buildReport(classified, papers);

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(papers, null, 2), "utf8");
await fs.writeFile(reportOutput, JSON.stringify(report, null, 2), "utf8");

console.log(JSON.stringify({
  ok: true,
  input,
  output,
  report: reportOutput,
  assetCount: classified.length,
  paperCount: papers.length,
  matchRate: report.matchRate,
  completePaperRate: report.completePaperRate
}, null, 2));

async function loadAssets(source) {
  const resolved = path.resolve(source);
  const stat = await fs.stat(resolved);
  if (stat.isDirectory()) {
    const files = await listFiles(resolved);
    return files.map((file) => {
      const relativePath = path.relative(resolved, file).split(path.sep).join("/");
      const ext = path.extname(file).slice(1).toLowerCase();
      return {
        path: relativePath,
        fileName: path.basename(file),
        ext,
        size: 0,
        localPath: file,
        rawUrl: file,
        githubUrl: ""
      };
    });
  }

  const parsed = JSON.parse(await fs.readFile(resolved, "utf8"));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.assets)) return parsed.assets;
  throw new Error("输入必须是本地仓库目录、cet_repo_assets.json 数组，或含 assets 数组的 JSON");
}

async function listFiles(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(full));
    if (entry.isFile()) out.push(full);
  }
  return out;
}

function classifyAsset(asset) {
  const ext = String(asset.ext || path.extname(asset.fileName || asset.path).slice(1)).toLowerCase();
  if (!["pdf", "mp3", "m4a", "wav", "doc", "docx", "txt"].includes(ext)) return null;

  const rawText = normalizeText([asset.path, asset.fileName, asset.githubUrl, asset.rawUrl].filter(Boolean).join(" "));
  const decodedText = normalizeText([safeDecode(asset.path), safeDecode(asset.fileName), safeDecode(asset.githubUrl), safeDecode(asset.rawUrl)].filter(Boolean).join(" "));
  const text = `${rawText} ${decodedText}`;
  const year = parseYear(text, asset.year);
  const month = parseMonth(text, asset.month);
  const level = parseLevel(text, asset.examType || asset.level);
  const setNum = parseSetNum(text, asset.paperNo || asset.set_num);
  const assetType = parseAssetType(text, ext);
  const confidence = scoreClassification({ year, month, level, setNum, assetType, ext, text });

  return {
    ...asset,
    ext,
    year,
    month,
    examType: level,
    level,
    paperNo: setNum,
    set_num: setNum,
    assetType,
    confidence,
    normalizedText: text.slice(0, 500)
  };
}

function groupIntoPapers(rows) {
  const map = new Map();
  for (const asset of rows) {
    const setNums = inferSetNums(asset);
    for (const setNum of setNums) {
      const key = makePaperKey(asset, setNum);
      if (!map.has(key)) {
        map.set(key, {
          paperId: key.toLowerCase(),
          examType: asset.level,
          level: asset.level,
          year: asset.year,
          month: asset.month,
          paperNo: setNum,
          set_num: setNum,
          sourceFolders: new Set(),
          paperAssets: {
            questionPdf: null,
            questionDoc: null,
            answerAnalysisPdf: null,
            audioMp3: null,
            notes: []
          },
          rawAssets: [],
          warnings: []
        });
      }
      const paper = map.get(key);
      paper.sourceFolders.add(String(asset.path || "").split("/").slice(0, -1).join("/"));
      paper.rawAssets.push(asset);
      attachAsset(paper, asset);
    }
  }

  propagateSharedAssets(map);

  return [...map.values()]
    .map((paper) => {
      const completeness = calcCompleteness(paper);
      return {
        ...paper,
        sourceFolders: [...paper.sourceFolders].filter(Boolean),
        completeness,
        warnings: buildPaperWarnings(paper, completeness)
      };
    })
    .sort((a, b) => a.level.localeCompare(b.level) || b.year - a.year || b.month - a.month || a.set_num - b.set_num);
}

function attachAsset(paper, asset) {
  if (asset.assetType === "questionPdf") paper.paperAssets.questionPdf = chooseBetter(paper.paperAssets.questionPdf, asset);
  else if (asset.assetType === "questionDoc") paper.paperAssets.questionDoc = chooseBetter(paper.paperAssets.questionDoc, asset);
  else if (asset.assetType === "answerAnalysisPdf") paper.paperAssets.answerAnalysisPdf = chooseBetter(paper.paperAssets.answerAnalysisPdf, asset);
  else if (asset.assetType === "audioMp3") paper.paperAssets.audioMp3 = chooseBetter(paper.paperAssets.audioMp3, asset);
  else if (asset.assetType === "note") paper.paperAssets.notes.push(asset);

  if (asset.assetType === "answerAnalysisPdf" && /真题|试题|题目|试卷|paper|question/i.test(asset.normalizedText)) {
    paper.paperAssets.questionPdf = chooseBetter(paper.paperAssets.questionPdf, { ...asset, assetType: "questionPdf", sharedRole: "question_and_answer" });
  }
  if (asset.assetType === "answerAnalysisDoc" && /真题|试题|题目|试卷|paper|question/i.test(asset.normalizedText)) {
    paper.paperAssets.questionDoc = chooseBetter(paper.paperAssets.questionDoc, { ...asset, assetType: "questionDoc", sharedRole: "question_and_answer" });
  }
}

function propagateSharedAssets(map) {
  const groups = new Map();
  for (const paper of map.values()) {
    const key = [paper.level || "UNKNOWN", paper.year || "unknown-year", paper.month || "unknown-month"].join("-");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(paper);
  }

  for (const papers of groups.values()) {
    const sharedAudio = chooseBestFrom(papers.map((paper) => paper.paperAssets.audioMp3).filter(Boolean));
    const sharedQuestionPdf = chooseBestFrom(papers.map((paper) => paper.paperAssets.questionPdf).filter(Boolean));
    const sharedQuestionDoc = chooseBestFrom(papers.map((paper) => paper.paperAssets.questionDoc).filter(Boolean));
    const sharedAnswer = chooseBestFrom(papers.map((paper) => paper.paperAssets.answerAnalysisPdf).filter(Boolean));
    for (const paper of papers) {
      if (!paper.paperAssets.audioMp3 && sharedAudio && isSharedCandidate(sharedAudio)) {
        paper.paperAssets.audioMp3 = { ...sharedAudio, sharedFromGroup: true };
      }
      if (!paper.paperAssets.questionPdf && sharedQuestionPdf && isSharedCandidate(sharedQuestionPdf)) {
        paper.paperAssets.questionPdf = { ...sharedQuestionPdf, sharedFromGroup: true };
      }
      if (!paper.paperAssets.questionDoc && sharedQuestionDoc && isSharedCandidate(sharedQuestionDoc)) {
        paper.paperAssets.questionDoc = { ...sharedQuestionDoc, sharedFromGroup: true };
      }
      if (!paper.paperAssets.answerAnalysisPdf && sharedAnswer && isSharedCandidate(sharedAnswer)) {
        paper.paperAssets.answerAnalysisPdf = { ...sharedAnswer, sharedFromGroup: true };
      }
    }
  }

  propagateNearestAudioFallback(map);
}

function chooseBestFrom(rows) {
  return rows.reduce((best, row) => chooseBetter(best, row), null);
}

function isSharedCandidate(asset) {
  return !asset.set_num || /全\s*[三3]\s*套|共\s*[三3]\s*套|全套|共用|合一|汇总|真题.*答案|答案.*真题/i.test(asset.normalizedText || "");
}

function propagateNearestAudioFallback(map) {
  const byLevelYear = new Map();
  for (const paper of map.values()) {
    const key = [paper.level || "UNKNOWN", paper.year || "unknown-year"].join("-");
    if (!byLevelYear.has(key)) byLevelYear.set(key, []);
    byLevelYear.get(key).push(paper);
  }

  for (const papers of byLevelYear.values()) {
    const audioPapers = papers.filter((paper) => paper.paperAssets.audioMp3);
    if (!audioPapers.length) continue;
    for (const paper of papers) {
      if (paper.paperAssets.audioMp3) continue;
      const nearest = audioPapers
        .map((candidate) => ({ candidate, distance: Math.abs(Number(candidate.month || 0) - Number(paper.month || 0)) }))
        .sort((a, b) => a.distance - b.distance)[0]?.candidate;
      if (nearest?.paperAssets.audioMp3) {
        paper.paperAssets.audioMp3 = {
          ...nearest.paperAssets.audioMp3,
          fallbackAudio: true,
          fallbackReason: `nearest_audio_same_level_year:${nearest.paperId}`
        };
      }
    }
  }
}

function chooseBetter(current, candidate) {
  if (!current) return candidate;
  const currentScore = Number(current.confidence || 0) + Math.log10(Number(current.size || 1));
  const candidateScore = Number(candidate.confidence || 0) + Math.log10(Number(candidate.size || 1));
  return candidateScore > currentScore ? candidate : current;
}

function inferSetNums(asset) {
  if (asset.set_num) return [asset.set_num];
  if (/全\s*[三3]\s*套|共\s*[三3]\s*套|3\s*套|三套|全套/i.test(asset.normalizedText)) return [1, 2, 3];
  return [1];
}

function makePaperKey(asset, setNum) {
  return [asset.level || "UNKNOWN", asset.year || "unknown-year", asset.month || "unknown-month", setNum || "unknown-set"].join("-");
}

function parseYear(text, fallback) {
  if (Number(fallback)) return Number(fallback);
  const match = text.match(/(?:20)\d{2}/);
  return match ? Number(match[0]) : null;
}

function parseMonth(text, fallback) {
  if (Number(fallback)) return Number(fallback);
  const candidates = [
    /(?:20\d{2})\s*(?:年|\.|-|_|\/)?\s*(0?[369]|1[02])\s*(?:月|\.|-|_|\/)?/i,
    /(?:^|[^\d])(0?[369]|1[02])\s*月/i,
    /(?:^|[^\d])(0?[369]|1[02])\s*(?:月份|考试)/i
  ];
  for (const pattern of candidates) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

function parseLevel(text, fallback) {
  if (fallback === "CET4" || fallback === "CET6") return fallback;
  if (/CET\s*4|CET-4|大学英语四级|英语四级|四级|4\s*级|cet4/i.test(text)) return "CET4";
  if (/CET\s*6|CET-6|大学英语六级|英语六级|六级|6\s*级|cet6/i.test(text)) return "CET6";
  return null;
}

function parseSetNum(text, fallback) {
  if (Number(fallback)) return Number(fallback);
  const patterns = [
    /第\s*([一二三123])\s*(?:套|卷|份)/,
    /(?:套|卷|份)\s*([123])/,
    /(?:set|paper)\s*([123])/i,
    /(?:全|共)\s*([三3])\s*套/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return normalizeChineseNumber(match[1]);
  }
  return null;
}

function parseAssetType(text, ext) {
  if (["mp3", "m4a", "wav"].includes(ext)) return "audioMp3";
  if (ext === "txt") return "note";
  if (/答案解析|答案详解|解析答案|参考答案|答案|解析|详解|answer|analysis|key/i.test(text)) {
    return ext === "pdf" ? "answerAnalysisPdf" : "answerAnalysisDoc";
  }
  if (/真题|试题|题目|试卷|原题|paper|question|exam/i.test(text)) {
    return ext === "pdf" ? "questionPdf" : "questionDoc";
  }
  if (ext === "pdf" && /第\s*[一二三123]\s*套|CET|四级|六级/i.test(text)) return "questionPdf";
  if (["doc", "docx"].includes(ext) && /第\s*[一二三123]\s*套|CET|四级|六级/i.test(text)) return "questionDoc";
  return "other";
}

function scoreClassification({ year, month, level, setNum, assetType, ext, text }) {
  let score = 0;
  if (year) score += 0.18;
  if (month) score += 0.14;
  if (level) score += 0.2;
  if (setNum) score += 0.16;
  if (assetType && assetType !== "other") score += 0.24;
  if (/全\s*[三3]\s*套|共\s*[三3]\s*套/.test(text)) score += 0.04;
  if (["pdf", "mp3", "doc", "docx"].includes(ext)) score += 0.04;
  return Math.min(Math.round(score * 100) / 100, 1);
}

function normalizeChineseNumber(value) {
  return { 一: 1, 二: 2, 三: 3, "1": 1, "2": 2, "3": 3 }[String(value)] || null;
}

function normalizeText(text) {
  return String(text || "")
    .normalize("NFKC")
    .replace(/[【】\[\]（）()]/g, " ")
    .replace(/[+_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeDecode(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function calcCompleteness(paper) {
  const hasQuestion = Boolean(paper.paperAssets.questionPdf || paper.paperAssets.questionDoc);
  const hasAnswer = Boolean(paper.paperAssets.answerAnalysisPdf);
  const hasAudio = Boolean(paper.paperAssets.audioMp3);
  return {
    hasQuestion,
    hasAnswer,
    hasAudio,
    score: Math.round(((Number(hasQuestion) + Number(hasAnswer) + Number(hasAudio)) / 3) * 100)
  };
}

function buildPaperWarnings(paper, completeness = paper.completeness) {
  const warnings = [];
  if (!completeness.hasQuestion) warnings.push("missing_question_file");
  if (!completeness.hasAnswer) warnings.push("missing_answer_analysis_file");
  if (!completeness.hasAudio) warnings.push("missing_audio_file");
  if (paper.paperAssets.audioMp3?.fallbackAudio) warnings.push("audio_fallback_needs_review");
  if (!paper.level || !paper.year || !paper.month || !paper.set_num) warnings.push("weak_identity");
  return warnings;
}

function buildReport(assets, papers) {
  const matchedAssets = assets.filter((asset) => asset.assetType !== "other" && asset.level && asset.year && asset.month);
  const completePapers = papers.filter((paper) => paper.completeness.hasQuestion && paper.completeness.hasAnswer && paper.completeness.hasAudio);
  return {
    generatedAt: new Date().toISOString(),
    assetCount: assets.length,
    matchedAssetCount: matchedAssets.length,
    matchRate: pct(matchedAssets.length, assets.length),
    paperCount: papers.length,
    completePaperCount: completePapers.length,
    completePaperRate: pct(completePapers.length, papers.length),
    byAssetType: countBy(assets, "assetType"),
    byLevel: countBy(papers, "level"),
    weakAssets: assets.filter((asset) => asset.confidence < 0.72 || asset.assetType === "other").slice(0, 80).map((asset) => ({
      path: asset.path,
      fileName: asset.fileName,
      assetType: asset.assetType,
      level: asset.level,
      year: asset.year,
      month: asset.month,
      set_num: asset.set_num,
      confidence: asset.confidence
    })),
    incompletePapers: papers.filter((paper) => paper.warnings.length).slice(0, 80).map((paper) => ({
      paperId: paper.paperId,
      year: paper.year,
      month: paper.month,
      level: paper.level,
      set_num: paper.set_num,
      completeness: paper.completeness,
      warnings: paper.warnings
    }))
  };
}

function pct(part, total) {
  return total ? Math.round((part / total) * 1000) / 10 : 0;
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
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
