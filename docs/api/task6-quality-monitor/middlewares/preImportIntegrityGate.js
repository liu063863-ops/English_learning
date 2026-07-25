import fs from "node:fs/promises";
import { QualityIssue, QualityMonitorRun } from "../models/QualityModels.js";
import { sendQualityAlert } from "../services/alertService.js";
import { validateImportPayloadIntegrity } from "../services/integrityService.js";

export function preImportIntegrityGate(options = {}) {
  return async function gate(req, res, next) {
    try {
      const payload = await readPayload(req);
      const result = await validateImportPayloadIntegrity(payload, {
        checkAudioReachable: options.checkAudioReachable ?? process.env.QUALITY_GATE_CHECK_AUDIO === "true"
      });
      req.importIntegrity = result;

      if (result.passed) return next();

      const runId = `import-gate-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      await QualityMonitorRun.create({
        run_id: runId,
        trigger: "import_gate",
        status: "warning",
        summary: result.summary,
        alert_channels: ["log"],
        alert_sent: true,
        started_at: new Date(),
        finished_at: new Date()
      });

      await QualityIssue.insertMany(result.issues.map((issue) => ({
        ...issue,
        issue_type: issue.issue_type || "import_gate_failed",
        status: "open",
        detected_by: "script",
        report_run_id: runId
      })));

      await sendQualityAlert({
        title: "导入前置校验失败",
        summary: result.summary,
        issues: result.issues
      });

      return res.status(422).json({
        success: false,
        error: {
          code: "IMPORT_INTEGRITY_FAILED",
          message: "导入数据未通过完整性检查，已拦截",
          details: result
        }
      });
    } catch (error) {
      next(error);
    }
  };
}

async function readPayload(req) {
  if (req.file?.path) return JSON.parse(await fs.readFile(req.file.path, "utf8"));
  return req.body || {};
}
