import mongoose from "mongoose";

const { Schema } = mongoose;

const answerDraftSchema = new Schema(
  {
    questionKey: { type: String, required: true },
    answer: { type: Schema.Types.Mixed, default: null },
    updatedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const examSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    examPaperId: { type: Schema.Types.ObjectId, ref: "ExamPaper", required: true, index: true },
    status: {
      type: String,
      enum: ["in_progress", "submitted", "expired", "abandoned"],
      default: "in_progress",
      index: true
    },
    startedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    submittedAt: { type: Date, default: null },
    answers: { type: [answerDraftSchema], default: [] },
    currentSectionType: {
      type: String,
      enum: ["listening", "reading", "translation", "writing", null],
      default: null
    },
    lastActiveAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// Prevent duplicate active sessions for the same user and same paper.
examSessionSchema.index(
  { userId: 1, examPaperId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "in_progress" }
  }
);

examSessionSchema.index({ userId: 1, status: 1, lastActiveAt: -1 });
examSessionSchema.index({ expiresAt: 1 });

export const ExamSession = mongoose.model("ExamSession", examSessionSchema);
