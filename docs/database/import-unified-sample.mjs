import fs from "node:fs/promises";
import { MongoClient } from "mongodb";

const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const dbName = process.env.DB_NAME || "english_exam";
const filePath = process.argv[2] || new URL("./unified-cet4-2023-06-set1.sample.json", import.meta.url);

const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
const client = new MongoClient(mongoUri);

await client.connect();
const db = client.db(dbName);

for (const collectionName of ["exams", "sections", "audio_files", "passages", "questions", "user_answers"]) {
  const rows = payload[collectionName] || [];
  if (!rows.length) continue;
  await db.collection(collectionName).deleteMany({ _id: { $in: rows.map((row) => row._id) } });
  await db.collection(collectionName).insertMany(rows);
  console.log(`Imported ${rows.length} docs into ${collectionName}`);
}

await client.close();
