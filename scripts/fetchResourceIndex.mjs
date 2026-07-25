import fs from "node:fs/promises";

const sources = [
  {
    id: "cettong-cet-library",
    examTypes: ["CET-4", "CET-6"],
    url: "https://www.cettong.cn/library"
  },
  {
    id: "eduego-kaoyan-english",
    examTypes: ["KAOYAN"],
    url: "https://www.eduego.com/fqrz/zhenti/0-233/"
  },
  {
    id: "chinakaoyan-download",
    examTypes: ["KAOYAN"],
    url: "https://download.chinakaoyan.com/list.html?act=search&keywords=%E8%80%83%E7%A0%94%E8%8B%B1%E8%AF%AD&page=1"
  }
];

const outPath = process.argv[2] || new URL("../backend/data/resource_index.json", import.meta.url);

const results = [];

for (const source of sources) {
  try {
    const response = await fetch(source.url, {
      headers: {
        "User-Agent": "CampusEnglishLab/0.1 resource-indexer"
      }
    });
    const html = await response.text();
    results.push({
      ...source,
      fetchedAt: new Date().toISOString(),
      status: response.status,
      links: extractLinks(html, source.url)
    });
  } catch (error) {
    results.push({
      ...source,
      fetchedAt: new Date().toISOString(),
      status: "failed",
      error: error.message,
      links: []
    });
  }
}

await fs.writeFile(outPath, JSON.stringify(results, null, 2), "utf8");
console.log(`Wrote ${results.length} source indexes to ${outPath}`);

function extractLinks(html, baseUrl) {
  const matches = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  return matches
    .map((match) => {
      const url = new URL(match[1], baseUrl).toString();
      const title = stripTags(match[2]).replace(/\s+/g, " ").trim();
      const lower = `${url} ${title}`.toLowerCase();
      const resourceType = lower.includes(".mp3") || lower.includes("听力") || lower.includes("audio")
        ? "audio"
        : lower.includes(".pdf") || lower.includes("真题") || lower.includes("答案") || lower.includes("解析")
          ? "paper"
          : "page";
      return { title, url, resourceType };
    })
    .filter((item) => item.title || /\.(pdf|mp3|docx?|zip)(\?|$)/i.test(item.url))
    .slice(0, 200);
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, "");
}
