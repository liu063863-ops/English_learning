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
  sqlitePath: resolveRoot(args.sqlite || "backend/data/english_exam.db"),
  reportsDir: resolveRoot(args.reportsDir || "backend/data/reports"),
  python: normalizeUserPath(args.python || process.env.PYTHON || defaultPythonPath()),
  expectedExamCount: Number(args.expectedExamCount || 67),
  expectedReadingQuestions: Number(args.expectedReadingQuestions || 2010)
};

const report = {
  generatedAt: new Date().toISOString(),
  database: config.sqlitePath,
  python: config.python,
  steps: [],
  checks: {},
  verdict: "unknown"
};

try {
  await run();
  report.verdict = "pass";
  await writeReport();
  console.log("\n初始化完成：所有核心数据检查通过。");
  console.log(`报告：${path.join(config.reportsDir, "init-all-data-report.json")}`);
} catch (error) {
  report.verdict = "fail";
  report.error = error.message;
  await writeReport();
  console.error("\n初始化失败：", error.message);
  console.error(`报告：${path.join(config.reportsDir, "init-all-data-report.json")}`);
  process.exitCode = 1;
}

async function run() {
  console.log("=== English Exam Lab 数据初始化 ===");
  console.log(`项目目录：${projectRoot}`);
  console.log(`SQLite：${config.sqlitePath}`);
  console.log(`Python：${config.python}`);

  await step("检查运行环境", async () => {
    await assertFile(config.python, "Python 运行时不存在");
    await fs.mkdir(path.dirname(config.sqlitePath), { recursive: true });
    await fs.mkdir(config.reportsDir, { recursive: true });
  });

  await step("初始化词库表和默认词库", async () => {
    const stats = await vocabularyBridge("stats");
    report.checks.vocabulary = stats.data;
    console.log(`词库总词数：${stats.data.total}`);
    for (const item of stats.data.byCategory || []) {
      console.log(`- ${item.category}: ${item.count}`);
    }
  });

  await step("检查考试核心结构", async () => {
    const checks = await sqliteCheck(`
      SELECT
        (SELECT COUNT(*) FROM exams) AS exams,
        (SELECT COUNT(*) FROM sections WHERE section_type='listening') AS listening_sections,
        (SELECT COUNT(*) FROM sections WHERE section_type='reading') AS reading_sections,
        (SELECT COUNT(*) FROM sections WHERE section_type='translation') AS translation_sections,
        (SELECT COUNT(*) FROM sections WHERE section_type='writing') AS writing_sections,
        (SELECT COUNT(*) FROM questions q JOIN sections s ON s.id=q.section_id WHERE s.section_type='reading') AS reading_questions,
        (SELECT COUNT(*) FROM passages p JOIN sections s ON s.id=p.section_id WHERE s.section_type='reading') AS reading_passages,
        (SELECT COUNT(*) FROM audio_files) AS audio_files,
        (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='words') AS words_table_exists
    `);
    report.checks.examStructure = checks[0];
    printObject(checks[0]);
    assertEqual(checks[0].exams, config.expectedExamCount, "试卷数量不符合预期");
    assertEqual(checks[0].listening_sections, config.expectedExamCount, "听力 section 数量不符合预期");
    assertEqual(checks[0].reading_sections, config.expectedExamCount, "阅读 section 数量不符合预期");
    assertEqual(checks[0].translation_sections, config.expectedExamCount, "翻译 section 数量不符合预期");
    assertEqual(checks[0].writing_sections, config.expectedExamCount, "写作 section 数量不符合预期");
    assertEqual(checks[0].reading_questions, config.expectedReadingQuestions, "阅读题总数不符合预期");
    assertEqual(checks[0].reading_passages, config.expectedExamCount * 3, "阅读文章总数不符合预期");
    assertEqual(checks[0].words_table_exists, 1, "words 表不存在");
  });

  await step("检查占位符残留", async () => {
    const rows = await sqliteCheck(`
      SELECT
        SUM(CASE WHEN lower(COALESCE(q.question_text_json,'')) LIKE '%placeholder%' THEN 1 ELSE 0 END) AS question_placeholder_hits,
        SUM(CASE WHEN lower(COALESCE(p.passage_text,'')) LIKE '%placeholder%' THEN 1 ELSE 0 END) AS passage_placeholder_hits
      FROM sections s
      LEFT JOIN questions q ON q.section_id=s.id
      LEFT JOIN passages p ON p.section_id=s.id
      WHERE s.section_type='reading'
    `);
    const value = rows[0];
    report.checks.placeholders = value;
    printObject(value);
    assertEqual(value.question_placeholder_hits || 0, 0, "阅读题仍有 placeholder 残留");
    assertEqual(value.passage_placeholder_hits || 0, 0, "阅读文章仍有 placeholder 残留");
  });

  await step("检查阅读练习数据源", async () => {
    const result = await readingBridge("list", { filters: { limit: 1 } });
    const totals = await sqliteCheck(`
      SELECT COUNT(*) AS reading_practice_passages
      FROM passages p
      JOIN sections s ON s.id=p.section_id
      WHERE s.section_type='reading'
    `);
    report.checks.readingPractice = {
      available: result.data?.length || 0,
      total: totals[0].reading_practice_passages
    };
    printObject(report.checks.readingPractice);
    if (!result.data?.length) throw new Error("阅读练习无法读取真题阅读数据");
  });
}

async function step(name, fn) {
  const startedAt = Date.now();
  console.log(`\n[${report.steps.length + 1}] ${name}`);
  try {
    await fn();
    const ms = Date.now() - startedAt;
    report.steps.push({ name, ok: true, ms });
    console.log(`完成：${name} (${ms}ms)`);
  } catch (error) {
    const ms = Date.now() - startedAt;
    report.steps.push({ name, ok: false, ms, error: error.message });
    throw error;
  }
}

function vocabularyBridge(op, extra = {}) {
  return runPythonBridge("scripts/sqliteVocabularyBridge.py", { op, dbPath: config.sqlitePath, ...extra });
}

function readingBridge(op, extra = {}) {
  return runPythonBridge("scripts/sqliteReadingPracticeBridge.py", { op, dbPath: config.sqlitePath, ...extra });
}

function sqliteCheck(sql) {
  const code = `
import sqlite3, json
conn = sqlite3.connect(${JSON.stringify(config.sqlitePath)})
conn.row_factory = sqlite3.Row
rows = [dict(row) for row in conn.execute(${JSON.stringify(sql)})]
conn.close()
print(json.dumps(rows, ensure_ascii=False))
`;
  return runPythonInline(code);
}

function runPythonBridge(script, payload) {
  return runProcess(config.python, [resolveRoot(script)], JSON.stringify(payload));
}

async function runPythonInline(code) {
  const stdout = await runProcess(config.python, ["-"], code);
  return stdout;
}

function runProcess(command, commandArgs, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: projectRoot,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      stdio: ["pipe", "pipe", "pipe"],
      shell: false
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || `Process exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout || "{}"));
      } catch (error) {
        reject(new Error(`Invalid JSON from ${command}: ${error.message}\n${stdout}`));
      }
    });
    child.stdin.end(stdin || "");
  });
}

async function writeReport() {
  await fs.mkdir(config.reportsDir, { recursive: true });
  await fs.writeFile(
    path.join(config.reportsDir, "init-all-data-report.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );
}

async function assertFile(filePath, message) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`${message}: ${filePath}`);
  }
}

function assertEqual(actual, expected, message) {
  if (Number(actual) !== Number(expected)) {
    throw new Error(`${message}: expected ${expected}, actual ${actual}`);
  }
}

function printObject(value) {
  console.log(JSON.stringify(value, null, 2));
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function resolveRoot(...parts) {
  return path.resolve(projectRoot, ...parts.map(normalizeUserPath));
}

function normalizeUserPath(value) {
  return String(value || "").replace("file://", "").replace(/%20/g, " ");
}

function defaultPythonPath() {
  if (process.platform === "win32") {
    return "C:/Users/liujinhao/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
  }
  return "python3";
}
