import { QualityMonitorRun } from "../models/QualityModels.js";
import { sendQualityAlert } from "./alertService.js";
import { runIntegrityReconcile } from "./integrityService.js";

const DEFAULT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export function startQualityMonitorScheduler(options = {}) {
  const intervalMs = Number(options.intervalMs || process.env.QUALITY_MONITOR_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  const runAtStartup = options.runAtStartup ?? process.env.QUALITY_MONITOR_RUN_AT_STARTUP === "true";
  let running = false;

  async function execute(trigger = "scheduled") {
    if (running) return { skipped: true, reason: "previous_run_still_running" };
    running = true;
    const startedAt = new Date();
    const runId = `quality-${trigger}-${startedAt.toISOString().replace(/[:.]/g, "-")}`;
    try {
      const report = await runIntegrityReconcile({ runId, persistIssues: true, repoPapersPath: options.repoPapersPath });
      const hasMissing = Number(report.summary.missingCount || 0) > 0;
      const hasCritical = Number(report.summary.bySeverity?.critical || 0) > 0;
      const status = hasMissing || hasCritical ? "warning" : "success";
      const channels = String(process.env.QUALITY_ALERT_CHANNELS || "log").split(",").map((item) => item.trim()).filter(Boolean);
      const alertResults = status === "warning"
        ? await sendQualityAlert({ title: "题库完整性发现异常", summary: report.summary, issues: report.issues, channels })
        : [];

      await QualityMonitorRun.create({
        run_id: runId,
        trigger,
        status,
        summary: report.summary,
        alert_channels: channels,
        alert_sent: alertResults.length > 0,
        started_at: startedAt,
        finished_at: new Date()
      });
      return report;
    } catch (error) {
      await QualityMonitorRun.create({
        run_id: runId,
        trigger,
        status: "failed",
        error_message: error.message,
        started_at: startedAt,
        finished_at: new Date()
      });
      await sendQualityAlert({
        title: "题库完整性监控任务失败",
        summary: { missingCount: 0, issueCount: 1, error: error.message },
        issues: [{ issue_type: "monitor_failed", severity: "critical", title: error.message }]
      });
      throw error;
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => execute("scheduled").catch((error) => console.error("[quality-monitor]", error)), intervalMs);
  timer.unref?.();
  if (runAtStartup) execute("scheduled").catch((error) => console.error("[quality-monitor]", error));

  return { stop: () => clearInterval(timer), runNow: () => execute("manual") };
}
