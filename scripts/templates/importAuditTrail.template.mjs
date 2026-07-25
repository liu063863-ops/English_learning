import fs from "node:fs/promises";

const auditPath = "backend/data/imported/import-audit-trail.jsonl";

export async function appendImportAudit(event) {
  await fs.mkdir("backend/data/imported", { recursive: true });
  await fs.appendFile(auditPath, JSON.stringify({
    at: new Date().toISOString(),
    ...event
  }) + "\n", "utf8");
}

export async function guardedWriteJson(filePath, data, reason) {
  let previousSize = null;
  try {
    previousSize = (await fs.stat(filePath)).size;
  } catch {
    previousSize = null;
  }

  await appendImportAudit({ action: "write_json", filePath, previousSize, reason });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}
