# Task 6 Question Bank Quality Monitor

## Design

This module adds a quality loop on top of the unified question bank:

1. A CLI script scans MongoDB and reports missing fields, invalid options, missing listening audio, timeline errors and low-confidence imported questions.
2. Students can submit question feedback during exam or practice.
3. Admins can review quality issues and user feedback, fix questions, and mark issues as fixed.
4. Every admin fix writes a `question_revisions` history record.
5. Incremental import compares exam identity keys and imports only new papers.

Exam identity key:

```text
level + year + month + set_num + source
```

## Mount API

```js
import qualityRoutes from "./routes/qualityRoutes.js";

app.use("/api/quality", qualityRoutes);
```

## Quality Check Script

```bash
node scripts/questionBankQualityCheck.mjs \
  --mongo "mongodb://127.0.0.1:27017/english_exam" \
  --output "backend/data/reports/question-bank-quality-report.json" \
  --persist
```

Without `--persist`, the script only writes a JSON report. With `--persist`, it upserts open issues into `quality_issues`.

## APIs

### Student Feedback

```bash
curl -X POST "http://127.0.0.1:4000/api/quality/feedback" \
  -H "Content-Type: application/json" \
  -H "x-user-id: 64f000000000000000000001" \
  -d "{\"exam_id\":\"...\",\"section_id\":\"...\",\"question_id\":\"...\",\"category\":\"wrong_answer\",\"description\":\"答案疑似应为 B\"}"
```

### Admin Feedback List

```bash
curl "http://127.0.0.1:4000/api/quality/admin/feedback?status=pending&page=1&pageSize=20"
```

### Admin Quality Issues

```bash
curl "http://127.0.0.1:4000/api/quality/admin/issues?status=open&page=1&pageSize=20"
```

### Fix Question and Record Revision

```bash
curl -X PATCH "http://127.0.0.1:4000/api/quality/admin/questions/<questionId>" \
  -H "Content-Type: application/json" \
  -H "x-user-id: 64f000000000000000000001" \
  -d "{\"patch\":{\"correct_answer\":\"B\",\"explanation\":{\"raw\":\"修正后的解析\"}},\"reason\":\"管理员确认原答案错误\",\"feedback_id\":\"...\",\"issue_id\":\"...\"}"
```

### Revision History

```bash
curl "http://127.0.0.1:4000/api/quality/admin/questions/<questionId>/revisions"
```

### Incremental Import Preview

```bash
curl -X POST "http://127.0.0.1:4000/api/quality/admin/imports/incremental-preview" \
  -H "Content-Type: application/json" \
  -d @backend/data/extracted/new-papers.mongo-import.json
```

### Incremental Import Run

```bash
curl -X POST "http://127.0.0.1:4000/api/quality/admin/imports/incremental-run" \
  -H "Content-Type: application/json" \
  -H "x-user-id: 64f000000000000000000001" \
  -d @backend/data/extracted/new-papers.mongo-import.json
```

## Frontend Integration

Student side:

```jsx
import QuestionFeedbackButton from "./QuestionFeedbackButton";

<QuestionFeedbackButton
  examId={data.exam._id}
  sectionId={question.section_id}
  questionId={question._id}
/>
```

Admin side:

```jsx
import AdminQualityMonitorPage from "./AdminQualityMonitorPage";
```

## Acceptance

- The quality script creates a JSON report and can persist issue rows.
- Students can mark a question as wrong, unclear audio, bad explanation, typo or other.
- Admins can list feedback and auto-detected issues, confirm or ignore them.
- Admins can patch question fields and every patch creates a revision history record.
- Incremental import skips existing exam identity keys and imports only new papers.
