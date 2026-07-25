import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api.js";
import { useReadingExamContext } from "./ReadingExamContext.jsx";
import { sampleReadingExam } from "./sampleReadingExam.js";

const STORAGE_KEY = "reading-exam-draft-v1";

export function useReadingExamLoader() {
  const { state, dispatch } = useReadingExamContext();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      try {
        const listResponse = await api.examList({ examType: "CET4", year: 2023, month: 6, pageSize: 1 });
        const papers = normalizeApiData(listResponse);
        const firstPaper = papers[0];
        const detailResponse = firstPaper
          ? await api.examDetail(firstPaper._id, { sectionType: "reading" })
          : { data: sampleReadingExam };
        const exam = normalizeApiData(detailResponse) || sampleReadingExam;
        const startResponse = firstPaper ? await api.startExam(firstPaper._id) : { data: demoSession(exam) };
        const session = normalizeApiData(startResponse) || demoSession(exam);
        const draft = readDraft(exam._id);

        if (alive) {
          dispatch({
            type: "INIT",
            exam,
            session,
            answers: draft.answers,
            uncertain: draft.uncertain,
            startedAt: draft.startedAt || session.startedAt
          });
        }
      } catch {
        const draft = readDraft(sampleReadingExam._id);
        if (alive) {
          dispatch({
            type: "INIT",
            exam: sampleReadingExam,
            session: demoSession(sampleReadingExam),
            answers: draft.answers,
            uncertain: draft.uncertain,
            startedAt: draft.startedAt
          });
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [dispatch]);

  return { loading, ready: Boolean(state.exam) };
}

export function useReadingExamData() {
  const { state } = useReadingExamContext();
  return useMemo(() => {
    const section = state.exam?.sections?.find((item) => item.type === "reading");
    const passages = section?.readingPassages || [];
    const questions = passages.flatMap((passage) =>
      passage.questions.map((question) => ({
        ...question,
        passageNo: passage.passageNo,
        paragraphNo: passage.paragraphHints?.[question.questionKey] || 1
      }))
    );
    return { section, passages, questions };
  }, [state.exam]);
}

export function useAutosaveDraft() {
  const { state, dispatch } = useReadingExamContext();
  const snapshot = JSON.stringify({
    examId: state.exam?._id,
    answers: state.answers,
    uncertain: state.uncertain,
    startedAt: state.startedAt
  });

  const saveNow = useCallback(() => {
    if (!state.exam?._id) return;
    dispatch({ type: "SAVE_PENDING" });
    try {
      localStorage.setItem(STORAGE_KEY, snapshot);
      dispatch({ type: "SAVE_DONE" });
    } catch {
      dispatch({ type: "SAVE_ERROR" });
    }
  }, [dispatch, snapshot, state.exam?._id]);

  useEffect(() => {
    if (!state.exam?._id) return undefined;
    const timer = window.setTimeout(saveNow, 5000);
    return () => window.clearTimeout(timer);
  }, [saveNow, state.exam?._id, snapshot]);

  return { saveNow };
}

export function useElapsedTime(startedAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const started = startedAt ? new Date(startedAt).getTime() : now;
  return Math.max(0, Math.floor((now - started) / 1000));
}

export function usePassageScroller() {
  const refs = useRef({});
  const registerParagraph = useCallback((passageNo, paragraphNo, node) => {
    if (node) refs.current[`${passageNo}-${paragraphNo}`] = node;
  }, []);
  const scrollToParagraph = useCallback((passageNo, paragraphNo) => {
    refs.current[`${passageNo}-${paragraphNo}`]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  return { registerParagraph, scrollToParagraph };
}

export function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function readDraft(examId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { answers: {}, uncertain: {}, startedAt: new Date().toISOString() };
    const draft = JSON.parse(raw);
    if (draft.examId !== examId) return { answers: {}, uncertain: {}, startedAt: new Date().toISOString() };
    return {
      answers: draft.answers || {},
      uncertain: draft.uncertain || {},
      startedAt: draft.startedAt || new Date().toISOString()
    };
  } catch {
    return { answers: {}, uncertain: {}, startedAt: new Date().toISOString() };
  }
}

function normalizeApiData(response) {
  return response?.data ?? response;
}

function demoSession(exam) {
  return {
    _id: "demo-reading-session",
    examPaperId: exam._id,
    status: "in_progress",
    startedAt: new Date().toISOString()
  };
}
