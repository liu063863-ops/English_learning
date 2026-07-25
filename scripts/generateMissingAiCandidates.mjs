import mongoose from "mongoose";
import { AudioFile, Question, Section } from "../docs/database/unified-question-bank.schema.js";
import { AiCompletionCandidate } from "../docs/api/task5-ai-completion/models/AiCompletionModels.js";
import {
  generateExplanationCandidate,
  sliceSegmentsByRange,
  transcribeAudioToSegments
} from "../docs/api/task5-ai-completion/services/openaiCompletionService.js";

const args = parseArgs(process.argv.slice(2));
const mongoUri = args.mongo || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/english_exam";
const mode = args.mode || "explanation"; // transcript | explanation | both
const limit = Number(args.limit || 20);
const dryRun = !args.apply;

await mongoose.connect(mongoUri);

try {
  const report = { dryRun, mode, transcriptCandidates: 0, explanationCandidates: 0, skipped: [], errors: [] };
  if (mode === "transcript" || mode === "both") await generateTranscriptBatch(report);
  if (mode === "explanation" || mode === "both") await generateExplanationBatch(report);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await mongoose.disconnect();
}

async function generateTranscriptBatch(report) {
  const listeningSections = await Section.find({ section_type: "listening" }).lean();
  const audioFiles = await AudioFile.find({ section_id: { $in: listeningSections.map((item) => item._id) } }).limit(limit).lean();
  for (const audio of audioFiles) {
    try {
      const missingQuestions = await Question.find({ section_id: audio.section_id, transcript: { $in: ["", null] } }).lean();
      if (!missingQuestions.length) {
        report.skipped.push({ audio_file_id: audio._id, reason: "no_missing_transcript" });
        continue;
      }
      if (dryRun) {
        report.transcriptCandidates += missingQuestions.length;
        continue;
      }
      const transcription = await transcribeAudioToSegments(audio.file_url);
      for (const question of missingQuestions) {
        const text = sliceSegmentsByRange(transcription.segments, question.audio_start_time, question.audio_end_time) || transcription.text;
        await AiCompletionCandidate.create({
          exam_id: audio.exam_id,
          section_id: audio.section_id,
          question_id: question._id,
          audio_file_id: audio._id,
          candidate_type: "transcript",
          model: transcription.model,
          content: { text, segments: transcription.segments, raw_response: transcription.raw_response },
          source_snapshot: snapshotQuestion(question, text)
        });
        report.transcriptCandidates += 1;
      }
    } catch (error) {
      report.errors.push({ audio_file_id: audio._id, message: error.message });
    }
  }
}

async function generateExplanationBatch(report) {
  const questions = await Question.find({ "explanation.raw": { $in: ["", null] } }).limit(limit).lean();
  for (const question of questions) {
    try {
      if (dryRun) {
        report.explanationCandidates += 1;
        continue;
      }
      const section = await Section.findById(question.section_id).lean();
      const generated = await generateExplanationCandidate({ question, transcript: question.transcript || "" });
      await AiCompletionCandidate.create({
        exam_id: section.exam_id,
        section_id: question.section_id,
        question_id: question._id,
        audio_file_id: question.audio_file_id || null,
        candidate_type: "explanation",
        model: generated.model,
        content: {
          text: generated.text,
          evidence_sentence: generated.evidence_sentence,
          why_correct: generated.why_correct,
          option_analysis: generated.option_analysis,
          raw_response: generated.raw_response
        },
        source_snapshot: snapshotQuestion(question, question.transcript || "")
      });
      report.explanationCandidates += 1;
    } catch (error) {
      report.errors.push({ question_id: question._id, message: error.message });
    }
  }
}

function snapshotQuestion(question, transcript) {
  return {
    question_text: question.question_text,
    options: question.options,
    correct_answer: question.correct_answer,
    transcript,
    audio_start_time: question.audio_start_time,
    audio_end_time: question.audio_end_time
  };
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}
