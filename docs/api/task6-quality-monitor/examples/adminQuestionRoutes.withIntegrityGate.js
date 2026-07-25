import express from "express";
import multer from "multer";
import path from "node:path";
import {
  bulkImportQuestions,
  previewBulkImport
} from "../../task4-question-admin/controllers/adminQuestionController.js";
import { preImportIntegrityGate } from "../middlewares/preImportIntegrityGate.js";

const uploadRoot = process.env.UPLOAD_DIR || "uploads";
const jsonUpload = multer({ dest: path.join(uploadRoot, "imports") });

const router = express.Router();

router.post(
  "/questions/bulk-import/preview",
  jsonUpload.single("file"),
  preImportIntegrityGate({ checkAudioReachable: false }),
  previewBulkImport
);

router.post(
  "/questions/bulk-import",
  jsonUpload.single("file"),
  preImportIntegrityGate({ checkAudioReachable: process.env.QUALITY_GATE_CHECK_AUDIO === "true" }),
  bulkImportQuestions
);

export default router;
