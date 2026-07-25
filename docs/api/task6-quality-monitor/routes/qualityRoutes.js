import express from "express";
import {
  createQuestionFeedback,
  listImportableNewExams,
  listQualityIssues,
  listQuestionFeedback,
  listQuestionRevisions,
  runIncrementalImportApi,
  updateQualityIssueStatus,
  updateQuestionFeedbackStatus,
  updateQuestionWithRevision
} from "../controllers/qualityController.js";
import {
  getQualityDashboard,
  listMonitorRuns,
  runManualIntegrityCheck
} from "../controllers/qualityDashboardController.js";

const router = express.Router();

router.post("/feedback", createQuestionFeedback);

router.get("/admin/feedback", listQuestionFeedback);
router.patch("/admin/feedback/:feedbackId/status", updateQuestionFeedbackStatus);

router.get("/admin/issues", listQualityIssues);
router.patch("/admin/issues/:issueId/status", updateQualityIssueStatus);

router.patch("/admin/questions/:questionId", updateQuestionWithRevision);
router.get("/admin/questions/:questionId/revisions", listQuestionRevisions);

router.post("/admin/imports/incremental-preview", listImportableNewExams);
router.post("/admin/imports/incremental-run", runIncrementalImportApi);

router.get("/admin/dashboard", getQualityDashboard);
router.post("/admin/integrity/run", runManualIntegrityCheck);
router.get("/admin/integrity/runs", listMonitorRuns);

export default router;
