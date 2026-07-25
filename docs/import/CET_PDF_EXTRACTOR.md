# CET PDF Extractor

This extractor converts one local CET paper folder into MongoDB import JSON.

Input folder should contain:

```text
paper-folder/
  真题.pdf
  答案解析.pdf
  听力.mp3
```

Run:

```powershell
$PY="C:\Users\liujinhao\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

& $PY "C:\Users\liujinhao\Documents\New project\kaoyan-english-lab\scripts\extract_cet_pdf.py" `
  --input "D:\CET\2023年6月CET4第1套" `
  --copy-audio
```

Output:

```text
backend/data/extracted/<paper_id>.mongo-import.json
backend/data/extracted/audio/<paper_id>.mp3
backend/data/extracted/cet_pdf_extract.log
```

The JSON contains:

```text
exams
sections
audio_files
passages
questions
extract_meta
```

Important behavior:

- Text PDFs are parsed by `pdfplumber`.
- Scanned PDFs are detected when extracted text is too short; OCR is not executed in this task, but the warning is logged.
- Question and answer matching is heuristic and sets `import_meta.needs_review=true` when confidence is low.
- Answer sentence highlighting is not shown in exams; evidence fields are stored in `passage_ref`.

Mongo import:

Import each array into its matching collection:

```text
exams -> exams
sections -> sections
audio_files -> audio_files
passages -> passages
questions -> questions
```
