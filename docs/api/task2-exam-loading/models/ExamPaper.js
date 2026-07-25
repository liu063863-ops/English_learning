import mongoose from "mongoose";

const { Schema } = mongoose;

const optionSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    text: { type: String, required: true, trim: true }
  },
  { _id: false }
);

const questionSchema = new Schema(
  {
    questionNo: { type: Number, required: true },
    questionKey: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["single-choice", "multiple-choice", "blank", "subjective"],
      required: true
    },
    prompt: { type: String, required: true },
    options: { type: [optionSchema], default: [] },
    correctAnswer: { type: Schema.Types.Mixed, required: true },
    explanation: { type: String, required: true },
    knowledgeTags: { type: [String], default: [] },
    difficulty: { type: Number, min: 1, max: 5, required: true },
    score: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const listeningSegmentSchema = new Schema(
  {
    segmentNo: { type: Number, required: true },
    title: { type: String, required: true },
    startSec: { type: Number, required: true, min: 0 },
    endSec: { type: Number, required: true, min: 0 },
    transcript: { type: String, default: "" },
    questions: { type: [questionSchema], default: [] }
  },
  { _id: false }
);

const readingPassageSchema = new Schema(
  {
    passageNo: { type: Number, required: true },
    title: { type: String, default: "" },
    content: { type: String, required: true },
    questions: { type: [questionSchema], default: [] }
  },
  { _id: false }
);

const sectionSchema = new Schema(
  {
    sectionNo: { type: Number, required: true },
    type: {
      type: String,
      enum: ["listening", "reading", "translation", "writing"],
      required: true
    },
    title: { type: String, required: true },
    instruction: { type: String, default: "" },
    totalScore: { type: Number, required: true, min: 0 },
    durationMinutes: { type: Number, default: null },
    audio: {
      url: { type: String, default: "" },
      durationSec: { type: Number, default: 0 },
      format: { type: String, default: "mp3" }
    },
    listeningSegments: { type: [listeningSegmentSchema], default: [] },
    readingPassages: { type: [readingPassageSchema], default: [] },
    questions: { type: [questionSchema], default: [] }
  },
  { _id: false }
);

const examPaperSchema = new Schema(
  {
    examType: { type: String, enum: ["CET4", "CET6"], required: true },
    year: { type: Number, required: true },
    month: { type: Number, enum: [6, 12], required: true },
    paperNo: { type: Number, required: true },
    title: { type: String, required: true },
    source: {
      provider: { type: String, default: "" },
      originalUrl: { type: String, default: "" },
      importedAt: { type: Date, default: Date.now }
    },
    totalScore: { type: Number, default: 100 },
    durationMinutes: { type: Number, required: true },
    sections: { type: [sectionSchema], default: [] },
    status: { type: String, enum: ["draft", "published", "archived"], default: "draft" }
  },
  { timestamps: true }
);

examPaperSchema.index({ examType: 1, year: -1, month: -1, paperNo: 1 }, { unique: true });
examPaperSchema.index({ status: 1, year: -1, month: -1 });
examPaperSchema.index({ "sections.type": 1 });

export const ExamPaper = mongoose.model("ExamPaper", examPaperSchema);
