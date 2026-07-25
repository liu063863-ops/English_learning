import express from "express";
import {
  getRuntimeExamSection,
  getRuntimeProgress,
  listRuntimeExams,
  saveRuntimeProgress,
  submitRuntimeExam
} from "../controllers/examRuntimeController.js";

const router = express.Router();

router.get("/exams", listRuntimeExams);
router.get("/exams/:examId/sections/:sectionType", getRuntimeExamSection);
router.get("/exams/:examId/progress", getRuntimeProgress);
router.patch("/exams/:examId/progress", saveRuntimeProgress);
router.post("/exams/:examId/submit", submitRuntimeExam);

export default router;
