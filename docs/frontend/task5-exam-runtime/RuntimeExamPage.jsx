import { useEffect, useMemo, useRef, useState } from "react";
import "./runtime-exam.css";

const API = "/api/runtime";
const SECTION_TYPES = ["listening", "reading", "translation", "writing"];

export default function RuntimeExamPage() {
  const [filters, setFilters] = useState({ level: "CET4", yearMin: 2018, yearMax: 2026, set_num: "" });
  const [exams, setExams] = useState([]);
  const [exam, setExam] = useState(null);
  const [activeSection, setActiveSection] = useState("listening");
  const [sectionCache, setSectionCache] = useState({});
  const [answers, setAnswers] = useState({});
  const [report, setReport] = useState(null);
  const [savingText, setSavingText] = useState("");
  const [loading, setLoading] = useState(false);
  const startedAt = useRef(null);
  const saveTimer = useRef(null);

  async function loadExams() {
    const query = new URLSearchParams(
      Object.entries(filters).filter(([, value]) => value !== "")
    ).toString();
    const res = await fetchJson(`${API}/exams?${query}`);
    setExams(res.data || []);
  }

  async function selectExam(nextExam) {
    setExam(nextExam);
    setReport(null);
    setSectionCache({});
    setActiveSection("listening");
    startedAt.current = Date.now();

    const progress = await fetchJson(`${API}/exams/${nextExam._id}/progress`);
    const restored = {};
    progress.data?.answers?.forEach((item) => {
      restored[String(item.question_id)] = {
        question_id: String(item.question_id),
        section_id: String(item.section_id),
        answer: item.answer
      };
    });
    setAnswers(restored);
    await loadSection(nextExam._id, "listening");
  }

  async function loadSection(examId, sectionType) {
    const key = `${examId}:${sectionType}`;
    if (sectionCache[key]) return sectionCache[key];

    setLoading(true);
    try {
      const res = await fetchJson(`${API}/exams/${examId}/sections/${sectionType}`);
      const data = res.data;
      setSectionCache((cache) => ({ ...cache, [key]: data }));

      if (sectionType === "listening") {
        data.audioFiles?.forEach((audio) => {
          const element = new Audio(audio.file_url);
          element.preload = "metadata";
        });
      }
      return data;
    } finally {
      setLoading(false);
    }
  }

  async function switchSection(sectionType) {
    if (!exam) return;
    await saveProgress();
    setActiveSection(sectionType);
    await loadSection(exam._id, sectionType);
  }

  function setAnswer(question, value) {
    setAnswers((draft) => ({
      ...draft,
      [question._id]: {
        question_id: question._id,
        section_id: question.section_id,
        answer: value
      }
    }));
  }

  async function saveProgress() {
    if (!exam) return;
    const rows = Object.values(answers);
    if (!rows.length) return;
    setSavingText("保存中...");
    await fetchJson(`${API}/exams/${exam._id}/progress`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: rows })
    });
    setSavingText(`已保存 ${new Date().toLocaleTimeString()}`);
  }

  async function submitExam() {
    if (!exam) return;
    await saveProgress();
    const unanswered = allQuestions.filter((question) => !answers[question._id]?.answer);
    const minutes = Math.max(Math.round((Date.now() - startedAt.current) / 60000), 1);
    const ok = window.confirm(`本次用时 ${minutes} 分钟，仍有 ${unanswered.length} 题未答。确认交卷吗？`);
    if (!ok) return;

    const res = await fetchJson(`${API}/exams/${exam._id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: Object.values(answers) })
    });
    setReport(res.data);
  }

  useEffect(() => {
    loadExams();
  }, []);

  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(saveProgress, 1500);
    return () => window.clearTimeout(saveTimer.current);
  }, [answers]);

  const activeData = exam ? sectionCache[`${exam._id}:${activeSection}`] : null;
  const allQuestions = useMemo(
    () => Object.values(sectionCache).flatMap((section) => section?.questions || []),
    [sectionCache]
  );

  return (
    <main className="runtime-page">
      <ExamSelector
        filters={filters}
        setFilters={setFilters}
        exams={exams}
        loadExams={loadExams}
        selectExam={selectExam}
      />

      {exam && (
        <section className="exam-shell">
          <header className="exam-topbar">
            <div>
              <h2>{exam.title}</h2>
              <p>
                {exam.questionCount} 题 · 预计 {exam.estimatedMinutes} 分钟 · {exam.difficultyLabel} ·
                {exam.completedUsers} 人完成
              </p>
              <small>{savingText}</small>
            </div>
            <button className="primary" onClick={submitExam}>提交并批改</button>
          </header>

          <nav className="section-tabs">
            {SECTION_TYPES.map((type) => (
              <button
                key={type}
                className={activeSection === type ? "active" : ""}
                onClick={() => switchSection(type)}
              >
                {labelSection(type)}
              </button>
            ))}
          </nav>

          {loading && <p className="loading">正在加载题型数据...</p>}
          {activeData && <SectionRenderer data={activeData} answers={answers} setAnswer={setAnswer} />}
        </section>
      )}

      {report && <SubmitReport report={report} />}
    </main>
  );
}

function ExamSelector({ filters, setFilters, exams, loadExams, selectExam }) {
  return (
    <section className="panel">
      <h1>选择新导入真题</h1>
      <div className="toolbar">
        <select value={filters.level} onChange={(event) => setFilters({ ...filters, level: event.target.value })}>
          <option value="CET4">CET4</option>
          <option value="CET6">CET6</option>
        </select>
        <label>年份 {filters.yearMin} - {filters.yearMax}</label>
        <input type="range" min="2015" max="2026" value={filters.yearMin} onChange={(event) => setFilters({ ...filters, yearMin: Number(event.target.value) })} />
        <input type="range" min="2015" max="2026" value={filters.yearMax} onChange={(event) => setFilters({ ...filters, yearMax: Number(event.target.value) })} />
        <select value={filters.set_num} onChange={(event) => setFilters({ ...filters, set_num: event.target.value })}>
          <option value="">全部套数</option>
          <option value="1">第一套</option>
          <option value="2">第二套</option>
          <option value="3">第三套</option>
        </select>
        <button onClick={loadExams}>筛选</button>
      </div>

      <div className="exam-grid">
        {exams.map((item) => (
          <button className="exam-card" key={item._id} onClick={() => selectExam(item)}>
            <strong>{item.title}</strong>
            <span>{item.level} · {item.year}/{item.month} · 第 {item.set_num} 套</span>
            <span>{item.questionCount} 题 · {item.difficultyLabel} · {item.completedUsers} 人完成</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SectionRenderer({ data, answers, setAnswer }) {
  if (data.section.section_type === "listening") {
    return <ListeningSection data={data} answers={answers} setAnswer={setAnswer} />;
  }
  if (data.section.section_type === "reading") {
    return <ReadingSection data={data} answers={answers} setAnswer={setAnswer} />;
  }
  return <SubjectiveSection data={data} answers={answers} setAnswer={setAnswer} />;
}

function ListeningSection({ data, answers, setAnswer }) {
  const audio = data.audioFiles?.[0];
  return (
    <section className="section-layout">
      <article className="panel media-pane">
        <h2>听力音频</h2>
        {audio ? <audio controls src={audio.file_url} preload="metadata" /> : <p>当前试卷未关联音频。</p>}
        <p>考试过程中不展示答案和完整原文，提交后在解析区查看。</p>
      </article>
      <QuestionList questions={data.questions} answers={answers} setAnswer={setAnswer} />
    </section>
  );
}

function ReadingSection({ data, answers, setAnswer }) {
  return (
    <section className="section-layout">
      <article className="panel passage-pane">
        {data.passages.map((passage) => (
          <div key={passage._id}>
            <h2>{passage.title || "阅读文章"}</h2>
            {String(passage.passage_text || "").split(/\n+/).filter(Boolean).map((paragraph, index) => (
              <p key={index} id={`paragraph-${index + 1}`}>
                <b>P{index + 1}</b> {paragraph}
              </p>
            ))}
          </div>
        ))}
      </article>
      <QuestionList questions={data.questions} answers={answers} setAnswer={setAnswer} />
    </section>
  );
}

function SubjectiveSection({ data, answers, setAnswer }) {
  return (
    <section className="section-layout single-column">
      <QuestionList questions={data.questions} answers={answers} setAnswer={setAnswer} subjective />
    </section>
  );
}

function QuestionList({ questions, answers, setAnswer, subjective = false }) {
  return (
    <aside className="panel question-pane">
      <QuestionNavigator questions={questions} answers={answers} />
      {questions.map((question) => (
        <div className="question-card" id={`question-${question._id}`} key={question._id}>
          <h3>{question.order_index}. {richText(question.question_text)}</h3>
          {subjective || question.question_type === "subjective" ? (
            <textarea value={answers[question._id]?.answer || ""} onChange={(event) => setAnswer(question, event.target.value)} />
          ) : question.question_type === "multiple_choice" ? (
            question.options.map((option) => {
              const selected = Array.isArray(answers[question._id]?.answer) ? answers[question._id].answer : [];
              return (
                <label className="choice-row" key={option.key}>
                  <input
                    type="checkbox"
                    checked={selected.includes(option.key)}
                    onChange={() => setAnswer(question, selected.includes(option.key)
                      ? selected.filter((item) => item !== option.key)
                      : [...selected, option.key])}
                  />
                  {option.key}. {option.text}
                </label>
              );
            })
          ) : question.question_type === "fill_blank" ? (
            <input
              className="blank-input"
              value={answers[question._id]?.answer || ""}
              onChange={(event) => setAnswer(question, event.target.value)}
              placeholder="请输入答案"
            />
          ) : (
            question.options.map((option) => (
              <button
                className={answers[question._id]?.answer === option.key ? "selected" : ""}
                key={option.key}
                onClick={() => setAnswer(question, option.key)}
              >
                {option.key}. {option.text}
              </button>
            ))
          )}
        </div>
      ))}
    </aside>
  );
}

function QuestionNavigator({ questions, answers }) {
  return (
    <div className="question-nav">
      {questions.map((question) => (
        <a
          key={question._id}
          className={answers[question._id]?.answer ? "done" : ""}
          href={`#question-${question._id}`}
        >
          {question.order_index}
        </a>
      ))}
    </div>
  );
}

function SubmitReport({ report }) {
  return (
    <section className="panel report-panel">
      <h2>批改结果：{report.totalScore} 分</h2>
      <div className="type-score-grid">
        {Object.entries(report.byType || {}).map(([type, stat]) => (
          <div key={type}>
            <strong>{labelQuestionType(type)}</strong>
            <span>{stat.correct}/{stat.total} 正确 · {stat.score} 分</span>
          </div>
        ))}
      </div>
      {report.details.map((detail) => (
        <article className={detail.is_correct ? "result correct" : "result wrong"} key={detail.question_id}>
          <h3>{richText(detail.question_text)}</h3>
          <p>正确答案：{Array.isArray(detail.correct_answer) ? detail.correct_answer.join(", ") : String(detail.correct_answer ?? "待评分")}</p>
          <p>{richText(detail.explanation)}</p>
          {detail.transcript && <p>听力原文：{detail.transcript}</p>}
          {detail.passage_ref?.evidence_text && <p>定位句：{detail.passage_ref.evidence_text}</p>}
        </article>
      ))}
    </section>
  );
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error?.message || "请求失败");
  }
  return payload;
}

function richText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.raw || value.html || "";
}

function labelSection(type) {
  return { listening: "听力", reading: "阅读", translation: "翻译", writing: "写作" }[type] || type;
}

function labelQuestionType(type) {
  return {
    single_choice: "单选",
    multiple_choice: "多选",
    fill_blank: "填空",
    subjective: "主观题"
  }[type] || type;
}
