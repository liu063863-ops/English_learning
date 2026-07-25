# Task 5 Exam Runtime APIs

Mount:

```js
import examRuntimeRoutes from "./routes/examRuntimeRoutes.js";

app.use("/api/runtime", examRuntimeRoutes);
```

## List exams

```bash
curl "http://127.0.0.1:4000/api/runtime/exams?level=CET4&yearMin=2018&yearMax=2023&set_num=1&page=1&pageSize=12"
```

Returns `questionCount`, `estimatedMinutes`, `difficultyLabel`, `completedUsers`.

## Lazy-load section

```bash
curl "http://127.0.0.1:4000/api/runtime/exams/<examId>/sections/listening"
curl "http://127.0.0.1:4000/api/runtime/exams/<examId>/sections/reading"
curl "http://127.0.0.1:4000/api/runtime/exams/<examId>/sections/translation"
curl "http://127.0.0.1:4000/api/runtime/exams/<examId>/sections/writing"
```

Listening returns `audioFiles` and questions. Exam-time response removes `correct_answer`, `explanation` and per-question `transcript`; these fields are returned only after submission.

## Restore progress

```bash
curl "http://127.0.0.1:4000/api/runtime/exams/<examId>/progress" \
  -H "x-user-id: 64f000000000000000000001"
```

Returns unfinished saved answers, keyed by `question_id`, so the frontend can recover after refresh.

## Save progress

```bash
curl -X PATCH "http://127.0.0.1:4000/api/runtime/exams/<examId>/progress" \
  -H "Content-Type: application/json" \
  -H "x-user-id: 64f000000000000000000001" \
  -d "{\"answers\":[{\"question_id\":\"...\",\"section_id\":\"...\",\"answer\":\"A\"}]}"
```

## Submit

```bash
curl -X POST "http://127.0.0.1:4000/api/runtime/exams/<examId>/submit" \
  -H "Content-Type: application/json" \
  -H "x-user-id: 64f000000000000000000001" \
  -d "{\"answers\":[{\"question_id\":\"...\",\"section_id\":\"...\",\"answer\":\"A\"}]}"
```

Response includes objective grading, explanation, transcript and passage references.
