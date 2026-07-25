import express from "express";
import {
  getExamDetail,
  getExamProgress,
  listExams,
  startExam
} from "../controllers/examController.js";
import { mockAuth } from "../middlewares/mockAuth.js";

const router = express.Router();

router.get("/", listExams);
router.get("/:id", getExamDetail);
router.post("/:id/start", mockAuth, startExam);
router.get("/:id/progress", mockAuth, getExamProgress);

export default router;
