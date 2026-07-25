import mongoose from "mongoose";

const { Schema } = mongoose;

export const aiCompletionCandidateSchema = new Schema(
  {
    exam_id: { type: Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
    section_id: { type: Schema.Types.ObjectId, ref: "Section", required: true, index: true },
    question_id: { type: Schema.Types.ObjectId, ref: "Question", required: true, index: true },
    audio_file_id: { type: Schema.Types.ObjectId, ref: "AudioFile", default: null, index: true },
    candidate_type: { type: String, enum: ["transcript", "explanation"], required: true, index: true },
    provider: { type: String, default: "openai" },
    model: { type: String, required: true },
    prompt_version: { type: String, default: "cet-explanation-v1" },
    status: {
      type: String,
      enum: ["pending_review", "approved", "rejected", "superseded"],
      default: "pending_review",
      index: true
    },
    content: {
      text: { type: String, default: "" },
      segments: {
        type: [
          {
            start: { type: Number, default: null },
            end: { type: Number, default: null },
            text: { type: String, required: true }
          }
        ],
        default: []
      },
      evidence_sentence: { type: String, default: "" },
      why_correct: { type: String, default: "" },
      option_analysis: { type: Schema.Types.Mixed, default: {} },
      raw_response: { type: Schema.Types.Mixed, default: null }
    },
    source_snapshot: {
      question_text: { type: Schema.Types.Mixed, default: null },
      options: { type: Schema.Types.Mixed, default: [] },
      correct_answer: { type: Schema.Types.Mixed, default: null },
      transcript: { type: String, default: "" },
      audio_start_time: { type: Number, default: null },
      audio_end_time: { type: Number, default: null }
    },
    review_note: { type: String, default: "" },
    reviewed_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewed_at: { type: Date, default: null }
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

aiCompletionCandidateSchema.index({ question_id: 1, candidate_type: 1, status: 1 });
aiCompletionCandidateSchema.index({ audio_file_id: 1, candidate_type: 1, status: 1 });

export const AiCompletionCandidate = mongoose.model("AiCompletionCandidate", aiCompletionCandidateSchema);
