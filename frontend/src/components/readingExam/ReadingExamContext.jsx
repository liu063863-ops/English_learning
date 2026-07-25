import { createContext, useContext, useMemo, useReducer } from "react";

const ReadingExamContext = createContext(null);

const initialState = {
  exam: null,
  session: null,
  activeQuestionKey: "",
  answers: {},
  uncertain: {},
  startedAt: null,
  lastSavedAt: null,
  saveStatus: "idle"
};

function reducer(state, action) {
  switch (action.type) {
    case "INIT":
      return {
        ...state,
        exam: action.exam,
        session: action.session,
        answers: action.answers || {},
        uncertain: action.uncertain || {},
        startedAt: action.startedAt || new Date().toISOString(),
        activeQuestionKey: action.activeQuestionKey || firstQuestionKey(action.exam)
      };
    case "SET_ACTIVE":
      return { ...state, activeQuestionKey: action.questionKey };
    case "ANSWER":
      return {
        ...state,
        answers: { ...state.answers, [action.questionKey]: action.answer }
      };
    case "TOGGLE_UNCERTAIN":
      return {
        ...state,
        uncertain: { ...state.uncertain, [action.questionKey]: !state.uncertain[action.questionKey] }
      };
    case "SAVE_PENDING":
      return { ...state, saveStatus: "saving" };
    case "SAVE_DONE":
      return { ...state, saveStatus: "saved", lastSavedAt: new Date().toISOString() };
    case "SAVE_ERROR":
      return { ...state, saveStatus: "error" };
    default:
      return state;
  }
}

export function ReadingExamProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <ReadingExamContext.Provider value={value}>{children}</ReadingExamContext.Provider>;
}

export function useReadingExamContext() {
  const value = useContext(ReadingExamContext);
  if (!value) throw new Error("useReadingExamContext must be used inside ReadingExamProvider");
  return value;
}

function firstQuestionKey(exam) {
  return exam?.sections?.find((section) => section.type === "reading")?.readingPassages?.[0]?.questions?.[0]?.questionKey || "";
}
