export const resourceSources = [
  {
    id: "official-cet-home",
    category: "official",
    examTypes: ["CET-4", "CET-6"],
    title: "中国教育考试网 CET 官方主页",
    url: "https://cet.neea.edu.cn/xhtml1/folder/1608/1178-1.htm",
    provides: ["exam notices", "exam introduction", "official service links"],
    licenseStatus: "official-metadata-only",
    importStrategy: "Use as authoritative metadata source. It does not expose a full ten-year paper/audio archive.",
    notes: "CET is organized by the Ministry of Education Education Examinations Authority."
  },
  {
    id: "official-cet-syllabus",
    category: "official",
    examTypes: ["CET-4", "CET-6"],
    title: "中国教育考试网 CET 考试大纲",
    url: "https://cet.neea.edu.cn/html1/folder/16113/1588-1.htm",
    provides: ["syllabus", "sample structure"],
    licenseStatus: "official-reference",
    importStrategy: "Use to validate section structure, timing and scoring; do not treat as past-paper archive.",
    notes: "Official page lists the national CET English syllabus."
  },
  {
    id: "cettong-cet-library",
    category: "third-party",
    examTypes: ["CET-4", "CET-6"],
    title: "CET通真题库",
    url: "https://www.cettong.cn/library",
    provides: ["paper pdf", "answer pdf", "listening mp3"],
    licenseStatus: "third-party-free-personal-study-claimed",
    importStrategy: "Adapter should read page metadata and store external file URLs. Download only after user confirms permitted use.",
    notes: "Search result pages show recent CET papers with PDF and MP3 download entries."
  },
  {
    id: "eduego-kaoyan-english",
    category: "third-party",
    examTypes: ["KAOYAN"],
    title: "学晋网/在职研究生招生信息网 英语历年真题",
    url: "https://www.eduego.com/fqrz/zhenti/0-233/",
    provides: ["kaoyan English paper pages", "answers", "analysis"],
    licenseStatus: "third-party-web-article",
    importStrategy: "Adapter should collect article metadata by year and subject; full text import requires permission review.",
    notes: "Index includes recent English I and English II paper/answer pages."
  },
  {
    id: "chinakaoyan-download",
    category: "third-party",
    examTypes: ["KAOYAN"],
    title: "中国考研网下载中心 考研英语检索",
    url: "https://download.chinakaoyan.com/list.html?act=search&keywords=%E8%80%83%E7%A0%94%E8%8B%B1%E8%AF%AD&page=1",
    provides: ["download index", "paper pdf/doc links"],
    licenseStatus: "third-party-download-index",
    importStrategy: "Adapter should collect file metadata and require manual approval before file download.",
    notes: "Useful as a source index for English I/II yearly resources."
  }
];
