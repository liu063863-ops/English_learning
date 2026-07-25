# CET Database Import Check and Idempotent Import

## 1. Check Whether 67 Complete Papers Are In MongoDB

```bash
node scripts/checkCetDatabaseImport.mjs \
  --mongo "mongodb://127.0.0.1:27017/english_exam"
```

Inputs:

- `backend/data/imported/cet_repo_papers.robust.json`

Output:

- `backend/data/reports/cet-db-import-check-report.json`

Report format:

```json
{
  "expected": {
    "paperCount": 70,
    "completePaperCount": 67,
    "incompletePaperCount": 3,
    "expectedImportedCount": 67
  },
  "database": {
    "connected": true,
    "examCount": 67,
    "importedCompleteCount": 67,
    "missingCompleteCount": 0,
    "extraPastExamCount": 0
  },
  "sampleChecks": [
    {
      "paper": {},
      "sectionCounts": {
        "listening": 25,
        "reading": 30,
        "translation": 1,
        "writing": 1
      },
      "audioCount": 1,
      "passageCount": 3,
      "questionCount": 57,
      "structureOk": true
    }
  ],
  "verdict": "pass"
}
```

## 2. Import Missing Complete Papers

Dry run, no DB writes:

```bash
node scripts/importCompleteCetPapers.mjs \
  --mongo "mongodb://127.0.0.1:27017/english_exam"
```

Download PDFs/MP3s, run parser, but still no DB writes:

```bash
node scripts/importCompleteCetPapers.mjs \
  --mongo "mongodb://127.0.0.1:27017/english_exam" \
  --download
```

Actually write MongoDB:

```bash
node scripts/importCompleteCetPapers.mjs \
  --mongo "mongodb://127.0.0.1:27017/english_exam" \
  --download \
  --apply
```

Useful options:

```bash
--limit 3
--python "C:/Users/liujinhao/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe"
--papers backend/data/imported/cet_repo_papers.robust.json
--extractedDir backend/data/extracted/robust-import
```

## Idempotent Import Rules

Unique exam identity:

```text
level + year + month + set_num + source
```

Behavior:

- Existing complete exam: skip.
- Existing incomplete exam: insert missing sections/audio/passages/questions.
- Existing question: only fill empty fields, never overwrite non-empty content.
- Missing exam: insert full parsed payload.
- Incomplete scanned papers: listed in report, not imported.

## 3. Verify After Import

Run check again:

```bash
node scripts/checkCetDatabaseImport.mjs \
  --mongo "mongodb://127.0.0.1:27017/english_exam"
```

Acceptance:

- `expected.completePaperCount == 67`
- `database.importedCompleteCount == 67`
- `database.missingCompleteCount == 0`
- sample `structureOk == true`
