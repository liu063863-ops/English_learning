# Task 4 Question Bank Admin

## Backend Mount

Install dependencies in your Node backend:

```bash
pnpm add mongoose multer
```

Mount route:

```js
import adminQuestionRoutes from "./routes/adminQuestionRoutes.js";

app.use("/api/admin", adminQuestionRoutes);
app.use("/uploads", express.static("uploads"));
```

## APIs

### Preview import

```bash
curl -X POST "http://127.0.0.1:4000/api/admin/questions/bulk-import/preview" \
  -F "file=@backend/data/extracted/example-cet4-2023-06-set1.mongo-import.json"
```

### Confirm import

```bash
curl -X POST "http://127.0.0.1:4000/api/admin/questions/bulk-import?mode=skip" \
  -F "file=@backend/data/extracted/example-cet4-2023-06-set1.mongo-import.json"
```

Use `mode=update` to replace existing same level/year/month/set/source paper.

### List question bank

```bash
curl "http://127.0.0.1:4000/api/admin/questions?level=CET4&year=2023&page=1&pageSize=20"
```

### Preview whole paper

```bash
curl "http://127.0.0.1:4000/api/admin/exams/<examId>/preview"
```

### Edit question

```bash
curl -X PATCH "http://127.0.0.1:4000/api/admin/questions/<questionId>" \
  -H "Content-Type: application/json" \
  -d "{\"question_text\":{\"raw\":\"Updated question text\"}}"
```

### Update audio timeline

```bash
curl -X PATCH "http://127.0.0.1:4000/api/admin/questions/<questionId>/timeline" \
  -H "Content-Type: application/json" \
  -d "{\"audio_start_time\":12,\"audio_end_time\":38,\"transcript\":\"audio clip transcript\"}"
```

### Replace audio

```bash
curl -X POST "http://127.0.0.1:4000/api/admin/audio/<audioId>/replace" \
  -F "file=@listening.mp3"
```

## Frontend Mount

Copy:

```text
docs/frontend/task4-question-admin/AdminQuestionBankPage.jsx
docs/frontend/task4-question-admin/admin-question-bank.css
```

Then mount in your React router:

```jsx
import AdminQuestionBankPage from "./AdminQuestionBankPage.jsx";

<Route path="/admin/questions" element={<AdminQuestionBankPage />} />
```

## Validation Rules

- `exams`, `sections`, `questions` must be arrays.
- Objective questions must have non-empty question text.
- Choice questions require at least two options.
- Single choice requires exactly one correct option.
- Multiple choice requires at least one correct option.
- Objective questions require `correct_answer`.
- `section_id`, `passage_id`, `audio_file_id` references must exist in the import JSON.
- Duplicate exam detection uses `level + year + month + set_num + source`.
