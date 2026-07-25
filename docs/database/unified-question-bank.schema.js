import mongoose from "mongoose";

const { Schema } = mongoose;

export const examSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    level: { type: String, enum: ["CET4", "CET6"], required: true },
    year: { type: Number, default: null },
    month: { type: Number, enum: [3, 6, 9, 12, null], default: null },
    set_num: { type: Number, min: 1, max: 9, default: null },
    source: { type: String, enum: ["past_exam", "mock", "custom"], required: true },
    source_meta: {
      provider: { type: String, default: "" },
      repo: { type: String, default: "" },
      folder_path: { type: String, default: "" },
      question_pdf_url: { type: String, default: "" },
      answer_pdf_url: { type: String, default: "" }
    },
    status: { type: String, enum: ["draft", "published", "archived"], default: "draft" }
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const sectionSchema = new Schema(
  {
    exam_id: { type: Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
    section_type: { type: String, enum: ["listening", "reading", "translation", "writing"], required: true },
    section_name: { type: String, required: true },
    order_index: { type: Number, required: true },
    total_score: { type: Number, default: 0 },
    time_limit: { type: Number, default: null }
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const passageSchema = new Schema(
  {
    section_id: { type: Schema.Types.ObjectId, ref: "Section", required: true, index: true },
    title: { type: String, default: "" },
    order_index: { type: Number, required: true },
    passage_text: { type: String, required: true },
    paragraph_markers: {
      type: [
        {
          paragraph_id: { type: String, required: true },
          order_index: { type: Number, required: true },
          start_offset: { type: Number, default: null },
          end_offset: { type: Number, default: null },
          text_preview: { type: String, default: "" }
        }
      ],
      default: []
    }
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const audioFileSchema = new Schema(
  {
    exam_id: { type: Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
    section_id: { type: Schema.Types.ObjectId, ref: "Section", default: null, index: true },
    file_url: { type: String, required: true },
    duration: { type: Number, default: 0 },
    transcript_full: { type: String, default: "" },
    source_meta: {
      file_name: { type: String, default: "" },
      github_url: { type: String, default: "" },
      raw_url: { type: String, default: "" }
    }
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const questionSchema = new Schema(
  {
    section_id: { type: Schema.Types.ObjectId, ref: "Section", required: true, index: true },
    passage_id: { type: Schema.Types.ObjectId, ref: "Passage", default: null, index: true },
    audio_file_id: { type: Schema.Types.ObjectId, ref: "AudioFile", default: null, index: true },
    question_type: { type: String, enum: ["single_choice", "multiple_choice", "blank", "subjective"], required: true },
    order_index: { type: Number, required: true },
    question_text: {
      raw: { type: String, required: true },
      html: { type: String, default: "" }
    },
    options: {
      type: [
        {
          key: { type: String, required: true },
          text: { type: String, required: true },
          is_correct: { type: Boolean, default: false }
        }
      ],
      default: []
    },
    correct_answer: { type: Schema.Types.Mixed, default: null },
    explanation: {
      raw: { type: String, default: "" },
      html: { type: String, default: "" }
    },
    audio_start_time: { type: Number, default: null },
    audio_end_time: { type: Number, default: null },
    transcript: { type: String, default: "" },
    passage_ref: {
      passage_id: { type: Schema.Types.ObjectId, ref: "Passage", default: null },
      paragraph_ids: { type: [String], default: [] },
      evidence_text: { type: String, default: "" }
    },
    tags: { type: [String], default: [] },
    difficulty: { type: Number, min: 1, max: 5, default: 3 },
    score: { type: Number, default: 0 },
    import_meta: {
      source_question_no: { type: String, default: "" },
      confidence: { type: Number, min: 0, max: 1, default: 0 },
      needs_review: { type: Boolean, default: true }
    }
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const userAnswerSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    exam_id: { type: Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
    section_id: { type: Schema.Types.ObjectId, ref: "Section", required: true },
    question_id: { type: Schema.Types.ObjectId, ref: "Question", required: true, index: true },
    session_id: { type: Schema.Types.ObjectId, ref: "ExamSession", default: null, index: true },
    answer: { type: Schema.Types.Mixed, default: null },
    is_correct: { type: Boolean, default: null },
    score_awarded: { type: Number, default: null },
    submitted_at: { type: Date, default: null }
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

examSchema.index({ level: 1, year: -1, month: -1, set_num: 1, source: 1 });
examSchema.index({ status: 1, level: 1, year: -1, month: -1 });
examSchema.index({ level: 1, year: 1, month: 1, set_num: 1, source: 1 }, { unique: true, partialFilterExpression: { source: "past_exam" } });

sectionSchema.index({ exam_id: 1, order_index: 1 }, { unique: true });
sectionSchema.index({ exam_id: 1, section_type: 1 });

passageSchema.index({ section_id: 1, order_index: 1 }, { unique: true });

audioFileSchema.index({ exam_id: 1, section_id: 1 });

questionSchema.index({ section_id: 1, order_index: 1 });
questionSchema.index({ passage_id: 1, order_index: 1 });
questionSchema.index({ question_type: 1, difficulty: 1 });
questionSchema.index({ tags: 1 });
questionSchema.index({ "import_meta.needs_review": 1, "import_meta.confidence": 1 });

userAnswerSchema.index({ user_id: 1, question_id: 1, session_id: 1 });
userAnswerSchema.index({ user_id: 1, exam_id: 1, updated_at: -1 });

export const Exam = mongoose.model("Exam", examSchema);
export const Section = mongoose.model("Section", sectionSchema);
export const Passage = mongoose.model("Passage", passageSchema);
export const AudioFile = mongoose.model("AudioFile", audioFileSchema);
export const Question = mongoose.model("Question", questionSchema);
export const UserAnswer = mongoose.model("UserAnswer", userAnswerSchema);
