import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { examPapers, listeningMaterials, mockQuestions, questions, userProfile, wordBooks, words } from "./data/seedData.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "kaoyan_english.json");

const initialData = {
  userProfile,
  wordBooks,
  words: words.map((item, index) => ({
    id: index + 1,
    ...item,
    familiarity: 0,
    masteryLevel: 0,
    reviewCount: 0,
    rememberedCount: 0,
    correctStreak: 0,
    wrongCount: 0,
    lapseCount: 0,
    lastResult: null,
    lastReviewedAt: null,
    reviewedAt: null,
    nextReviewAt: null,
    intervalDays: 0,
    easeFactor: 2.3,
    isNew: true
  })),
  questions: questions.map(withId),
  mockQuestions: mockQuestions.map(withId),
  listeningMaterials: listeningMaterials.map(withId),
  examPapers,
  attempts: [],
  examSessions: [],
  fullExamSessions: [],
  wrongQuestions: [],
  annotations: [],
  resourceImports: []
};

function withId(item, index) {
  return { id: index + 1, ...item };
}

function normalizeStore(store) {
  const hasNewWords = Array.isArray(store.words) && store.words.some((word) => word.wordBookId);
  const hasNewQuestions = Array.isArray(store.questions) && store.questions.some((question) => question.examType && question.knowledgePoints);
  return {
    ...structuredClone(initialData),
    ...store,
    userProfile: { ...initialData.userProfile, ...(store.userProfile || {}) },
    wordBooks: store.wordBooks || initialData.wordBooks,
    words: mergeWords(hasNewWords ? store.words : [], initialData.words),
    questions: hasNewQuestions ? store.questions : initialData.questions,
    mockQuestions: store.mockQuestions?.length ? store.mockQuestions : initialData.mockQuestions,
    listeningMaterials: store.listeningMaterials || initialData.listeningMaterials,
    examPapers: store.examPapers?.length ? mergeExamPapers(store.examPapers, initialData.examPapers) : initialData.examPapers,
    attempts: store.attempts || [],
    examSessions: store.examSessions || [],
    fullExamSessions: store.fullExamSessions || [],
    wrongQuestions: store.wrongQuestions || store.errors || [],
    annotations: store.annotations || [],
    resourceImports: store.resourceImports || []
  };
}

function mergeExamPapers(existingPapers, seedPapers) {
  const byId = new Map();
  [...seedPapers, ...existingPapers].forEach((paper) => byId.set(paper.id, paper));
  return [...byId.values()];
}

function normalizeWord(word) {
  const seed = initialData.words.find((item) => item.word === word.word) || {};
  return {
    ...seed,
    ...word,
    partOfSpeech: word.partOfSpeech || seed.partOfSpeech || "unknown",
    synonyms: word.synonyms || seed.synonyms || [],
    confusables: word.confusables || seed.confusables || [],
    familiarity: word.familiarity ?? 0,
    masteryLevel: word.masteryLevel ?? word.familiarity ?? 0,
    reviewCount: word.reviewCount ?? 0,
    rememberedCount: word.rememberedCount ?? 0,
    correctStreak: word.correctStreak ?? 0,
    wrongCount: word.wrongCount ?? 0,
    lapseCount: word.lapseCount ?? 0,
    lastResult: word.lastResult ?? null,
    lastReviewedAt: word.lastReviewedAt ?? word.reviewedAt ?? null,
    reviewedAt: word.reviewedAt ?? word.lastReviewedAt ?? null,
    nextReviewAt: word.nextReviewAt ?? null,
    intervalDays: word.intervalDays ?? 0,
    easeFactor: word.easeFactor ?? 2.3,
    isNew: word.isNew ?? (word.reviewCount ?? 0) === 0
  };
}

function mergeWords(existingWords, seedWords) {
  const byKey = new Map();
  [...seedWords, ...existingWords].forEach((word) => {
    const key = `${word.wordBookId}:${word.word}`;
    const previous = byKey.get(key) || {};
    byKey.set(key, normalizeWord({ ...previous, ...word }));
  });
  return [...byKey.values()].map((word, index) => ({ ...word, id: index + 1 }));
}

export async function readStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    const raw = await fs.readFile(dbPath, "utf8");
    if (!raw.trim()) {
      await writeStore(initialData);
      return structuredClone(initialData);
    }
    const store = normalizeStore(JSON.parse(raw));
    await writeStore(store);
    return store;
  } catch (error) {
    if (error instanceof SyntaxError) {
      const backupPath = path.join(dataDir, `kaoyan_english.corrupt-${Date.now()}.json`);
      await fs.rename(dbPath, backupPath);
      await writeStore(initialData);
      return structuredClone(initialData);
    }
    if (error.code !== "ENOENT") throw error;
    await writeStore(initialData);
    return structuredClone(initialData);
  }
}

export async function writeStore(data) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2), "utf8");
}

export function now() {
  return new Date().toISOString();
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function nextId(items) {
  return items.length ? Math.max(...items.map((item) => item.id || 0)) + 1 : 1;
}

export function allPracticeQuestions(store) {
  return [...store.questions, ...store.mockQuestions.map((item) => ({ ...item, isMock: true }))];
}
