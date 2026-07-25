import cors from "cors";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allPracticeQuestions, nextId, now, readStore, today, writeStore } from "./db.js";
import { resourceSources } from "./data/resourceSources.js";
import { applyReviewFeedback, buildReviewQueue } from "./wordReview.js";
import { getImportedExam, getQuestionBankStats, listImportedExams } from "./questionBankRepository.js";
import {
  getVocabularyStats,
  importVocabularyCsv,
  importVocabularyWords,
  listVocabulary,
  listWordBooks,
  reviewVocabularyWord
} from "./vocabularyRepository.js";
import {
  getReadingPractice,
  listReadingPractice,
  submitReadingPractice
} from "./readingPracticeRepository.js";
import {
  listTranslations,
  listWritings,
  saveWritingDraft,
  submitTranslationDraft
} from "./writingPracticeRepository.js";

const app = express();
const port = process.env.PORT || 4000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.join(__dirname, "..", "..", "frontend");

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/desktop", (_req, res) => {
  res.sendFile(path.join(frontendDir, "static-preview.html"));
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "Campus English Lab" });
});

app.get("/api/profile", async (_req, res, next) => {
  try {
    const store = await readStore();
    res.json(store.userProfile);
  } catch (error) {
    next(error);
  }
});

app.post("/api/login", async (req, res, next) => {
  try {
    const store = await readStore();
    const nickname = String(req.body.nickname || "Student").trim();
    const targetExam = req.body.targetExam || store.userProfile.targetExam;
    store.userProfile = { ...store.userProfile, nickname, targetExam };
    markStudyDay(store);
    await writeStore(store);
    res.json(store.userProfile);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/settings", async (req, res, next) => {
  try {
    const store = await readStore();
    const dailyWordGoal = Number(req.body.dailyWordGoal);
    const dailyReviewGoal = Number(req.body.dailyReviewGoal);
    store.userProfile = {
      ...store.userProfile,
      targetExam: req.body.targetExam || store.userProfile.targetExam,
      dailyWordGoal: Number.isInteger(dailyWordGoal) && dailyWordGoal > 0 ? dailyWordGoal : store.userProfile.dailyWordGoal,
      dailyReviewGoal: Number.isInteger(dailyReviewGoal) && dailyReviewGoal >= 0 ? dailyReviewGoal : store.userProfile.dailyReviewGoal
    };
    await writeStore(store);
    res.json(store.userProfile);
  } catch (error) {
    next(error);
  }
});

app.get("/api/stats", async (_req, res, next) => {
  try {
    const store = await readStore();
    res.json(buildStats(store));
  } catch (error) {
    next(error);
  }
});

app.get("/api/wordbooks", async (_req, res, next) => {
  try {
    res.json(await listWordBooks());
  } catch (error) {
    next(error);
  }
});

app.get("/api/vocabulary/books", async (_req, res, next) => {
  try {
    res.json(await listWordBooks());
  } catch (error) {
    next(error);
  }
});

app.get("/api/vocabulary", async (req, res, next) => {
  try {
    res.json(await listVocabulary({
      category: req.query.category,
      bookId: req.query.bookId,
      keyword: req.query.keyword,
      limit: req.query.limit
    }));
  } catch (error) {
    next(error);
  }
});

app.get("/api/vocabulary/stats", async (_req, res, next) => {
  try {
    res.json(await getVocabularyStats());
  } catch (error) {
    next(error);
  }
});

app.patch("/api/vocabulary/:id/review", async (req, res, next) => {
  try {
    const familiarity = Number(req.body.familiarity);
    if (!Number.isInteger(familiarity) || familiarity < 0 || familiarity > 3) {
      return res.status(400).json({ error: "familiarity must be an integer from 0 to 3" });
    }
    res.json(await reviewVocabularyWord(req.params.id, familiarity));
  } catch (error) {
    next(error);
  }
});

app.post("/api/vocabulary/import", async (req, res, next) => {
  try {
    res.status(202).json(await importVocabularyWords(req.body));
  } catch (error) {
    next(error);
  }
});

app.post("/api/vocabulary/import-csv", async (req, res, next) => {
  try {
    res.status(202).json(await importVocabularyCsv(req.body));
  } catch (error) {
    next(error);
  }
});

app.get("/api/words/today", async (req, res, next) => {
  try {
    const store = await readStore();
    const wordBookId = req.query.wordBookId || inferBookFromTarget(store.userProfile.targetExam);
    const limit = Number(req.query.limit || store.userProfile.dailyWordGoal || 20);
    const words = store.words
      .filter((word) => word.wordBookId === wordBookId)
      .sort((a, b) => a.familiarity - b.familiarity || a.reviewCount - b.reviewCount || a.id - b.id)
      .slice(0, limit);
    res.json({ wordBookId, dailyWordGoal: limit, words });
  } catch (error) {
    next(error);
  }
});

app.get("/api/word-review/session", async (req, res, next) => {
  try {
    const store = await readStore();
    const wordBookId = req.query.wordBookId || inferBookFromTarget(store.userProfile.targetExam);
    const newLimit = Number(req.query.newLimit || store.userProfile.dailyWordGoal || 20);
    const reviewLimit = Number(req.query.reviewLimit || store.userProfile.dailyReviewGoal || 30);
    const mode = req.query.mode || "scheduled";
    const items = buildReviewQueue(store, { wordBookId, newLimit, reviewLimit, mode });
    res.json({
      wordBookId,
      newLimit,
      reviewLimit,
      mode,
      dueCount: items.filter((item) => item.scheduleReason === "due-review").length,
      wrongRetryCount: items.filter((item) => item.scheduleReason === "wrong-retry").length,
      newCount: items.filter((item) => item.scheduleReason === "new").length,
      items
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/word-review/:id/answer", async (req, res, next) => {
  try {
    const store = await readStore();
    const word = store.words.find((item) => item.id === Number(req.params.id));
    if (!word) return res.status(404).json({ error: "Word not found" });

    const selectedAnswer = req.body.selectedAnswer || "";
    const feedback = req.body.feedback || (selectedAnswer === word.word ? "correct" : "wrong");
    const result = applyReviewFeedback(word, feedback);
    markStudyDay(store);
    await writeStore(store);
    res.json({
      ...result,
      answer: word.word,
      explanation: `${word.word} means ${word.chinese}. ${word.example}`,
      selectedAnswer
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/words/:id/review", async (req, res, next) => {
  try {
    const familiarity = Number(req.body.familiarity);
    if (!Number.isInteger(familiarity) || familiarity < 0 || familiarity > 3) {
      return res.status(400).json({ error: "familiarity must be an integer from 0 to 3" });
    }
    const store = await readStore();
    const word = store.words.find((item) => item.id === Number(req.params.id));
    if (!word) return res.status(404).json({ error: "Word not found" });
    applyReviewFeedback(word, familiarity >= 2 ? "correct" : "unknown");
    markStudyDay(store);
    await writeStore(store);
    res.json(word);
  } catch (error) {
    next(error);
  }
});

app.get("/api/questions", async (req, res, next) => {
  try {
    const store = await readStore();
    res.json(filterQuestions(store.questions, req.query));
  } catch (error) {
    next(error);
  }
});

app.get("/api/mock-questions", async (req, res, next) => {
  try {
    const store = await readStore();
    res.json(filterQuestions(store.mockQuestions, req.query));
  } catch (error) {
    next(error);
  }
});

app.get("/api/exam-papers", async (req, res, next) => {
  try {
    const store = await readStore();
    const rows = store.examPapers
      .filter((paper) => matchesPaperQuery(paper, req.query))
      .map((paper) => ({
        id: paper.id,
        examType: paper.examType,
        year: paper.year,
        month: paper.month,
        title: paper.title,
        difficulty: paper.difficulty,
        durationMinutes: paper.durationMinutes,
        source: paper.source,
        sectionSummary: paper.sections.map((section) => ({
          id: section.id,
          type: section.type,
          title: section.title,
          score: section.score,
          questionCount: countSectionQuestions(section)
        }))
      }))
      .sort((a, b) => b.year - a.year || b.month - a.month || a.examType.localeCompare(b.examType));
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/exam-papers/:id", async (req, res, next) => {
  try {
    const store = await readStore();
    const paper = store.examPapers.find((item) => item.id === req.params.id);
    if (!paper) return res.status(404).json({ error: "Exam paper not found" });
    res.json(stripPaperAnswers(paper));
  } catch (error) {
    next(error);
  }
});

app.post("/api/exam-sessions/full", async (req, res, next) => {
  try {
    const store = await readStore();
    const paper = store.examPapers.find((item) => item.id === req.body.paperId);
    if (!paper) return res.status(404).json({ error: "Exam paper not found" });
    const startedAt = now();
    const session = {
      id: nextId(store.fullExamSessions),
      paperId: paper.id,
      examType: paper.examType,
      year: paper.year,
      month: paper.month,
      durationMinutes: paper.durationMinutes,
      startedAt,
      dueAt: new Date(Date.parse(startedAt) + paper.durationMinutes * 60 * 1000).toISOString(),
      submittedAt: null,
      status: "in_progress",
      answers: {},
      drafts: {},
      report: null
    };
    store.fullExamSessions.push(session);
    await writeStore(store);
    res.json({ session, paper: stripPaperAnswers(paper) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/exam-sessions/:id/draft", async (req, res, next) => {
  try {
    const store = await readStore();
    const session = store.fullExamSessions.find((item) => item.id === Number(req.params.id));
    if (!session) return res.status(404).json({ error: "Exam session not found" });
    if (session.submittedAt) return res.status(400).json({ error: "Submitted exam cannot be edited" });
    session.answers = { ...session.answers, ...(req.body.answers || {}) };
    session.drafts = { ...session.drafts, ...(req.body.drafts || {}) };
    session.updatedAt = now();
    await writeStore(store);
    res.json(session);
  } catch (error) {
    next(error);
  }
});

app.post("/api/exam-sessions/:id/submit", async (req, res, next) => {
  try {
    const store = await readStore();
    const session = store.fullExamSessions.find((item) => item.id === Number(req.params.id));
    if (!session) return res.status(404).json({ error: "Exam session not found" });
    const paper = store.examPapers.find((item) => item.id === session.paperId);
    if (!paper) return res.status(404).json({ error: "Exam paper not found" });

    const answers = { ...session.answers, ...(req.body.answers || {}) };
    const drafts = { ...session.drafts, ...(req.body.drafts || {}) };
    const report = gradeFullExam(store, paper, session, answers, drafts);
    session.answers = answers;
    session.drafts = drafts;
    session.report = report;
    session.status = "submitted";
    session.submittedAt = now();
    markStudyDay(store);
    await writeStore(store);
    res.json({ session, report });
  } catch (error) {
    next(error);
  }
});

app.post("/api/import/exam-papers", async (req, res, next) => {
  try {
    const store = await readStore();
    const imports = Array.isArray(req.body.papers) ? req.body.papers : [];
    const imported = [];
    imports.forEach((paper) => {
      if (!paper.id || !paper.examType || !paper.year || !paper.month || !Array.isArray(paper.sections)) return;
      const existingIndex = store.examPapers.findIndex((item) => item.id === paper.id);
      const normalized = { ...paper, source: paper.source || { type: "adapter-import", licenseNote: "Imported by adapter." } };
      if (existingIndex >= 0) store.examPapers[existingIndex] = normalized;
      else store.examPapers.push(normalized);
      imported.push(paper.id);
    });
    store.resourceImports.push({
      id: nextId(store.resourceImports),
      type: "exam-papers",
      adapter: req.body.adapter || "manual-json",
      imported,
      createdAt: now()
    });
    await writeStore(store);
    res.status(202).json({
      ok: true,
      imported,
      message: "Exam paper import adapter accepted structured JSON. Add source-specific parsers under scripts/importers later."
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/questions/:id/attempt", async (req, res, next) => {
  try {
    const result = await gradeSingleQuestion(Number(req.params.id), req.body.selectedAnswer, "practice");
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/exams", async (req, res, next) => {
  try {
    const store = await readStore();
    const session = {
      id: nextId(store.examSessions),
      examType: req.body.examType || store.userProfile.targetExam,
      durationMinutes: Number(req.body.durationMinutes || 30),
      questionIds: req.body.questionIds || filterQuestions(store.questions, req.body).slice(0, 6).map((item) => item.id),
      startedAt: now(),
      submittedAt: null,
      score: null,
      answers: []
    };
    store.examSessions.push(session);
    await writeStore(store);
    res.json({ ...session, questions: session.questionIds.map((id) => store.questions.find((item) => item.id === id)).filter(Boolean) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/exams/:id/submit", async (req, res, next) => {
  try {
    const store = await readStore();
    const session = store.examSessions.find((item) => item.id === Number(req.params.id));
    if (!session) return res.status(404).json({ error: "Exam session not found" });

    const answers = req.body.answers || {};
    const details = session.questionIds.map((questionId) => {
      const question = store.questions.find((item) => item.id === questionId);
      const selectedAnswer = answers[questionId] || "";
      const isCorrect = question?.answer === selectedAnswer;
      if (question && !isCorrect) upsertWrongQuestion(store, question, selectedAnswer, session.id);
      return { questionId, selectedAnswer, isCorrect, answer: question?.answer, explanation: question?.explanation };
    });
    session.answers = details;
    session.submittedAt = now();
    session.score = details.length ? Math.round((details.filter((item) => item.isCorrect).length / details.length) * 100) : 0;
    store.attempts.push(...details.map((item) => ({ id: nextId(store.attempts), ...item, source: "exam", createdAt: now() })));
    markStudyDay(store);
    await writeStore(store);
    res.json({ session, details });
  } catch (error) {
    next(error);
  }
});

app.get("/api/wrong-questions", async (req, res, next) => {
  try {
    const store = await readStore();
    const rows = store.wrongQuestions
      .map((wrong) => {
        const question = wrong.question || allPracticeQuestions(store).find((item) => item.id === wrong.questionId);
        return question ? { ...wrong, question } : null;
      })
      .filter(Boolean)
      .filter((item) => matchesQuery(item.question, req.query))
      .sort((a, b) => Number(a.mastered) - Number(b.mastered) || b.updatedAt.localeCompare(a.updatedAt));
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/wrong-questions/:id", async (req, res, next) => {
  try {
    const store = await readStore();
    const item = store.wrongQuestions.find((wrong) => wrong.id === Number(req.params.id));
    if (!item) return res.status(404).json({ error: "Wrong question not found" });
    item.mastered = Boolean(req.body.mastered);
    item.reason = req.body.reason ?? item.reason;
    item.updatedAt = now();
    await writeStore(store);
    res.json(item);
  } catch (error) {
    next(error);
  }
});

app.get("/api/annotations/:questionId", async (req, res, next) => {
  try {
    const store = await readStore();
    res.json(store.annotations.find((item) => item.questionId === Number(req.params.questionId)) || null);
  } catch (error) {
    next(error);
  }
});

app.post("/api/annotations/:questionId", async (req, res, next) => {
  try {
    const store = await readStore();
    const questionId = Number(req.params.questionId);
    let annotation = store.annotations.find((item) => item.questionId === questionId);
    if (!annotation) {
      annotation = { id: nextId(store.annotations), questionId, note: "", highlighted: false, updatedAt: now() };
      store.annotations.push(annotation);
    }
    annotation.note = String(req.body.note || "");
    annotation.highlighted = Boolean(req.body.highlighted);
    annotation.updatedAt = now();
    await writeStore(store);
    res.json(annotation);
  } catch (error) {
    next(error);
  }
});

app.get("/api/listening", async (req, res, next) => {
  try {
    const store = await readStore();
    res.json(store.listeningMaterials.filter((item) => !req.query.examType || item.examType === req.query.examType));
  } catch (error) {
    next(error);
  }
});

app.get("/api/listening/search", async (req, res) => {
  res.json({
    keyword: req.query.keyword || "",
    provider: "placeholder",
    items: [],
    message: "Online listening search is reserved. Replace this endpoint with a real provider later."
  });
});

app.get("/api/resource-sources", (req, res) => {
  const examType = req.query.examType;
  const category = req.query.category;
  res.json(
    resourceSources.filter(
      (source) =>
        (!examType || source.examTypes.includes(examType)) &&
        (!category || source.category === category)
    )
  );
});

app.get("/api/resource-index", async (req, res, next) => {
  try {
    const catalogPath = path.join(__dirname, "..", "data", "ten_year_resource_catalog.json");
    const raw = await fs.readFile(catalogPath, "utf8");
    const rows = JSON.parse(raw).filter((item) => {
      return (
        (!req.query.examType || item.examType === req.query.examType) &&
        (!req.query.year || String(item.year) === String(req.query.year)) &&
        (!req.query.month || String(item.month) === String(req.query.month))
      );
    });
    res.json(rows);
  } catch (error) {
    if (error.code === "ENOENT") return res.json([]);
    next(error);
  }
});

app.get("/api/question-bank/stats", async (_req, res, next) => {
  try {
    res.json(await getQuestionBankStats());
  } catch (error) {
    next(error);
  }
});

app.get("/api/reading-practice", async (req, res, next) => {
  try {
    res.json(await listReadingPractice({
      level: req.query.level,
      year: req.query.year,
      theme: req.query.theme,
      keyword: req.query.keyword,
      limit: req.query.limit
    }));
  } catch (error) {
    next(error);
  }
});

app.get("/api/reading-practice/:id", async (req, res, next) => {
  try {
    const passage = await getReadingPractice(req.params.id);
    if (!passage) return res.status(404).json({ error: "Reading passage not found" });
    res.json(passage);
  } catch (error) {
    next(error);
  }
});

app.post("/api/reading-practice/:id/submit", async (req, res, next) => {
  try {
    res.json(await submitReadingPractice(req.params.id, req.body.answers || {}));
  } catch (error) {
    next(error);
  }
});

app.get("/api/readings", async (req, res, next) => {
  try {
    res.json(await listReadingPractice(req.query));
  } catch (error) {
    next(error);
  }
});

app.get("/api/translations", async (req, res, next) => {
  try {
    res.json(await listTranslations({
      level: req.query.level,
      year: req.query.year,
      limit: req.query.limit
    }));
  } catch (error) {
    next(error);
  }
});

app.post("/api/translations/:id/attempt", async (req, res, next) => {
  try {
    const result = await submitTranslationDraft(req.body.draft || "");
    res.json({
      ...result,
      reference: req.body.reference || "请对照题目参考译文进行复盘。",
      explanation: "翻译练习已提交。系统保留半自动评分接口，后续可接入人工评分或 AI 评分。"
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/writings", async (req, res, next) => {
  try {
    res.json(await listWritings({
      level: req.query.level,
      year: req.query.year,
      limit: req.query.limit
    }));
  } catch (error) {
    next(error);
  }
});

app.post("/api/writings/:id/drafts", async (req, res, next) => {
  try {
    res.json(await saveWritingDraft(req.body.draft || ""));
  } catch (error) {
    next(error);
  }
});

app.get("/api/exams", async (req, res, next) => {
  try {
    const result = await listImportedExams(req.query);
    const rows = result.data.map((exam) => ({
      id: exam._id,
      _id: exam._id,
      title: exam.title,
      level: exam.level,
      examType: exam.level,
      year: exam.year,
      month: exam.month,
      set_num: exam.set_num,
      setNum: exam.set_num,
      source: exam.source,
      status: exam.status,
      questionCount: exam.questionCount || 0,
      totalQuestions: exam.questionCount || 0,
      estimatedMinutes: exam.estimatedMinutes || 0,
      estimatedTime: exam.estimatedMinutes || 0,
      difficultyLabel: exam.difficultyLabel || "medium",
      completedUsers: exam.completedUsers || 0
    }));
    res.json({ data: rows, pagination: result.pagination });
  } catch (error) {
    next(error);
  }
});

app.get("/api/exams/:id", async (req, res, next) => {
  try {
    const exam = await getImportedExam(req.params.id);
    if (!exam) return res.status(404).json({ error: "Exam not found" });
    res.json(exam);
  } catch (error) {
    next(error);
  }
});

app.post("/api/import/wordbooks/:id", async (req, res) => {
  res.status(202).json({
    ok: true,
    wordBookId: req.params.id,
    message: "Import endpoint reserved. Connect network source or file parser here later."
  });
});

function filterQuestions(questions, query) {
  return questions.filter((question) => matchesQuery(question, query));
}

function matchesQuery(question, query) {
  return (
    (!query.examType || question.examType === query.examType) &&
    (!query.year || String(question.year) === String(query.year)) &&
    (!query.type || question.type === query.type) &&
    (!query.difficulty || question.difficulty === query.difficulty) &&
    (!query.knowledgePoint || question.knowledgePoints?.includes(query.knowledgePoint))
  );
}

function matchesPaperQuery(paper, query) {
  return (
    (!query.examType || paper.examType === query.examType) &&
    (!query.year || String(paper.year) === String(query.year)) &&
    (!query.month || String(paper.month) === String(query.month)) &&
    (!query.difficulty || paper.difficulty === query.difficulty)
  );
}

function stripPaperAnswers(paper) {
  return {
    ...paper,
    sections: paper.sections.map((section) => ({
      ...section,
      questions: section.questions?.map(stripQuestionAnswer),
      passages: section.passages?.map((passage) => ({
        ...passage,
        questions: passage.questions.map(stripQuestionAnswer)
      })),
      referenceAnswer: undefined,
      manualRubric: section.manualRubric
    }))
  };
}

function stripQuestionAnswer(question) {
  const { answer, explanation, ...visible } = question;
  return visible;
}

function countSectionQuestions(section) {
  if (section.questions) return section.questions.length;
  if (section.passages) return section.passages.reduce((sum, passage) => sum + passage.questions.length, 0);
  return section.prompt ? 1 : 0;
}

function gradeFullExam(store, paper, session, answers, drafts) {
  const sections = paper.sections.map((section) => gradeFullSection(store, paper, session, section, answers, drafts));
  const objectiveScore = sections.reduce((sum, section) => sum + section.objectiveScore, 0);
  const pendingScore = sections.reduce((sum, section) => sum + section.pendingScore, 0);
  return {
    paperId: paper.id,
    title: paper.title,
    submittedAt: now(),
    objectiveScore,
    pendingScore,
    totalPossibleScore: sections.reduce((sum, section) => sum + section.score, 0),
    status: pendingScore ? "pending_manual_subjective_score" : "scored",
    sections
  };
}

function gradeFullSection(store, paper, session, section, answers, drafts) {
  const objectiveQuestions = listObjectiveQuestions(section);
  const perQuestionScore = objectiveQuestions.length ? section.score / objectiveQuestions.length : 0;
  const details = objectiveQuestions.map(({ question, passageId }) => {
    const answerKey = `${section.id}:${passageId ? `${passageId}:` : ""}${question.id}`;
    const selectedAnswer = answers[answerKey] || "";
    const isCorrect = selectedAnswer === question.answer;
    const score = isCorrect ? Number(perQuestionScore.toFixed(1)) : 0;
    if (!isCorrect) upsertFullExamWrongQuestion(store, paper, section, question, selectedAnswer, session.id, answerKey);
    store.attempts.push({
      id: nextId(store.attempts),
      questionId: answerKey,
      selectedAnswer,
      isCorrect,
      source: "full-exam",
      createdAt: now()
    });
    return {
      questionId: answerKey,
      prompt: question.prompt,
      selectedAnswer,
      answer: question.answer,
      isCorrect,
      score,
      explanation: question.explanation,
      knowledgePoints: question.knowledgePoints || []
    };
  });
  const objectiveScore = Number(details.reduce((sum, item) => sum + item.score, 0).toFixed(1));
  const isSubjective = ["translation", "writing"].includes(section.type);
  return {
    id: section.id,
    type: section.type,
    title: section.title,
    score: section.score,
    objectiveScore,
    pendingScore: isSubjective ? section.score : 0,
    subjectiveAnswer: isSubjective ? drafts[section.id] || answers[section.id] || "" : undefined,
    subjectiveStatus: isSubjective ? "pending_manual_score" : undefined,
    referenceAnswer: isSubjective ? section.referenceAnswer : undefined,
    manualRubric: isSubjective ? section.manualRubric || [] : undefined,
    details
  };
}

function listObjectiveQuestions(section) {
  if (section.questions) return section.questions.map((question) => ({ question }));
  if (section.passages) {
    return section.passages.flatMap((passage) => passage.questions.map((question) => ({ question, passageId: passage.id })));
  }
  return [];
}

async function gradeSingleQuestion(questionId, selectedAnswer, source) {
  const store = await readStore();
  const question = allPracticeQuestions(store).find((item) => item.id === questionId);
  if (!question) return { error: "Question not found" };
  const isCorrect = selectedAnswer === question.answer;
  store.attempts.push({ id: nextId(store.attempts), questionId, selectedAnswer, isCorrect, source, createdAt: now() });
  if (!isCorrect) upsertWrongQuestion(store, question, selectedAnswer, null);
  markStudyDay(store);
  await writeStore(store);
  return {
    isCorrect,
    answer: question.answer,
    explanation: question.explanation,
    expansion: question.expansion,
    knowledgePoints: question.knowledgePoints
  };
}

function upsertWrongQuestion(store, question, selectedAnswer, sessionId) {
  const existing = store.wrongQuestions.find((item) => item.questionId === question.id);
  if (existing) {
    existing.selectedAnswer = selectedAnswer;
    existing.mastered = false;
    existing.sessionId = sessionId || existing.sessionId;
    existing.updatedAt = now();
    return;
  }
  store.wrongQuestions.push({
    id: nextId(store.wrongQuestions),
    questionId: question.id,
    selectedAnswer,
    examType: question.examType,
    year: question.year,
    type: question.type,
    knowledgePoints: question.knowledgePoints,
    mastered: false,
    reason: "",
    sessionId,
    createdAt: now(),
    updatedAt: now()
  });
}

function upsertFullExamWrongQuestion(store, paper, section, question, selectedAnswer, sessionId, questionKey) {
  const existing = store.wrongQuestions.find((item) => item.questionKey === questionKey && item.paperId === paper.id);
  const embeddedQuestion = {
    id: questionKey,
    examType: paper.examType,
    year: paper.year,
    month: paper.month,
    paper: paper.title,
    type: section.type,
    difficulty: question.difficulty,
    knowledgePoints: question.knowledgePoints || [],
    prompt: question.prompt,
    options: question.options || [],
    answer: question.answer,
    explanation: question.explanation,
    expansion: `From ${paper.title} / ${section.title}.`
  };
  if (existing) {
    existing.selectedAnswer = selectedAnswer;
    existing.mastered = false;
    existing.sessionId = sessionId;
    existing.question = embeddedQuestion;
    existing.updatedAt = now();
    return;
  }
  store.wrongQuestions.push({
    id: nextId(store.wrongQuestions),
    questionId: null,
    questionKey,
    paperId: paper.id,
    selectedAnswer,
    examType: paper.examType,
    year: paper.year,
    month: paper.month,
    type: section.type,
    knowledgePoints: question.knowledgePoints || [],
    mastered: false,
    reason: "",
    sessionId,
    question: embeddedQuestion,
    createdAt: now(),
    updatedAt: now()
  });
}

function buildStats(store) {
  const attempts = store.attempts || [];
  const correct = attempts.filter((item) => item.isCorrect).length;
  const weakMap = new Map();
  store.wrongQuestions.forEach((wrong) => {
    wrong.knowledgePoints?.forEach((point) => weakMap.set(point, (weakMap.get(point) || 0) + 1));
  });
  const weakPoints = [...weakMap.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  return {
    profile: store.userProfile,
    studyDays: store.userProfile.studyDays || 0,
    wordsReviewed: store.words.reduce((sum, word) => sum + (word.reviewCount || 0), 0),
    wordsMastered: store.words.filter((word) => word.familiarity >= 2).length,
    totalWords: store.words.length,
    dailyWordGoal: store.userProfile.dailyWordGoal,
    dailyReviewGoal: store.userProfile.dailyReviewGoal || 30,
    attempts: attempts.length,
    accuracy: attempts.length ? Math.round((correct / attempts.length) * 100) : 0,
    activeWrongQuestions: store.wrongQuestions.filter((item) => !item.mastered).length,
    weakPoints,
    examSessions: store.examSessions.length
  };
}

function markStudyDay(store) {
  const current = today();
  if (store.userProfile.lastStudyDate !== current) {
    store.userProfile.studyDays = (store.userProfile.studyDays || 0) + 1;
    store.userProfile.lastStudyDate = current;
  }
}

function inferBookFromTarget(targetExam) {
  if (targetExam === "CET-4") return "cet4";
  if (targetExam === "CET-6") return "cet6";
  return "kaoyan";
}

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

readStore().then(() => {
  app.listen(port, () => {
    console.log(`Campus English Lab API is running at http://localhost:${port}`);
  });
});
