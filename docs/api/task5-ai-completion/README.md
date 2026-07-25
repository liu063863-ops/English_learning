# Task 5 AI Completion for Missing Transcript and Explanation

## Goal

AI-generated content is never published directly. It is stored as `ai_completion_candidates` with `pending_review`, then an admin approves or rejects it.

Status flow:

```text
pending_review -> approved
pending_review -> rejected
pending_review -> superseded
```

Approve writes to `questions` and records a `question_revisions` row.

## Environment

```bash
set OPENAI_API_KEY=sk-...
set OPENAI_TRANSCRIPTION_MODEL=whisper-1
set OPENAI_EXPLANATION_MODEL=gpt-4.1-mini
```

## Mount API

```js
import aiCompletionRoutes from "./routes/aiCompletionRoutes.js";

app.use("/api/ai-completion", aiCompletionRoutes);
```

## Whisper Transcript Completion

```bash
curl -X POST "http://127.0.0.1:4000/api/ai-completion/audio/<audioFileId>/transcribe"
```

Behavior:

- Reads `audio_files.file_url`.
- Calls OpenAI audio transcription API with `response_format=verbose_json`.
- Stores full sentence/segment timestamps in candidate content.
- Slices transcript by each question's `audio_start_time` and `audio_end_time`.
- Creates one `transcript` candidate per question missing `question.transcript`.

## Explanation Completion

```bash
curl -X POST "http://127.0.0.1:4000/api/ai-completion/explanations/generate" \
  -H "Content-Type: application/json" \
  -d "{\"section_id\":\"...\",\"limit\":20}"
```

Prompt output is structured JSON:

```json
{
  "evidence_sentence": "答案定位句",
  "why_correct": "为什么选这个答案",
  "option_analysis": { "A": "...", "B": "...", "C": "...", "D": "..." },
  "markdown": "可直接展示给学生的中文解析"
}
```

## Review

List pending candidates:

```bash
curl "http://127.0.0.1:4000/api/ai-completion/candidates?status=pending_review&pageSize=20"
```

Approve and safely write only empty fields:

```bash
curl -X PATCH "http://127.0.0.1:4000/api/ai-completion/candidates/<candidateId>/approve" \
  -H "Content-Type: application/json" \
  -H "x-user-id: 64f000000000000000000001" \
  -d "{\"review_note\":\"人工审核通过\"}"
```

Force overwrite when the admin explicitly decides:

```bash
curl -X PATCH "http://127.0.0.1:4000/api/ai-completion/candidates/<candidateId>/approve" \
  -H "Content-Type: application/json" \
  -d "{\"force\":true,\"review_note\":\"确认覆盖原内容\"}"
```

Reject:

```bash
curl -X PATCH "http://127.0.0.1:4000/api/ai-completion/candidates/<candidateId>/reject" \
  -H "Content-Type: application/json" \
  -d "{\"review_note\":\"内容不准确\"}"
```

## Batch Script

Dry run:

```bash
node scripts/generateMissingAiCandidates.mjs --mode both --limit 20
```

Apply:

```bash
node scripts/generateMissingAiCandidates.mjs --mode both --limit 20 --apply
```

## Frontend

Admin page:

```jsx
import AdminAiCompletionReviewPage from "./AdminAiCompletionReviewPage";
```

## Safety

- Generated transcript/explanation is stored as candidate content first.
- Approval defaults to fill-empty-only.
- Every approval creates a `question_revisions` history record.
- Older pending candidates for the same question and type are marked `superseded` after one candidate is approved.
