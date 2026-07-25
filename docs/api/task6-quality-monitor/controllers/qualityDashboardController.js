import { QualityMonitorRun } from "../models/QualityModels.js";
import { buildQualityDashboardData, runIntegrityReconcile } from "../services/integrityService.js";
import { sendQualityAlert } from "../services/alertService.js";

export async function getQualityDashboard(req, res, next) {
  try {
    const data = await buildQualityDashboardData();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function runManualIntegrityCheck(req, res, next) {
  const startedAt = new Date();
  const runId = `quality-manual-${startedAt.toISOString().replace(/[:.]/g, "-")}`;
  try {
    const report = await runIntegrityReconcile({ runId, persistIssues: true });
    const status = report.summary.missingCount || report.summary.bySeverity?.critical ? "warning" : "success";
    const alertResults = status === "warning"
      ? await sendQualityAlert({ title: "手动题库完整性检查发现异常", summary: report.summary, issues: report.issues })
      : [];
    await QualityMonitorRun.create({
      run_id: runId,
      trigger: "manual",
      status,
      summary: report.summary,
      alert_channels: alertResults.map((item) => item.channel),
      alert_sent: alertResults.length > 0,
      started_at: startedAt,
      finished_at: new Date()
    });
    res.json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
}

export async function listMonitorRuns(req, res, next) {
  try {
    const rows = await QualityMonitorRun.find({})
      .sort({ started_at: -1 })
      .limit(Math.min(Number(req.query.limit || 20), 100))
      .lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
}
