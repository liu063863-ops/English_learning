import express from "express";
import multer from "multer";
import path from "node:path";
import {
  bulkImportQuestions,
  getExamPreview,
  listQuestionBank,
  previewBulkImport,
  replaceAudio,
  updateQuestion,
  updateQuestionTimeline
} from "../controllers/adminQuestionController.js";

const uploadRoot = process.env.UPLOAD_DIR || "uploads";
const jsonUpload = multer({ dest: path.join(uploadRoot, "imports") });
const audioUpload = multer({ dest: path.join(uploadRoot, "audio") });

const router = express.Router();

router.get("/questions", listQuestionBank);
router.post("/questions/bulk-import/preview", jsonUpload.single("file"), previewBulkImport);
router.post("/questions/bulk-import", jsonUpload.single("file"), bulkImportQuestions);
router.get("/exams/:examId/preview", getExamPreview);
router.patch("/questions/:questionId", updateQuestion);
router.patch("/questions/:questionId/timeline", updateQuestionTimeline);
router.post("/audio/:audioId/replace", audioUpload.single("file"), replaceAudio);

export default router;
