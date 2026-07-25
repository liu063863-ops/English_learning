import net from "node:net";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

export async function createQuestionBankDataAccess(options = {}) {
  const requested = options.db || "auto";
  const mongoUri = options.mongoUri || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/english_exam";
  const sqlitePath = path.resolve(projectRoot, options.sqlitePath || "backend/data/english_exam.db");
  const python = options.python || process.env.PYTHON || defaultPythonPath();

  if (requested !== "sqlite") {
    const mongoReachable = await canConnect(options.mongoHost || "127.0.0.1", Number(options.mongoPort || 27017), 1200);
    if (requested === "mongo" && !mongoReachable) {
      throw new Error(`MongoDB is not reachable at ${options.mongoHost || "127.0.0.1"}:${options.mongoPort || 27017}`);
    }
    if (mongoReachable) {
      try {
        return await createMongoAdapter({ mongoUri });
      } catch (error) {
        if (requested === "mongo") throw error;
      }
    }
  }

  return createSqliteAdapter({ sqlitePath, python });
}

async function createMongoAdapter({ mongoUri }) {
  const mongooseModule = await import("mongoose");
  const mongoose = mongooseModule.default;
  const models = await import("../docs/database/unified-question-bank.schema.js");
  await mongoose.connect(mongoUri);

  return {
    type: "mongo",
    async close() {
      await mongoose.disconnect();
    },
    async stats() {
      const [exams, sections, audio_files, passages, questions] = await Promise.all([
        models.Exam.countDocuments(),
        models.Section.countDocuments(),
        models.AudioFile.countDocuments(),
        models.Passage.countDocuments(),
        models.Question.countDocuments()
      ]);
      return { ok: true, database: "mongo", counts: { exams, sections, audio_files, passages, questions } };
    },
    async findExistingExam(paper) {
      return models.Exam.findOne({
        level: paper.level || paper.examType,
        year: paper.year,
        month: paper.month,
        set_num: paper.set_num || paper.paperNo,
        source: "past_exam"
      }).lean();
    },
    async existingExamLooksComplete(exam) {
      const sections = await models.Section.find({ exam_id: exam._id }).lean();
      const sectionIds = sections.map((section) => section._id);
      const [questionCount, audioCount, passageCount] = await Promise.all([
        models.Question.countDocuments({ section_id: { $in: sectionIds } }),
        models.AudioFile.countDocuments({ exam_id: exam._id }),
        models.Passage.countDocuments({ section_id: { $in: sectionIds } })
      ]);
      const sectionTypes = new Set(sections.map((section) => section.section_type));
      return ["listening", "reading", "translation", "writing"].every((type) => sectionTypes.has(type))
        && questionCount > 0
        && audioCount > 0
        && passageCount > 0;
    },
    async importPayload(payload) {
      const normalized = JSON.parse(JSON.stringify(payload), (_key, value) => {
        if (value && typeof value === "object" && value.$oid) return new mongoose.Types.ObjectId(value.$oid);
        if (value && typeof value === "object" && value.$date) return new Date(value.$date);
        return value;
      });
      const report = { database: "mongo", insertedExams: 0, insertedSections: 0, insertedAudioFiles: 0, insertedPassages: 0, insertedQuestions: 0 };
      if (normalized.exams?.length) {
        await models.Exam.bulkWrite(normalized.exams.map((exam) => ({
          updateOne: {
            filter: { level: exam.level, year: exam.year, month: exam.month, set_num: exam.set_num, source: exam.source },
            update: { $setOnInsert: exam },
            upsert: true
          }
        })));
        report.insertedExams = normalized.exams.length;
      }
      if (normalized.sections?.length) {
        await models.Section.bulkWrite(normalized.sections.map((section) => ({
          updateOne: { filter: { exam_id: section.exam_id, section_type: section.section_type }, update: { $setOnInsert: section }, upsert: true }
        })));
        report.insertedSections = normalized.sections.length;
      }
      if (normalized.audio_files?.length) {
        await models.AudioFile.bulkWrite(normalized.audio_files.map((audio) => ({
          updateOne: { filter: { exam_id: audio.exam_id, section_id: audio.section_id, file_url: audio.file_url }, update: { $setOnInsert: audio }, upsert: true }
        })));
        report.insertedAudioFiles = normalized.audio_files.length;
      }
      if (normalized.passages?.length) {
        await models.Passage.bulkWrite(normalized.passages.map((passage) => ({
          updateOne: { filter: { section_id: passage.section_id, order_index: passage.order_index }, update: { $setOnInsert: passage }, upsert: true }
        })));
        report.insertedPassages = normalized.passages.length;
      }
      if (normalized.questions?.length) {
        await models.Question.bulkWrite(normalized.questions.map((question) => ({
          updateOne: { filter: { section_id: question.section_id, order_index: question.order_index }, update: { $setOnInsert: question }, upsert: true }
        })));
        report.insertedQuestions = normalized.questions.length;
      }
      return { ok: true, report };
    },
    async checkExpected(papers) {
      const dbExams = await models.Exam.find({ source: "past_exam" }).lean();
      const existing = new Set(dbExams.map(makePaperKey));
      const complete = papers.filter(isCompletePaper);
      const missing = complete.map(makePaperKey).filter((key) => !existing.has(key));
      return { ok: missing.length === 0, expected: complete.length, existing: existing.size, missing };
    }
  };
}

function createSqliteAdapter({ sqlitePath, python }) {
  const call = (op, extra = {}) => callSqliteBridge(python, { op, dbPath: sqlitePath, ...extra });
  return {
    type: "sqlite",
    sqlitePath,
    async close() {},
    async stats() {
      return call("stats");
    },
    async findExistingExam(paper) {
      const result = await call("checkExpected", { papers: [paper] });
      return result.missing?.length ? null : { key: makePaperKey(paper) };
    },
    async existingExamLooksComplete(exam) {
      return Boolean(exam);
    },
    async importPayload(payload) {
      return call("importPayload", { payload });
    },
    async checkExpected(papers) {
      return call("checkExpected", { papers });
    },
    async listExams(filters = {}) {
      return call("listExams", { filters });
    },
    async getExamSection(examId, sectionType) {
      return call("getExamSection", { examId, sectionType });
    }
  };
}

function callSqliteBridge(python, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(projectRoot, "scripts", "sqliteQuestionBankBridge.py")], {
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
        reject(new Error(`SQLite bridge failed with exit code ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout || "{}"));
      } catch (error) {
        reject(new Error(`SQLite bridge returned invalid JSON: ${error.message}\n${stdout}\n${stderr}`));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

function canConnect(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

function defaultPythonPath() {
  if (process.platform === "win32") {
    return "C:/Users/liujinhao/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
  }
  return "python3";
}

function isCompletePaper(paper) {
  return Boolean(paper.completeness?.hasQuestion && paper.completeness?.hasAnswer && paper.completeness?.hasAudio);
}

function makePaperKey(paper) {
  return `${paper.level || paper.examType}:${paper.year}:${paper.month}:${paper.set_num || paper.paperNo}:past_exam`;
}
