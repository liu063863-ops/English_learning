import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(projectRoot, "backend", "data");
const dbPath = path.join(dataDir, "english_exam.db");
const backupPath = path.join(dataDir, "english_exam.db.backup");
const samplePath = path.join(dataDir, "english_exam.db.sample");
const legacyBackupPaths = [
  path.join(dataDir, "english_exam.before_auto_repair_reading.db"),
  path.join(dataDir, "english_exam.before_fix_all_reading.db"),
  path.join(dataDir, "english_exam.test_reading_fix.db")
];

const roamingDir = process.env.APPDATA || os.homedir();
const userDataCandidates = [
  path.join(roamingDir, "@kaoyan-english-lab", "electron", "english_exam.db"),
  path.join(roamingDir, "Electron", "english_exam.db"),
  path.join(roamingDir, "english_exam.db")
];

console.log("=== Database Check ===\n");
console.log(`Project root: ${projectRoot}\n`);

const checks = [
  { name: "Main DB", path: dbPath },
  { name: "Backup", path: backupPath },
  { name: "Sample", path: samplePath },
  ...legacyBackupPaths.map((item, index) => ({ name: `Legacy Backup ${index + 1}`, path: item })),
  ...userDataCandidates.map((item, index) => ({ name: `User Data ${index + 1}`, path: item }))
];

for (const check of checks) {
  printCheck(check);
}

const mainInfo = inspectDb(dbPath);
if (mainInfo.exists && mainInfo.examCount > 0) {
  console.log(`\n✅ Main database is healthy: ${mainInfo.examCount} exams found.`);
  process.exit(0);
}

console.log("\n⚠️ Main database is missing or has no exams. Trying recovery...\n");

const restoreSource = findRestoreSource();
if (!restoreSource) {
  console.log("❌ No usable database found. You need to run the import script again.");
  process.exit(1);
}

fs.mkdirSync(dataDir, { recursive: true });
if (fs.existsSync(dbPath)) {
  const brokenBackup = path.join(dataDir, `english_exam.broken-${Date.now()}.db`);
  fs.copyFileSync(dbPath, brokenBackup);
  console.log(`Existing main DB backed up to: ${brokenBackup}`);
}

fs.copyFileSync(restoreSource.path, dbPath);
const restored = inspectDb(dbPath);
if (restored.exists && restored.examCount > 0) {
  console.log(`✅ Database restored from ${restoreSource.name}`);
  console.log(`   Source: ${restoreSource.path}`);
  console.log(`   Main DB: ${dbPath}`);
  console.log(`   Exams: ${restored.examCount}`);
} else {
  console.log(`❌ Restore copied a file, but validation still failed.`);
  console.log(`   Source: ${restoreSource.path}`);
  process.exit(1);
}

function printCheck(check) {
  const info = inspectDb(check.path);
  const status = info.exists ? "✅" : "❌";
  const size = info.exists ? `${(info.size / 1024 / 1024).toFixed(2)} MB` : "Not found";
  const exams = info.exists ? `, exams=${info.examCountText}` : "";
  console.log(`${check.name}: ${status} ${size}${exams}`);
  console.log(`  Path: ${check.path}\n`);
}

function findRestoreSource() {
  const candidates = [
    { name: "Sample", path: samplePath },
    { name: "Backup", path: backupPath },
    ...legacyBackupPaths.map((item, index) => ({ name: `Legacy Backup ${index + 1}`, path: item })),
    ...userDataCandidates.map((item, index) => ({ name: `User Data ${index + 1}`, path: item }))
  ];
  return candidates.find((candidate) => {
    const info = inspectDb(candidate.path);
    return info.exists && info.examCount > 0;
  });
}

function inspectDb(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return { exists: false, size: 0, examCount: 0, examCountText: "N/A" };
  }
  const size = fs.statSync(targetPath).size;
  const examCount = countExams(targetPath);
  return {
    exists: true,
    size,
    examCount: Number.isFinite(examCount) ? examCount : 0,
    examCountText: Number.isFinite(examCount) ? String(examCount) : "unknown"
  };
}

function countExams(targetPath) {
  const python = resolvePython();
  if (!python) return Number.NaN;
  const code = [
    "import sqlite3, sys",
    "path = sys.argv[1]",
    "try:",
    "    conn = sqlite3.connect(path)",
    "    cur = conn.cursor()",
    "    cur.execute(\"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='exams'\")",
    "    exists = cur.fetchone()[0]",
    "    if not exists:",
    "        print(0)",
    "    else:",
    "        cur.execute('SELECT COUNT(*) FROM exams')",
    "        print(cur.fetchone()[0])",
    "    conn.close()",
    "except Exception:",
    "    print('nan')"
  ].join("\n");
  const result = spawnSync(python, ["-c", code, targetPath], { encoding: "utf8" });
  const raw = String(result.stdout || "").trim();
  const count = Number(raw);
  return Number.isFinite(count) ? count : Number.NaN;
}

function resolvePython() {
  const candidates = [
    process.env.PYTHON_PATH,
    "C:\\Users\\liujinhao\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe",
    "python",
    "py"
  ].filter(Boolean);
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) return candidate;
  }
  return null;
}
