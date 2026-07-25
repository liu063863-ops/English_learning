import mongoose from "mongoose";
import { Exam, Question, Section } from "../../task4-question-admin/models/QuestionBankModels.js";
import { QualityIssue, QuestionFeedback, QuestionRevision } from "../models/QualityModels.js";
import { previewIncrementalImport, runIncrementalImport } from "../services/incrementalImportService.js";

const DEFAULT_USER_ID = "64f000000000000000000001";

export async function createQuestionFeedback(req, res, next) {
  try {
    const { exam_id, section_id, question_id, category, description = "" } = req.body;
    if (!exam_id || !section_id || !question_id || !category) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_FEEDBACK", message: "exam_id、section_id、question_id、category 为必填项" }
      });
    }

    const feedback = await QuestionFeedback.create({
      exam_id,
      section_id,
      question_id,
      category,
      description,
      user_id: getUserId(req)
    });

    await QualityIssue.create({
      exam_id,
      section_id,
      question_id,
      issue_type: "user_feedback",
      severity: category === "wrong_answer" ? "high" : "medium",
      title: labelFeedbackCategory(category),
      detail: description,
      field_path: "user_feedback",
      detected_by: "user"
    });

    res.status(201).json({ success: true, message: "反馈已提交", data: feedback });
  } catch (error) {
    next(error);
  }
}

export async function listQuestionFeedback(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 100);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.question_id) filter.question_id = req.query.question_id;

    const [rows, total] = await Promise.all([
      QuestionFeedback.find(filter)
        .populate("exam_id", "title level year month set_num")
        .populate("section_id", "section_type section_name")
        .populate("question_id", "order_index question_text")
        .sort({ created_at: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      QuestionFeedback.countDocuments(filter)
    ]);

    res.json({ success: true, data: rows, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (error) {
    next(error);
  }
}

export async function updateQuestionFeedbackStatus(req, res, next) {
  try {
    const { status, admin_note = "" } = req.body;
    if (!["pending", "confirmed", "fixed", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, error: { code: "INVALID_STATUS", message: "反馈状态不合法" } });
    }

    const patch = { status, admin_note };
    if (["fixed", "rejected"].includes(status)) {
      patch.resolved_by = getUserId(req);
      patch.resolved_at = new Date();
    }

    const feedback = await QuestionFeedback.findByIdAndUpdate(req.params.feedbackId, patch, { new: true }).lean();
    if (!feedback) {
      return res.status(404).json({ success: false, error: { code: "FEEDBACK_NOT_FOUND", message: "反馈不存在" } });
    }

    res.json({ success: true, message: "反馈状态已更新", data: feedback });
  } catch (error) {
    next(error);
  }
}

export async function listQualityIssues(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 100);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.issue_type) filter.issue_type = req.query.issue_type;
    if (req.query.severity) filter.severity = req.query.severity;

    const [rows, total] = await Promise.all([
      QualityIssue.find(filter)
        .populate("exam_id", "title level year month set_num")
        .populate("section_id", "section_type section_name")
        .populate("question_id", "order_index question_text")
        .sort({ severity: -1, created_at: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      QualityIssue.countDocuments(filter)
    ]);

    res.json({ success: true, data: rows, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (error) {
    next(error);
  }
}

export async function updateQualityIssueStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!["open", "confirmed", "fixed", "ignored"].includes(status)) {
      return res.status(400).json({ success: false, error: { code: "INVALID_STATUS", message: "质量问题状态不合法" } });
    }

    const patch = { status };
    if (status === "fixed") {
      patch.fixed_by = getUserId(req);
      patch.fixed_at = new Date();
    }

    const issue = await QualityIssue.findByIdAndUpdate(req.params.issueId, patch, { new: true }).lean();
    if (!issue) {
      return res.status(404).json({ success: false, error: { code: "ISSUE_NOT_FOUND", message: "质量问题不存在" } });
    }

    res.json({ success: true, message: "质量问题状态已更新", data: issue });
  } catch (error) {
    next(error);
  }
}

export async function updateQuestionWithRevision(req, res, next) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const question = await Question.findById(req.params.questionId).session(session);
      if (!question) {
        throw Object.assign(new Error("题目不存在"), { statusCode: 404, code: "QUESTION_NOT_FOUND" });
      }

      const before = question.toObject();
      const allowedPatch = pickAllowedQuestionFields(req.body.patch || {});
      Object.assign(question, allowedPatch);
      await question.save({ session });

      const section = await Section.findById(question.section_id).session(session).lean();
      await QuestionRevision.create([{
        question_id: question._id,
        exam_id: section?.exam_id || null,
        changed_by: getUserId(req),
        reason: req.body.reason || "管理员修正题目",
        change_source: "quality_fix",
        before,
        after: question.toObject(),
        changed_fields: Object.keys(allowedPatch)
      }], { session });

      if (req.body.feedback_id) {
        await QuestionFeedback.findByIdAndUpdate(req.body.feedback_id, {
          status: "fixed",
          admin_note: req.body.reason || "",
          resolved_by: getUserId(req),
          resolved_at: new Date()
        }, { session });
      }

      if (req.body.issue_id) {
        await QualityIssue.findByIdAndUpdate(req.body.issue_id, {
          status: "fixed",
          fixed_by: getUserId(req),
          fixed_at: new Date()
        }, { session });
      }

      res.json({ success: true, message: "题目已修正并记录历史", data: question.toObject() });
    });
  } catch (error) {
    next(error);
  } finally {
    await session.endSession();
  }
}

export async function listQuestionRevisions(req, res, next) {
  try {
    const rows = await QuestionRevision.find({ question_id: req.params.questionId })
      .sort({ created_at: -1 })
      .lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
}

export async function listImportableNewExams(req, res, next) {
  try {
    const result = await previewIncrementalImport(req.body);

    res.json({
      success: true,
      data: {
        total: result.length,
        insertable: result.filter((item) => item.action === "insert_new").length,
        skipped: result.filter((item) => item.action === "skip_existing").length,
        exams: result
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function runIncrementalImportApi(req, res, next) {
  try {
    const report = await runIncrementalImport(req.body, { userId: getUserId(req) });
    res.json({ success: true, message: "增量导入完成", data: report });
  } catch (error) {
    next(error);
  }
}

function pickAllowedQuestionFields(patch) {
  const allowed = [
    "question_text",
    "options",
    "correct_answer",
    "explanation",
    "audio_file_id",
    "audio_start_time",
    "audio_end_time",
    "transcript",
    "passage_ref",
    "tags",
    "difficulty",
    "score",
    "import_meta"
  ];
  return allowed.reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(patch, key)) acc[key] = patch[key];
    return acc;
  }, {});
}

function labelFeedbackCategory(category) {
  return {
    wrong_answer: "用户反馈：答案可能有误",
    unclear_audio: "用户反馈：音频不清晰",
    bad_explanation: "用户反馈：解析可能有误",
    typo: "用户反馈：题干或选项疑似错别字",
    other: "用户反馈：其他问题"
  }[category] || "用户反馈：题目问题";
}

function getUserId(req) {
  return req.user?.id || req.header("x-user-id") || DEFAULT_USER_ID;
}
