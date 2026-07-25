import { ArrowLeft, CheckCircle2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { readWrongBook, writeWrongBook } from "./ExamDetailPage.jsx";
import SkeletonCard from "./SkeletonCard.jsx";

const levels = [
  { label: "全部", value: "" },
  { label: "CET4", value: "CET4" },
  { label: "CET6", value: "CET6" }
];

const themes = ["Education", "Technology", "Environment", "Health", "Culture", "Economy"];

export default function ReadingPractice({ onChanged }) {
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ level: "", year: "", theme: "", keyword: "" });
  const [selectedPassageId, setSelectedPassageId] = useState("");
  const [practice, setPractice] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadList();
  }, []);

  async function loadList(nextFilters = filters) {
    setLoading(true);
    setError("");
    try {
      const rows = await api.readings({ ...nextFilters, limit: 201 });
      setItems(rows);
    } catch (err) {
      setError(err.message || "加载阅读练习失败");
    } finally {
      setLoading(false);
    }
  }

  async function startPractice(passageId) {
    setLoading(true);
    setError("");
    try {
      const data = await api.readingPractice(passageId);
      setSelectedPassageId(passageId);
      setPractice(data);
      setAnswers({});
      setResult(null);
    } catch (err) {
      setError(err.message || "加载文章失败");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!practice) return;
    const payload = await api.submitReading(practice.id, answers);
    setResult(payload);
    saveWrongReadingQuestions(practice, payload.wrongQuestions || []);
    onChanged?.();
  }

  function backToList() {
    setSelectedPassageId("");
    setPractice(null);
    setAnswers({});
    setResult(null);
  }

  if (selectedPassageId && practice) {
    return (
      <ReadingPracticeSession
        practice={practice}
        answers={answers}
        result={result}
        onAnswer={(questionId, value) => setAnswers((current) => ({ ...current, [questionId]: value }))}
        onSubmit={submit}
        onBack={backToList}
      />
    );
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <h1>阅读练习</h1>
          <p>复用真题考试中的阅读文章和题目，按年份、级别和主题筛选练习。</p>
        </div>
        <span className="counter">{items.length} 篇文章</span>
      </header>

      <div className="exam-filter-panel reading-practice-filter">
        <div className="level-toggle">
          {levels.map((item) => (
            <button
              key={item.label}
              className={filters.level === item.value ? "level-button active" : "level-button"}
              onClick={() => {
                const next = { ...filters, level: item.value };
                setFilters(next);
                loadList(next);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <label className="filter-field">
          <span>年份</span>
          <select
            value={filters.year}
            onChange={(event) => {
              const next = { ...filters, year: event.target.value };
              setFilters(next);
              loadList(next);
            }}
          >
            <option value="">全部年份</option>
            {Array.from({ length: 9 }, (_, index) => 2023 - index).map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          <span>主题</span>
          <select
            value={filters.theme}
            onChange={(event) => {
              const next = { ...filters, theme: event.target.value };
              setFilters(next);
              loadList(next);
            }}
          >
            <option value="">全部主题</option>
            {themes.map((theme) => (
              <option key={theme} value={theme}>{theme}</option>
            ))}
          </select>
        </label>

        <label className="filter-field search-field">
          <span>搜索</span>
          <div className="search-box">
            <Search size={16} />
            <input
              value={filters.keyword}
              placeholder="文章标题或关键词"
              onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === "Enter") loadList(filters);
              }}
            />
          </div>
        </label>

        <button className="secondary-button" onClick={() => loadList(filters)}>筛选</button>
      </div>

      {error && <div className="feedback wrong">{error}</div>}
      {loading && (
        <div className="skeleton-grid">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}
      {!loading && !items.length && (
        <div className="empty-state">
          <div className="empty-icon">📖</div>
          <h3>暂无阅读材料</h3>
          <p>请确认真题阅读数据已导入，或调整筛选条件。</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="reading-practice-grid">
          {items.map((item) => (
            <article key={item.id} className="list-card reading-practice-card">
              <div className="list-card-head">
                <div>
                  <span>{item.level} · {item.year} 年 {item.month} 月 · 第 {item.setNum} 套</span>
                  <h2>{item.title}</h2>
                </div>
                <strong>{item.questionCount} 题</strong>
              </div>
              <p>{item.preview}</p>
              <div className="reading-practice-meta">
                <span>主题：{item.theme}</span>
                <span>难度：{item.difficulty}/5</span>
              </div>
              <button className="primary-button" onClick={() => startPractice(item.id)}>开始练习</button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ReadingPracticeSession({ practice, answers, result, onAnswer, onSubmit, onBack }) {
  const answeredCount = Object.values(answers).filter((value) => String(value || "").trim()).length;
  const resultById = useMemo(() => new Map((result?.details || []).map((item) => [item.questionId, item])), [result]);

  return (
    <section className="page-section reading-practice-session">
      <header className="page-header">
        <div>
          <button className="ghost-button" onClick={onBack}><ArrowLeft size={16} /> 返回列表</button>
          <h1>{practice.title}</h1>
          <p>{practice.examTitle} · {practice.level} · {practice.year} 年 {practice.month} 月</p>
        </div>
        <span className="counter">{answeredCount}/{practice.questions.length} 已答</span>
      </header>

      <div className="nested-reading-layout practice-reading-layout">
        <article className="reading-passage-pane">
          {splitParagraphs(practice.passageText).map((paragraph, index) => (
            <p key={index} className="reading-paragraph">
              <span className="paragraph-mark">P{index + 1}</span>
              <span>{paragraph}</span>
            </p>
          ))}
        </article>

        <article className="reading-question-pane">
          {practice.questions.map((question) => {
            const detail = resultById.get(question.id);
            return (
              <section
                key={question.id}
                data-question-id={question.id}
                className={detail ? "embedded-reading-question reviewed" : "embedded-reading-question"}
              >
                <div className="embedded-question-head">
                  <span className="mini-question">{question.displayNo}</span>
                  <strong>{question.prompt}</strong>
                  {detail && (
                    <span className={detail.isCorrect ? "answer-state answered" : "answer-state wrong-state"}>
                      {detail.isCorrect ? "正确" : "错误"}
                    </span>
                  )}
                </div>
                <div className="option-list">
                  {normalizeOptions(question.options).map((option) => (
                    <button
                      key={option.key}
                      disabled={Boolean(result)}
                      className={answers[question.id] === option.key ? "option-card selected" : "option-card"}
                      onClick={() => onAnswer(question.id, option.key)}
                    >
                      <span className="option-letter">{option.key}</span>
                      <span>{option.text}</span>
                    </button>
                  ))}
                </div>
                {detail && (
                  <div className={detail.isCorrect ? "feedback correct" : "feedback wrong"}>
                    <p><strong>我的答案：</strong>{formatAnswer(detail.userAnswer) || "未作答"}</p>
                    <p><strong>参考答案：</strong>{formatAnswer(detail.correctAnswer)}</p>
                    <p><strong>解析：</strong>{detail.explanation}</p>
                  </div>
                )}
              </section>
            );
          })}
        </article>
      </div>

      <div className="reading-local-nav">
        {practice.questions.map((question) => {
          const detail = resultById.get(question.id);
          return (
            <button
              key={question.id}
              className={[
                "nav-question",
                answers[question.id] ? "answered" : "",
                detail?.isCorrect ? "correct-nav" : "",
                detail && !detail.isCorrect ? "wrong-nav" : ""
              ].join(" ")}
              onClick={() => document.querySelector(`[data-question-id="${question.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
            >
              {detail?.isCorrect ? <CheckCircle2 size={15} /> : null}
              {question.displayNo}
            </button>
          );
        })}
        {!result && <button className="primary-button" disabled={answeredCount === 0} onClick={onSubmit}>提交并查看解析</button>}
        {result && <span className="exam-chip">正确率 {result.accuracy}% · {result.correct}/{result.total}</span>}
      </div>
    </section>
  );
}

function normalizeOptions(options) {
  if (!Array.isArray(options) || options.length === 0) return [];
  return options.map((option, index) => ({
    key: option.key || option.label || String.fromCharCode(65 + index),
    text: option.text || option.value || String(option)
  }));
}

function splitParagraphs(text) {
  const rows = String(text || "").split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  return rows.length ? rows : ["暂无文章内容。"];
}

function formatAnswer(answer) {
  if (Array.isArray(answer)) return answer.join(", ");
  return String(answer ?? "");
}

function saveWrongReadingQuestions(practice, wrongQuestions) {
  if (!wrongQuestions.length) return;
  const existing = readWrongBook();
  const next = [...existing];
  for (const item of wrongQuestions) {
    const id = `reading-practice:${practice.id}:${item.questionId}`;
    const row = {
      id,
      examId: practice.examId,
      examTitle: practice.examTitle,
      globalNo: item.displayNo,
      displayNo: item.displayNo,
      sectionType: "reading",
      prompt: item.prompt,
      userAnswer: item.userAnswer,
      referenceAnswer: item.correctAnswer,
      explanation: item.explanation,
      mastered: false,
      updatedAt: new Date().toISOString()
    };
    const index = next.findIndex((entry) => entry.id === id);
    if (index >= 0) next[index] = row;
    else next.push(row);
  }
  writeWrongBook(next);
}
