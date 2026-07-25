import fs from "node:fs/promises";

const checkpointPath = "backend/data/imported/import-checkpoint.json";

export async function runImportWithResume(items, importOne) {
  const checkpoint = await readCheckpoint();
  const report = { done: [], skipped: [], failed: [] };

  for (const item of items) {
    const key = item.paperId || item.key || item.path;
    if (checkpoint.done.includes(key)) {
      report.skipped.push({ key, reason: "checkpoint_done" });
      continue;
    }

    try {
      await importOne(item);
      checkpoint.done.push(key);
      await writeCheckpoint(checkpoint);
      report.done.push({ key });
    } catch (error) {
      checkpoint.failed[key] = { message: error.message, at: new Date().toISOString() };
      await writeCheckpoint(checkpoint);
      report.failed.push({ key, message: error.message });
    }
  }

  return report;
}

async function readCheckpoint() {
  try {
    return JSON.parse(await fs.readFile(checkpointPath, "utf8"));
  } catch {
    return { done: [], failed: {} };
  }
}

async function writeCheckpoint(data) {
  await fs.mkdir("backend/data/imported", { recursive: true });
  await fs.writeFile(checkpointPath, JSON.stringify(data, null, 2), "utf8");
}
