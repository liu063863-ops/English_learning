import mongoose from "mongoose";

const { Schema } = mongoose;

export const qualityIssueSchema = new Schema(
  {
    exam_id: { type: Schema.Types.ObjectId, ref: "Exam", default: null, index: true },
    section_id: { type: Schema.Types.ObjectId, ref: "Section", default: null, index: true },
    question_id: { type: Schema.Types.ObjectId, ref: "Question", default: null, index: true },
    audio_file_id: { type: Schema.Types.ObjectId, ref: "AudioFile", default: null },
    issue_type: {
      type: String,
      enum: [
        "missing_field",
        "option_error",
        "missing_audio",
        "timeline_error",
        "low_confidence",
        "user_feedback",
        "missing_exam",
        "missing_question",
        "coverage_gap",
        "import_gate_failed"
      ],
      required: true,
      index: true
    },
    severity: { type: String, enum: ["low", "medium", "high", "critical"], default: "medium", index: true },
    title: { type: String, required: true },
    detail: { type: String, default: "" },
    field_path: { type: String, default: "" },
    status: { type: String, enum: ["open", "confirmed", "fixed", "ignored"], default: "open", index: true },
    detected_by: { type: String, enum: ["script", "user", "admin"], default: "script" },
    report_run_id: { type: String, default: "", index: true },
    fixed_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    fixed_at: { type: Date, default: null }
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const questionFeedbackSchema = new Schema(
  {
    exam_id: { type: Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
    section_id: { type: Schema.Types.ObjectId, ref: "Section", required: true, index: true },
    question_id: { type: Schema.Types.ObjectId, ref: "Question", required: true, index: true },
    user_id: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    category: {
      type: String,
      enum: ["wrong_answer", "unclear_audio", "bad_explanation", "typo", "other"],
      required: true,
      index: true
    },
    description: { type: String, default: "" },
    status: { type: String, enum: ["pending", "confirmed", "fixed", "rejected"], default: "pending", index: true },
    admin_note: { type: String, default: "" },
    resolved_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    resolved_at: { type: Date, default: null }
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const questionRevisionSchema = new Schema(
  {
    question_id: { type: Schema.Types.ObjectId, ref: "Question", required: true, index: true },
    exam_id: { type: Schema.Types.ObjectId, ref: "Exam", default: null, index: true },
    changed_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reason: { type: String, default: "" },
    change_source: { type: String, enum: ["admin_edit", "bulk_import", "quality_fix"], default: "admin_edit" },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, required: true },
    changed_fields: { type: [String], default: [] }
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const qualityMonitorRunSchema = new Schema(
  {
    run_id: { type: String, required: true, unique: true, index: true },
    trigger: { type: String, enum: ["scheduled", "manual", "import_gate"], required: true, index: true },
    status: { type: String, enum: ["success", "warning", "failed"], required: true, index: true },
    summary: { type: Schema.Types.Mixed, default: {} },
    alert_channels: { type: [String], default: [] },
    alert_sent: { type: Boolean, default: false },
    error_message: { type: String, default: "" },
    started_at: { type: Date, required: true },
    finished_at: { type: Date, default: null }
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

qualityIssueSchema.index({ question_id: 1, issue_type: 1, field_path: 1, status: 1 });
questionFeedbackSchema.index({ question_id: 1, category: 1, status: 1 });
questionRevisionSchema.index({ question_id: 1, created_at: -1 });
qualityMonitorRunSchema.index({ trigger: 1, started_at: -1 });

export const QualityIssue = mongoose.model("QualityIssue", qualityIssueSchema);
export const QuestionFeedback = mongoose.model("QuestionFeedback", questionFeedbackSchema);
export const QuestionRevision = mongoose.model("QuestionRevision", questionRevisionSchema);
export const QualityMonitorRun = mongoose.model("QualityMonitorRun", qualityMonitorRunSchema);
