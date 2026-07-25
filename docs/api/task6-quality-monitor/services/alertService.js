import fs from "node:fs/promises";
import path from "node:path";

export async function sendQualityAlert({ title, summary, issues = [], channels = getDefaultChannels() }) {
  const payload = {
    title,
    summary,
    topIssues: issues.slice(0, 20).map((issue) => ({
      type: issue.issue_type,
      severity: issue.severity,
      title: issue.title,
      field: issue.field_path
    })),
    at: new Date().toISOString()
  };

  const results = [];
  if (channels.includes("log")) results.push(await writeLogAlert(payload));
  if (channels.includes("dingtalk") && process.env.DINGTALK_WEBHOOK_URL) results.push(await postJson(process.env.DINGTALK_WEBHOOK_URL, toDingTalkPayload(payload), "dingtalk"));
  if (channels.includes("email") && process.env.QUALITY_ALERT_EMAIL_WEBHOOK) results.push(await postJson(process.env.QUALITY_ALERT_EMAIL_WEBHOOK, payload, "email-webhook"));
  return results;
}

function getDefaultChannels() {
  return String(process.env.QUALITY_ALERT_CHANNELS || "log").split(",").map((item) => item.trim()).filter(Boolean);
}

async function writeLogAlert(payload) {
  const file = process.env.QUALITY_ALERT_LOG || "backend/data/reports/quality-alerts.jsonl";
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, JSON.stringify(payload) + "\n", "utf8");
  return { channel: "log", ok: true, target: file };
}

async function postJson(url, body, channel) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return { channel, ok: response.ok, status: response.status };
}

function toDingTalkPayload(payload) {
  return {
    msgtype: "markdown",
    markdown: {
      title: payload.title,
      text: [
        `### ${payload.title}`,
        "",
        `- 缺失数：${payload.summary.missingCount ?? 0}`,
        `- 问题数：${payload.summary.issueCount ?? 0}`,
        `- 已导入/应导入：${payload.summary.importedPapers ?? 0}/${payload.summary.expectedPapers ?? 0}`,
        "",
        ...payload.topIssues.map((issue) => `- [${issue.severity}] ${issue.type}: ${issue.title}`)
      ].join("\n")
    }
  };
}
