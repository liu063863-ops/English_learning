# Continuous Question Bank Integrity Monitoring

## 1. Scheduled Reconcile

Start scheduler after MongoDB connection is ready:

```js
import { startQualityMonitorScheduler } from "./services/qualityScheduler.js";

const qualityScheduler = startQualityMonitorScheduler({
  runAtStartup: process.env.QUALITY_MONITOR_RUN_AT_STARTUP === "true"
});
```

Default interval is 7 days. Override:

```bash
set QUALITY_MONITOR_INTERVAL_MS=604800000
set QUALITY_MONITOR_RUN_AT_STARTUP=true
set QUALITY_ALERT_CHANNELS=log,dingtalk
set DINGTALK_WEBHOOK_URL=https://oapi.dingtalk.com/robot/send?access_token=...
```

The scheduler:

- compares expected papers from `backend/data/imported/cet_repo_papers.json`
- checks imported exams, sections, questions, passages and audio
- writes `quality_issues`
- writes `quality_monitor_runs`
- sends alerts when missing data or critical issues appear

## 2. Import Gate

Place middleware after upload parsing and before real import:

```js
import { preImportIntegrityGate } from "./middlewares/preImportIntegrityGate.js";

router.post(
  "/questions/bulk-import",
  jsonUpload.single("file"),
  preImportIntegrityGate({ checkAudioReachable: true }),
  bulkImportQuestions
);
```

The gate blocks import with `422 IMPORT_INTEGRITY_FAILED` when:

- required sections are missing
- question order is not continuous
- required fields are empty
- objective answers/options are missing
- listening audio is missing or unreachable
- reading passages are missing

## 3. Dashboard APIs

```bash
curl "http://127.0.0.1:4000/api/quality/admin/dashboard"
curl -X POST "http://127.0.0.1:4000/api/quality/admin/integrity/run"
curl "http://127.0.0.1:4000/api/quality/admin/integrity/runs"
```

## 4. Dashboard Frontend

```jsx
import QualityDashboardPage from "./QualityDashboardPage";
```

Shows:

- expected/imported/missing paper count
- total question count
- open issue count
- year/month/level completeness heatmap
- section coverage for listening, reading, translation and writing
- issue breakdown and recent monitor runs

## 5. Files

- `services/integrityService.js`: reconcile, import gate validation, dashboard data
- `services/qualityScheduler.js`: weekly scheduler
- `services/alertService.js`: log/DingTalk/email-webhook alert delivery
- `middlewares/preImportIntegrityGate.js`: import blocking middleware
- `controllers/qualityDashboardController.js`: dashboard and manual check APIs
- `frontend/task6-quality-monitor/QualityDashboardPage.jsx`: admin dashboard UI

## Acceptance

- Scheduled monitoring can run every week and create `quality_monitor_runs`.
- New missing data creates `quality_issues` and sends alert logs/webhooks.
- Import is blocked before writing when required integrity checks fail.
- Dashboard highlights missing papers, incomplete years and weak section coverage.
