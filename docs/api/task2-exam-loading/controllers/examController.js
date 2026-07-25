import mongoose from "mongoose";
import { ExamPaper } from "../models/ExamPaper.js";
import { ExamSession } from "../models/ExamSession.js";
import { ApiError } from "../middlewares/errorHandler.js";
import { ok } from "../utils/apiResponse.js";

const LIST_PROJECTION = {
  examType: 1,
  year: 1,
  month: 1,
  paperNo: 1,
  title: 1,
  totalScore: 1,
  durationMinutes: 1,
  status: 1,
  createdAt: 1
};

export async function listExams(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 100);
    const filter = { status: "published" };

    if (req.query.examType) filter.examType = req.query.examType;
    if (req.query.year) filter.year = Number(req.query.year);
    if (req.query.month) filter.month = Number(req.query.month);
    if (req.query.paperNo) filter.paperNo = Number(req.query.paperNo);

    const [items, total] = await Promise.all([
      ExamPaper.find(filter, LIST_PROJECTION)
        .sort({ year: -1, month: -1, examType: 1, paperNo: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      ExamPaper.countDocuments(filter)
    ]);

    return ok(res, items, "试卷列表获取成功", {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    });
  } catch (error) {
    next(error);
  }
}

export async function getExamDetail(req, res, next) {
  try {
    assertObjectId(req.params.id, "试卷 ID 格式不正确");

    const sectionType = req.query.sectionType;
    const lazyAudio = req.query.lazyAudio !== "false";
    const paper = await ExamPaper.findById(req.params.id).lean();

    if (!paper || paper.status !== "published") {
      throw new ApiError(404, "EXAM_NOT_FOUND", "试卷不存在或未发布");
    }

    let sections = paper.sections || [];
    if (sectionType) {
      sections = sections.filter((section) => section.type === sectionType);
    }

    // By default, audio metadata is returned but heavy transcript fields can be loaded by sectionType=listening.
    if (lazyAudio && sectionType !== "listening") {
      sections = sections.map((section) => {
        if (section.type !== "listening") return section;
        return {
          ...section,
          listeningSegments: section.listeningSegments.map((segment) => ({
            ...segment,
            transcript: ""
          }))
        };
      });
    }

    return ok(res, { ...paper, sections }, "试卷详情获取成功");
  } catch (error) {
    next(error);
  }
}

export async function startExam(req, res, next) {
  try {
    assertObjectId(req.params.id, "试卷 ID 格式不正确");
    assertObjectId(req.user.id, "用户 ID 格式不正确");

    const paper = await ExamPaper.findOne({
      _id: req.params.id,
      status: "published"
    }).lean();

    if (!paper) {
      throw new ApiError(404, "EXAM_NOT_FOUND", "试卷不存在或未发布");
    }

    const existing = await ExamSession.findOne({
      userId: req.user.id,
      examPaperId: req.params.id,
      status: "in_progress"
    }).lean();

    if (existing) {
      return ok(res, existing, "已存在进行中的考试，本次返回原 session");
    }

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + paper.durationMinutes * 60 * 1000);

    const session = await ExamSession.create({
      userId: req.user.id,
      examPaperId: req.params.id,
      status: "in_progress",
      startedAt,
      expiresAt,
      currentSectionType: paper.sections?.[0]?.type || null,
      answers: []
    });

    return ok(res, session.toObject(), "考试开始成功");
  } catch (error) {
    next(error);
  }
}

export async function getExamProgress(req, res, next) {
  try {
    assertObjectId(req.params.id, "试卷 ID 格式不正确");
    assertObjectId(req.user.id, "用户 ID 格式不正确");

    const session = await ExamSession.findOne({
      userId: req.user.id,
      examPaperId: req.params.id,
      status: "in_progress"
    })
      .populate("examPaperId", "examType year month paperNo title durationMinutes totalScore sections.type sections.title sections.totalScore")
      .lean();

    if (!session) {
      throw new ApiError(404, "SESSION_NOT_FOUND", "没有找到该试卷的进行中考试");
    }

    const now = Date.now();
    const expiresAt = new Date(session.expiresAt).getTime();
    const answeredCount = session.answers.filter((item) => item.answer !== null && item.answer !== "").length;

    return ok(
      res,
      {
        sessionId: session._id,
        examPaper: session.examPaperId,
        status: session.status,
        startedAt: session.startedAt,
        expiresAt: session.expiresAt,
        remainingSeconds: Math.max(Math.floor((expiresAt - now) / 1000), 0),
        currentSectionType: session.currentSectionType,
        answeredCount,
        answers: session.answers
      },
      "答题进度获取成功"
    );
  } catch (error) {
    next(error);
  }
}

function assertObjectId(value, message) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, "INVALID_OBJECT_ID", message, { value });
  }
}
