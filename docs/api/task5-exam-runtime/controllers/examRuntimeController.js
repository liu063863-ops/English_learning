import mongoose from "mongoose";
import {
  AudioFile,
  Exam,
  Passage,
  Question,
  Section,
  UserAnswer
} from "../../task4-question-admin/models/QuestionBankModels.js";

const DEFAULT_USER_ID = "64f000000000000000000001";
const OBJECTIVE_TYPES = new Set(["single_choice", "multiple_choice", "fill_blank"]);

export async function listRuntimeExams(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 12), 1), 50);
    const filter = { status: "published" };

    if (req.query.level) filter.level = req.query.level;
    if (req.query.set_num) filter.set_num = Number(req.query.set_num);
    if (req.query.yearMin || req.query.yearMax) {
      filter.year = {};
      if (req.query.yearMin) filter.year.$gte = Number(req.query.yearMin);
      if (req.query.yearMax) filter.year.$lte = Number(req.query.yearMax);
    }

    const [exams, total] = await Promise.all([
      Exam.find(filter)
        .select("title level year month set_num source status")
        .sort({ year: -1, month: -1, level: 1, set_num: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Exam.countDocuments(filter)
    ]);

    const examIds = exams.map((exam) => exam._id);
    const sections = await Section.find({ exam_id: { $in: examIds } })
      .select("exam_id section_type total_score time_limit")
      .lean();
    const sectionIds = sections.map((section) => section._id);

    const [questionStats, completionStats] = await Promise.all([
      Question.aggregate([
        { $match: { section_id: { $in: sectionIds } } },
        {
          $group: {
            _id: "$section_id",
            count: { $sum: 1 },
            avgDifficulty: { $avg: "$difficulty" }
          }
        }
      ]),
      UserAnswer.aggregate([
        { $match: { exam_id: { $in: examIds }, submitted_at: { $ne: null } } },
        { $group: { _id: "$exam_id", users: { $addToSet: "$user_id" } } }
      ])
    ]);

    const statsBySection = new Map(questionStats.map((row) => [String(row._id), row]));
    const completedByExam = new Map(completionStats.map((row) => [String(row._id), row.users.length]));
    const sectionsByExam = groupBy(sections, "exam_id");

    const data = exams.map((exam) => {
      const examSections = sectionsByExam.get(String(exam._id)) || [];
      const difficultyValues = [];
      const questionCount = examSections.reduce((sum, section) => {
        const stats = statsBySection.get(String(section._id));
        if (stats?.avgDifficulty) difficultyValues.push(stats.avgDifficulty);
        return sum + (stats?.count || 0);
      }, 0);
      const avgDifficulty = difficultyValues.length
        ? difficultyValues.reduce((sum, value) => sum + value, 0) / difficultyValues.length
        : 3;

      return {
        ...exam,
        questionCount,
        estimatedMinutes: examSections.reduce((sum, section) => sum + (section.time_limit || 0), 0),
        difficultyLabel: labelDifficulty(avgDifficulty),
        completedUsers: completedByExam.get(String(exam._id)) || 0
      };
    });

    res.json({
      success: true,
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    });
  } catch (error) {
    next(error);
  }
}

export async function getRuntimeExamSection(req, res, next) {
  try {
    const { examId, sectionType } = req.params;
    const exam = await Exam.findById(examId).lean();
    if (!exam) {
      return res.status(404).json({ success: false, error: { code: "EXAM_NOT_FOUND", message: "试卷不存在" } });
    }

    const section = await Section.findOne({ exam_id: examId, section_type: sectionType }).lean();
    if (!section) {
      return res.status(404).json({ success: false, error: { code: "SECTION_NOT_FOUND", message: "题型区块不存在" } });
    }

    const [questions, passages, audioFiles] = await Promise.all([
      Question.find({ section_id: section._id }).sort({ order_index: 1 }).lean(),
      Passage.find({ section_id: section._id }).sort({ order_index: 1 }).lean(),
      sectionType === "listening"
        ? AudioFile.find({ exam_id: examId, section_id: section._id }).select("-transcript_full").lean()
        : []
    ]);

    res.json({
      success: true,
      data: { exam, section, questions: sanitizeQuestionsForExam(questions), passages, audioFiles }
    });
  } catch (error) {
    next(error);
  }
}

export async function getRuntimeProgress(req, res, next) {
  try {
    const userId = getUserId(req);
    const rows = await UserAnswer.find({
      user_id: userId,
      exam_id: req.params.examId,
      submitted_at: null
    })
      .select("section_id question_id answer updated_at")
      .lean();

    res.json({
      success: true,
      data: {
        answers: rows.map((row) => ({
          section_id: row.section_id,
          question_id: row.question_id,
          answer: row.answer,
          updated_at: row.updated_at
        }))
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function saveRuntimeProgress(req, res, next) {
  try {
    const userId = getUserId(req);
    const { examId } = req.params;
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const now = new Date();

    const rows = answers.filter(isAnswerPayloadValid).map((item) => ({
      updateOne: {
        filter: {
          user_id: new mongoose.Types.ObjectId(userId),
          exam_id: new mongoose.Types.ObjectId(examId),
          question_id: new mongoose.Types.ObjectId(item.question_id),
          session_id: req.body.session_id ? new mongoose.Types.ObjectId(req.body.session_id) : null
        },
        update: {
          $set: {
            user_id: new mongoose.Types.ObjectId(userId),
            exam_id: new mongoose.Types.ObjectId(examId),
            section_id: new mongoose.Types.ObjectId(item.section_id),
            question_id: new mongoose.Types.ObjectId(item.question_id),
            session_id: req.body.session_id ? new mongoose.Types.ObjectId(req.body.session_id) : null,
            answer: item.answer,
            submitted_at: null,
            updated_at: now
          },
          $setOnInsert: { created_at: now }
        },
        upsert: true
      }
    }));

    if (rows.length) await UserAnswer.bulkWrite(rows);
    res.json({ success: true, message: "进度已保存", data: { saved: rows.length, savedAt: now } });
  } catch (error) {
    next(error);
  }
}

export async function submitRuntimeExam(req, res, next) {
  try {
    const userId = getUserId(req);
    const { examId } = req.params;
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const questionIds = answers.filter(isAnswerPayloadValid).map((item) => new mongoose.Types.ObjectId(item.question_id));
    const questions = await Question.find({ _id: { $in: questionIds } }).lean();
    const questionMap = new Map(questions.map((question) => [String(question._id), question]));
    const now = new Date();

    const details = answers.map((item) => {
      const question = questionMap.get(String(item.question_id));
      const result = gradeQuestion(question, item.answer);
      return {
        question_id: item.question_id,
        section_id: item.section_id,
        answer: item.answer,
        is_correct: result.isCorrect,
        score_awarded: result.score,
        correct_answer: question?.correct_answer,
        explanation: question?.explanation,
        transcript: question?.transcript,
        passage_ref: question?.passage_ref,
        question_text: question?.question_text,
        question_type: question?.question_type
      };
    });

    const writes = details.filter(isAnswerPayloadValid).map((detail) => ({
      updateOne: {
        filter: {
          user_id: new mongoose.Types.ObjectId(userId),
          exam_id: new mongoose.Types.ObjectId(examId),
          question_id: new mongoose.Types.ObjectId(detail.question_id),
          session_id: req.body.session_id ? new mongoose.Types.ObjectId(req.body.session_id) : null
        },
        update: {
          $set: {
            user_id: new mongoose.Types.ObjectId(userId),
            exam_id: new mongoose.Types.ObjectId(examId),
            section_id: new mongoose.Types.ObjectId(detail.section_id),
            question_id: new mongoose.Types.ObjectId(detail.question_id),
            session_id: req.body.session_id ? new mongoose.Types.ObjectId(req.body.session_id) : null,
            answer: detail.answer,
            is_correct: detail.is_correct,
            score_awarded: detail.score_awarded,
            submitted_at: now,
            updated_at: now
          },
          $setOnInsert: { created_at: now }
        },
        upsert: true
      }
    }));

    if (writes.length) await UserAnswer.bulkWrite(writes);

    const totalScore = details.reduce((sum, item) => sum + (item.score_awarded || 0), 0);
    const byType = details.reduce((acc, item) => {
      const type = item.question_type || "unknown";
      if (!acc[type]) acc[type] = { total: 0, correct: 0, score: 0 };
      acc[type].total += 1;
      if (item.is_correct) acc[type].correct += 1;
      acc[type].score += item.score_awarded || 0;
      return acc;
    }, {});

    res.json({ success: true, message: "交卷成功", data: { totalScore, byType, details } });
  } catch (error) {
    next(error);
  }
}

function sanitizeQuestionsForExam(questions) {
  return questions.map(({ correct_answer, explanation, transcript, ...question }) => question);
}

function gradeQuestion(question, answer) {
  if (!question) return { isCorrect: false, score: 0 };
  if (!OBJECTIVE_TYPES.has(question.question_type)) return { isCorrect: null, score: null };
  const expected = normalizeAnswer(question.correct_answer);
  const actual = normalizeAnswer(answer);
  const isCorrect = JSON.stringify(expected) === JSON.stringify(actual);
  return { isCorrect, score: isCorrect ? question.score || 0 : 0 };
}

function normalizeAnswer(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean).sort();
  if (value === undefined || value === null) return [];
  return [String(value).trim()].filter(Boolean).sort();
}

function isAnswerPayloadValid(item) {
  return item?.question_id && item?.section_id;
}

function getUserId(req) {
  return req.user?.id || req.header("x-user-id") || DEFAULT_USER_ID;
}

function groupBy(rows, key) {
  const map = new Map();
  rows.forEach((row) => {
    const id = String(row[key]);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  });
  return map;
}

function labelDifficulty(value) {
  if (value <= 2) return "基础";
  if (value <= 3.5) return "中等";
  return "较难";
}
