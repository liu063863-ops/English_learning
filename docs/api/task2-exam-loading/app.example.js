import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import examRoutes from "./routes/examRoutes.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ success: true, message: "OK", data: { app: "English Exam API" } });
});

app.use("/api/exams", examRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/english-exam";
const port = process.env.PORT || 4000;

await mongoose.connect(mongoUri);

app.listen(port, () => {
  console.log(`English Exam API listening on http://127.0.0.1:${port}`);
});
