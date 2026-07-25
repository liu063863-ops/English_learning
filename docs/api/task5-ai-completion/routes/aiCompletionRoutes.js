import express from "express";
import {
  approveAiCandidate,
  generateExplanationCandidates,
  generateTranscriptCandidates,
  listAiCandidates,
  rejectAiCandidate
} from "../controllers/aiCompletionController.js";

const router = express.Router();

router.post("/audio/:audioFileId/transcribe", generateTranscriptCandidates);
router.post("/explanations/generate", generateExplanationCandidates);
router.get("/candidates", listAiCandidates);
router.patch("/candidates/:candidateId/approve", approveAiCandidate);
router.patch("/candidates/:candidateId/reject", rejectAiCandidate);

export default router;
