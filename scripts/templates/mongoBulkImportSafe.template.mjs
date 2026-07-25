export async function safeBulkImport(db, payload, options = {}) {
  const report = { inserted: {}, skipped: {}, failed: [] };
  const collections = ["exams", "sections", "audio_files", "passages", "questions"];

  for (const collectionName of collections) {
    const rows = payload[collectionName] || [];
    report.inserted[collectionName] = 0;
    report.skipped[collectionName] = 0;

    for (const row of rows) {
      try {
        const filter = collectionName === "exams" && row.source === "past_exam"
          ? { level: row.level, year: row.year, month: row.month, set_num: row.set_num, source: row.source }
          : { _id: row._id };

        const result = await db.collection(collectionName).updateOne(
          filter,
          options.updateExisting ? { $set: row } : { $setOnInsert: row },
          { upsert: true }
        );

        if (result.upsertedCount) report.inserted[collectionName] += 1;
        else report.skipped[collectionName] += 1;
      } catch (error) {
        report.failed.push({ collection: collectionName, id: row._id, code: error.code, message: error.message });
      }
    }
  }

  return report;
}
