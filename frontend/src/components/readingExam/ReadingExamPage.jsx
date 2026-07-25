import { AlertTriangle, Bookmark, CheckCircle2, Circle, Clock, Save } from "lucide-react";
import SkeletonCard from "../SkeletonCard.jsx";
import { ReadingExamProvider, useReadingExamContext } from "./ReadingExamContext.jsx";
import {
  formatDuration,
  useAutosaveDraft,
  useElapsedTime,
  usePassageScroller,
  useReadingExamData,
  useReadingExamLoader
} from "./hooks.js";

export default function ReadingExamPage() {
  return (
    <ReadingExamProvider>
      <ReadingExamShell />
    </ReadingExamProvider>
  );
}

function ReadingExamShell() {
  const { state, dispatch } = useReadingExamContext();
  const { loading } = useReadingExamLoader();
  const { passages, questions } = useReadingExamData();
  const { saveNow } = useAutosaveDraft();
  const elapsedSeconds = useElapsedTime(state.startedAt);
  const scroller = usePassageScroller();

  if (loading || !state.exam) {
    return <section className="page-section"><SkeletonCard /></section>;
  }

  const unanswered = questions.filter((question) => !hasAnswer(state.answers[question.questionKey]));

  function selectQuestion(question) {
    saveNow();
    dispatch({ type: "SET_ACTIVE", questionKey: question.questionKey });
    scroller.scrollToParagraph(question.passageNo, question.paragraphNo);
  }

  function confirmSubmit() {
    saveNow();
    const message = unanswered.length
      ? `还有 ${unanswered.length} 题未答，已用时 ${formatDuration(elapsedSeconds)}。确认交卷吗？`
      : `所有题目已作答，已用时 ${formatDuration(elapsedSeconds)}。确认交卷吗？`;
    window.alert(message);
  }

  return (
    <section className="page-section reading-exam-page">
      <header className="page-header reading-exam-header">
        <div>
          <h1>{state.exam.title}</h1>
          <p>阅读模块优先版：左侧文章定位，右侧答题，状态自动保存。</p>
        </div>
        <div className="exam-toolbar">
          <span className="exam-chip"><Clock size={16} />{formatDuration(elapsedSeconds)}</span>
          <span className="exam-chip"><Save size={16} />{saveText(state.saveStatus, state.lastSavedAt)}</span>
          <button className="primary-button" onClick={confirmSubmit}>交卷</button>
        </div>
      </header>

      <div className="reading-exam-layout">
        <ArticlePane passages={passages} activeQuestionKey={state.activeQuestionKey} scroller={scroller} />
        <QuestionPane questions={questions} onSelectQuestion={selectQuestion} />
        <QuestionNavigator questions={questions} onSelectQuestion={selectQuestion} />
      </div>
    </section>
  );
}

function ArticlePane({ passages, activeQuestionKey, scroller }) {
  return (
    <article className="article-pane">
      {passages.map((passage) => {
        const paragraphs = passage.content.split(/\n+/).filter(Boolean);
        const hintedParagraphs = new Set(passage.answerSentenceHints?.[activeQuestionKey] || []);

        return (
          <section key={passage.passageNo}>
            <h2>{passage.title}</h2>
            {paragraphs.map((paragraph, index) => {
              const paragraphNo = index + 1;
              return (
                <p
                  key={paragraphNo}
                  ref={(node) => scroller.registerParagraph(passage.passageNo, paragraphNo, node)}
                  data-paragraph={`${passage.passageNo}-${paragraphNo}`}
                  className={hintedParagraphs.has(paragraphNo) ? "answer-sentence-hidden" : ""}
                >
                  <span className="paragraph-mark">P{paragraphNo}</span>
                  {paragraph}
                </p>
              );
            })}
          </section>
        );
      })}
    </article>
  );
}

function QuestionPane({ questions, onSelectQuestion }) {
  const { state, dispatch } = useReadingExamContext();
  const active = questions.find((question) => question.questionKey === state.activeQuestionKey) || questions[0];
  if (!active) return <aside className="question-pane">暂无阅读题。</aside>;

  function answer(value) {
    dispatch({ type: "ANSWER", questionKey: active.questionKey, answer: value });
  }

  return (
    <aside className="question-pane">
      <div className="question-title-row">
        <div>
          <span className="counter">Q{active.questionNo}</span>
          <h2>{active.prompt}</h2>
        </div>
        <button className="ghost-button" onClick={() => dispatch({ type: "TOGGLE_UNCERTAIN", questionKey: active.questionKey })}>
          <Bookmark size={16} />
          {state.uncertain[active.questionKey] ? "取消标记" : "不确定"}
        </button>
      </div>

      {active.type === "single-choice" && (
        <div className="option-list">
          {active.options.map((option) => (
            <button
              key={option.key}
              className={state.answers[active.questionKey] === option.key ? "option selected" : "option"}
              onClick={() => answer(option.key)}
            >
              <strong>{option.key}.</strong> {option.text}
            </button>
          ))}
        </div>
      )}

      {active.type === "multiple-choice" && (
        <div className="option-list">
          {active.options.map((option) => {
            const selected = Array.isArray(state.answers[active.questionKey]) ? state.answers[active.questionKey] : [];
            return (
              <label key={option.key} className={selected.includes(option.key) ? "choice-check selected" : "choice-check"}>
                <input
                  type="checkbox"
                  checked={selected.includes(option.key)}
                  onChange={() => {
                    const next = selected.includes(option.key)
                      ? selected.filter((item) => item !== option.key)
                      : [...selected, option.key].sort();
                    answer(next);
                  }}
                />
                <span><strong>{option.key}.</strong> {option.text}</span>
              </label>
            );
          })}
        </div>
      )}

      {active.type === "blank" && (
        <input
          className="blank-input"
          value={state.answers[active.questionKey] || ""}
          onChange={(event) => answer(event.target.value)}
          placeholder="请输入答案"
        />
      )}

      <div className="action-row">
        {questions.map((question) => (
          <button
            key={question.questionKey}
            className={question.questionKey === active.questionKey ? "mini-question active" : "mini-question"}
            onClick={() => onSelectQuestion(question)}
          >
            {question.questionNo}
          </button>
        ))}
      </div>
    </aside>
  );
}

function QuestionNavigator({ questions, onSelectQuestion }) {
  const { state } = useReadingExamContext();
  return (
    <aside className="navigator-pane">
      <h2>题目导航</h2>
      <div className="navigator-grid">
        {questions.map((question) => {
          const answered = hasAnswer(state.answers[question.questionKey]);
          const uncertain = state.uncertain[question.questionKey];
          return (
            <button
              key={question.questionKey}
              className={[
                "nav-question",
                state.activeQuestionKey === question.questionKey ? "active" : "",
                answered ? "answered" : "",
                uncertain ? "uncertain" : ""
              ].join(" ")}
              onClick={() => onSelectQuestion(question)}
              title={uncertain ? "标记不确定" : answered ? "已答" : "未答"}
            >
              {answered ? <CheckCircle2 size={15} /> : uncertain ? <AlertTriangle size={15} /> : <Circle size={15} />}
              {question.questionNo}
            </button>
          );
        })}
      </div>
      <div className="legend">
        <span><Circle size={14} />未答</span>
        <span><CheckCircle2 size={14} />已答</span>
        <span><AlertTriangle size={14} />不确定</span>
      </div>
    </aside>
  );
}

function hasAnswer(answer) {
  if (Array.isArray(answer)) return answer.length > 0;
  return answer !== undefined && answer !== null && String(answer).trim() !== "";
}

function saveText(status, lastSavedAt) {
  if (status === "saving") return "保存中";
  if (status === "error") return "保存失败";
  if (!lastSavedAt) return "待保存";
  return `已保存 ${new Date(lastSavedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}
