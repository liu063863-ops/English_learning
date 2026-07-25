export function parseCetAssetPath(filePath) {
  const normalized = filePath.normalize("NFKC");
  const parts = normalized.split(/[\\/]+/);
  const joined = parts.join(" ");
  const fileName = parts.at(-1) || "";
  const ext = fileName.includes(".") ? fileName.split(".").at(-1).toLowerCase() : "";

  const year = numberMatch(joined, /(20\d{2})/);
  const month = numberMatch(joined, /(?:年|[._-])\s*(3|6|9|12|03|06|09)\s*(?:月|[._-])?/);
  const level = /CET\s*4|四级|大学英语四级/i.test(joined)
    ? "CET4"
    : /CET\s*6|六级|大学英语六级/i.test(joined)
      ? "CET6"
      : null;
  const set_num = parseSetNumber(joined);
  const assetType = classifyFile(fileName, ext);

  return { fileName, ext, year, month, level, set_num, assetType };
}

function classifyFile(fileName, ext) {
  if (/mp3|m4a|wav/i.test(ext)) return "audio";
  if (/答案|解析|详解|answer|analysis/i.test(fileName)) return "answerAnalysis";
  if (/真题|试题|题目|paper|question/i.test(fileName)) return ext === "pdf" ? "questionPdf" : "questionDoc";
  if (/听力|音频|listening/i.test(fileName) && ext === "mp3") return "audio";
  return "other";
}

function parseSetNumber(text) {
  const match = text.match(/(?:第\s*)?([一二三123])\s*(?:套|卷|set)/i) || text.match(/(?:套|卷)\s*([123])/i);
  const value = match?.[1];
  return { 一: 1, 二: 2, 三: 3, "1": 1, "2": 2, "3": 3 }[value] || null;
}

function numberMatch(text, pattern) {
  const match = text.match(pattern);
  return match ? Number(match[1]) : null;
}
