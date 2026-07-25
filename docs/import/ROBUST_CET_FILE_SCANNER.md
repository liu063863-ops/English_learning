# Robust CET File Scanner

## Purpose

Fixes root cause C: unstable GitHub file/folder names.

The scanner accepts either:

- local cloned repository folder
- existing `backend/data/imported/cet_repo_assets.json`

It outputs per-paper mappings:

```json
{
  "paperId": "cet4-2023-3-1",
  "level": "CET4",
  "year": 2023,
  "month": 3,
  "set_num": 1,
  "paperAssets": {
    "questionPdf": {},
    "questionDoc": {},
    "answerAnalysisPdf": {},
    "audioMp3": {},
    "notes": []
  },
  "completeness": {
    "hasQuestion": true,
    "hasAnswer": true,
    "hasAudio": true,
    "score": 100
  }
}
```

## Run

Using existing GitHub asset catalog:

```bash
node scripts/robustCetFileScanner.mjs
```

Using a local cloned repo:

```bash
node scripts/robustCetFileScanner.mjs --input "D:/data/CET4-6-past-exam-paper"
```

Custom outputs:

```bash
node scripts/robustCetFileScanner.mjs \
  --input backend/data/imported/cet_repo_assets.json \
  --output backend/data/imported/cet_repo_papers.robust.json \
  --report backend/data/imported/cet_repo_scan_report.robust.json
```

## Matching Rules

Supported variants:

- `CET4`, `CET-4`, `四级`, `英语四级`, `大学英语四级`, `4级`
- `CET6`, `CET-6`, `六级`, `英语六级`, `大学英语六级`, `6级`
- `第1套`, `第 1 套`, `第一套`, `1卷`, `set 1`, `paper 1`
- `全3套`, `全三套`, `共3套`, `全套`, `共用`
- `真题`, `试题`, `题目`, `试卷`, `paper`, `question`
- `答案`, `解析`, `详解`, `answer`, `analysis`, `key`

If a file contains both question and answer signals, such as `真题及答案`, it can fill both `questionPdf` and `answerAnalysisPdf`.

If an audio file is shared at folder/year level, it is propagated to missing papers. If only a nearby same-year same-level audio is available, it is marked:

```json
{
  "fallbackAudio": true,
  "fallbackReason": "nearest_audio_same_level_year:cet4-2020-9-1"
}
```

These fallback audio mappings should be reviewed before final import.

## Current Verification

Against the existing `cet_repo_assets.json`:

- asset match rate: `100%`
- complete paper mapping rate: `95.7%`
- output: `backend/data/imported/cet_repo_papers.robust.json`
- report: `backend/data/imported/cet_repo_scan_report.robust.json`
