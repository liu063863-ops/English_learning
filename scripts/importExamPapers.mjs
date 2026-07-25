import fs from "node:fs/promises";

const [, , inputPath, apiBase = "http://127.0.0.1:4187/api"] = process.argv;

if (!inputPath) {
  console.error("Usage: node scripts/importExamPapers.mjs <papers.json> [apiBase]");
  process.exit(1);
}

const raw = await fs.readFile(inputPath, "utf8");
const papers = JSON.parse(raw);

if (!Array.isArray(papers)) {
  throw new Error("Input must be an array of structured exam paper objects.");
}

const response = await fetch(`${apiBase}/import/exam-papers`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    adapter: "json-file-adapter",
    papers
  })
});

if (!response.ok) {
  throw new Error(await response.text());
}

console.log(JSON.stringify(await response.json(), null, 2));
