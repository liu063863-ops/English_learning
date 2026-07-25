const BASE_INTERVALS = [0, 1, 2, 4, 7, 15, 30];

export function buildReviewQueue(store, { wordBookId, newLimit = 20, reviewLimit = 30, mode = "scheduled" }) {
  const nowMs = Date.now();
  const words = store.words.filter((word) => !wordBookId || word.wordBookId === wordBookId);
  if (mode === "all") {
    return words
      .sort((a, b) => (a.nextReviewAt || "").localeCompare(b.nextReviewAt || "") || a.id - b.id)
      .slice(0, newLimit + reviewLimit)
      .map((word) => buildReviewItem(word, store.words));
  }
  const due = words
    .filter((word) => word.nextReviewAt && Date.parse(word.nextReviewAt) <= nowMs)
    .sort((a, b) => Date.parse(a.nextReviewAt) - Date.parse(b.nextReviewAt))
    .slice(0, reviewLimit);
  const wrong = words
    .filter((word) => (word.wrongCount || 0) > 0 && (mode === "wrong" || !word.nextReviewAt || Date.parse(word.nextReviewAt) <= nowMs) && !due.some((item) => item.id === word.id))
    .sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0))
    .slice(0, Math.max(0, reviewLimit - due.length));
  const used = new Set([...due, ...wrong].map((word) => word.id));
  const fresh = words
    .filter((word) => (word.isNew || !word.reviewCount) && !used.has(word.id))
    .sort((a, b) => a.id - b.id)
    .slice(0, newLimit);
  return [...due, ...wrong, ...fresh].map((word) => buildReviewItem(word, store.words));
}

export function buildReviewItem(word, allWords) {
  const options = buildOptions(word, allWords);
  return {
    wordId: word.id,
    prompt: `选择 “${word.chinese}” 对应的英文单词`,
    promptType: "meaning-to-word",
    options,
    answer: word.word,
    scheduleReason: getScheduleReason(word),
    wordCard: publicWordCard(word)
  };
}

export function applyReviewFeedback(word, feedback) {
  const result = feedback === "unknown" ? "unknown" : feedback === "correct" ? "correct" : "wrong";
  const wasCorrect = result === "correct";
  const nowDate = new Date();

  word.reviewCount = (word.reviewCount || 0) + 1;
  word.lastResult = result;
  word.lastReviewedAt = nowDate.toISOString();
  word.reviewedAt = word.lastReviewedAt;
  word.isNew = false;

  if (wasCorrect) {
    word.correctStreak = (word.correctStreak || 0) + 1;
    word.rememberedCount = (word.rememberedCount || 0) + 1;
    word.masteryLevel = Math.min(5, (word.masteryLevel || 0) + 1);
    word.familiarity = Math.min(3, Math.max(word.familiarity || 0, Math.ceil(word.masteryLevel / 2)));
    word.easeFactor = Math.min(3.0, Number(((word.easeFactor || 2.3) + 0.08).toFixed(2)));
    word.intervalDays = nextCorrectInterval(word);
  } else {
    word.correctStreak = 0;
    word.wrongCount = (word.wrongCount || 0) + 1;
    word.lapseCount = (word.lapseCount || 0) + 1;
    word.masteryLevel = Math.max(0, (word.masteryLevel || 0) - 1);
    word.familiarity = Math.max(0, Math.min(word.familiarity || 0, 1));
    word.easeFactor = Math.max(1.3, Number(((word.easeFactor || 2.3) - (result === "unknown" ? 0.25 : 0.18)).toFixed(2)));
    word.intervalDays = 0;
  }

  word.nextReviewAt = addInterval(nowDate, word.intervalDays, wasCorrect ? 0 : 10).toISOString();
  return {
    isCorrect: wasCorrect,
    feedback: result,
    nextReviewAt: word.nextReviewAt,
    intervalDays: word.intervalDays,
    masteryLevel: word.masteryLevel,
    easeFactor: word.easeFactor,
    wordCard: publicWordCard(word)
  };
}

function buildOptions(word, allWords) {
  const options = new Map([[word.word, { label: word.word, hint: word.partOfSpeech, isAnswer: true }]]);
  const candidates = [
    ...byConfusable(word, allWords),
    ...byPartOfSpeech(word, allWords),
    ...byTag(word, allWords),
    ...bySpelling(word, allWords),
    ...allWords.filter((item) => item.id !== word.id)
  ];

  for (const candidate of candidates) {
    if (options.size >= 4) break;
    if (!options.has(candidate.word)) {
      options.set(candidate.word, {
        label: candidate.word,
        hint: candidate.chinese || candidate.partOfSpeech,
        isAnswer: false
      });
    }
  }

  return shuffle([...options.values()]);
}

function byConfusable(word, allWords) {
  const confusables = new Set(word.confusables || []);
  return allWords.filter((item) => confusables.has(item.word) || confusables.has(item.chinese));
}

function byPartOfSpeech(word, allWords) {
  return allWords.filter((item) => item.id !== word.id && item.wordBookId === word.wordBookId && item.partOfSpeech === word.partOfSpeech);
}

function byTag(word, allWords) {
  const tags = new Set(word.tags || []);
  return allWords.filter((item) => item.id !== word.id && item.tags?.some((tag) => tags.has(tag)));
}

function bySpelling(word, allWords) {
  return allWords
    .filter((item) => item.id !== word.id)
    .map((item) => ({ item, score: spellingScore(word.word, item.word) }))
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

function spellingScore(a, b) {
  let score = 0;
  const max = Math.min(a.length, b.length);
  for (let index = 0; index < max; index += 1) {
    if (a[index] === b[index]) score += 1;
  }
  return score - Math.abs(a.length - b.length) * 0.2;
}

function nextCorrectInterval(word) {
  const streak = word.correctStreak || 1;
  if (streak < BASE_INTERVALS.length) return BASE_INTERVALS[streak];
  return Math.max(1, Math.round((word.intervalDays || 1) * (word.easeFactor || 2.3)));
}

function addInterval(date, days, minutes) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  next.setDate(next.getDate() + days);
  return next;
}

function getScheduleReason(word) {
  if (word.isNew || !word.reviewCount) return "new";
  if (word.nextReviewAt && Date.parse(word.nextReviewAt) <= Date.now()) return "due-review";
  if ((word.wrongCount || 0) > 0) return "wrong-retry";
  return "scheduled";
}

function publicWordCard(word) {
  return {
    id: word.id,
    word: word.word,
    phonetic: word.phonetic,
    meaning: word.meaning,
    chinese: word.chinese,
    example: word.example,
    memoryImage: word.memoryImage,
    partOfSpeech: word.partOfSpeech,
    familiarity: word.familiarity,
    masteryLevel: word.masteryLevel,
    reviewCount: word.reviewCount,
    correctStreak: word.correctStreak,
    wrongCount: word.wrongCount,
    nextReviewAt: word.nextReviewAt,
    intervalDays: word.intervalDays
  };
}

function shuffle(items) {
  return items
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}
