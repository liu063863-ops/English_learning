import fs from "node:fs/promises";

const outPath = new URL("../backend/data/ten_year_resource_catalog.json", import.meta.url);
const years = Array.from({ length: 10 }, (_, index) => 2025 - index);
const catalog = [];

for (const examType of ["CET-4", "CET-6"]) {
  const slug = examType === "CET-4" ? "cet4" : "cet6";
  for (const year of years) {
    for (const month of [6, 12]) {
      for (const setNo of [1, 2, 3]) {
        const mm = String(month).padStart(2, "0");
        catalog.push({
          id: `${slug}-${year}-${mm}-set${setNo}`,
          examType,
          year,
          month,
          setNo,
          title: `${examType} ${year}年${month}月第${setNo}套真题资源候选`,
          resourceKind: "paper-audio",
          source: "cettong-url-pattern",
          pageUrl: `https://www.cettong.cn/library/${slug}/${year}_${mm}_${setNo}`,
          expectedAssets: ["paper pdf", "answer pdf", "listening mp3"],
          importStatus: "candidate-needs-verification",
          licenseStatus: "third-party-link; verify before importing files"
        });
      }
    }
  }
}

for (const examYear of years) {
  for (const subject of ["英语一", "英语二"]) {
    const encoded = encodeURIComponent(`${examYear} 考研${subject} 真题 解析`);
    catalog.push({
      id: `kaoyan-${examYear}-${subject === "英语一" ? "english-i" : "english-ii"}`,
      examType: "KAOYAN",
      year: examYear,
      month: 12,
      subject,
      title: `${examYear}考研${subject}真题资源候选`,
      resourceKind: "paper-analysis",
      source: "search-index",
      pageUrl: `https://www.eduego.com/search.html?tit=${encoded}`,
      fallbackSearchUrl: `https://download.chinakaoyan.com/list.html?act=search&keywords=${encoded}&page=1`,
      expectedAssets: ["paper", "answer", "analysis"],
      importStatus: "candidate-needs-verification",
      licenseStatus: "third-party-link; verify before importing files"
    });
  }
}

await fs.writeFile(outPath, JSON.stringify(catalog, null, 2), "utf8");
console.log(`Wrote ${catalog.length} resource candidates to ${outPath}`);
