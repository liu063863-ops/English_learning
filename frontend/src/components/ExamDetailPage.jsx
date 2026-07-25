import {
  ArrowLeft,
  BookmarkCheck,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  Headphones,
  Lock,
  PenLine,
  Send,
  Type
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import SkeletonCard from "./SkeletonCard.jsx";

const sectionLabels = { listening: "听力", reading: "阅读", translation: "翻译", writing: "写作" };
const sectionIcons = { listening: Headphones, reading: FileText, translation: Type, writing: PenLine };
const DRAFT_PREFIX = "exam-draft-v1:";
const WRONG_BOOK_KEY = "exam-wrong-book-v1";

export default function ExamDetailPage({ examId }) {
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState({});
  const [currentKey, setCurrentKey] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [report, setReport] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.examDetail(examId)
      .then((result) => {
        if (!alive) return;
        const loaded = normalizeExam(result?.data || result);
        const draft = readDraft(examId);
        setExam(loaded);
        setAnswers(draft.answers || {});
        setSubmitted(Boolean(draft.submitted));
        setReport(draft.report || null);
        setLastSavedAt(draft.lastSavedAt || "");
        setCurrentKey(draft.currentKey || flattenQuestions(loaded)[0]?.key || "");
      })
      .catch((err) => alive && setError(err.message || "加载试卷失败"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [examId]);

  const questions = useMemo(() => flattenQuestions(exam), [exam]);
  const current = questions.find((item) => item.key === currentKey) || questions[0];
  const activeSectionType = current?.sectionType || "listening";
  const unansweredCount = questions.filter((question) => !hasAnswer(answers[question.key])).length;

  useEffect(() => {
    if (!exam || submitted) return undefined;
    const timer = window.setInterval(() => saveDraft(), 30000);
    return () => window.clearInterval(timer);
  }, [answers, currentKey, exam, submitted]);

  function saveDraft(next = {}) {
    const payload = {
      examId,
      answers,
      currentKey,
      submitted,
      report,
      lastSavedAt: new Date().toISOString(),
      ...next
    };
    localStorage.setItem(`${DRAFT_PREFIX}${examId}`, JSON.stringify(payload));
    setLastSavedAt(payload.lastSavedAt);
  }

  function updateAnswer(questionKey, value) {
    if (submitted) return;
    setAnswers((currentAnswers) => ({ ...currentAnswers, [questionKey]: value }));
  }

  function jumpTo(questionKey) {
    setCurrentKey(questionKey);
    saveDraft({ currentKey: questionKey });
  }

  function submitExam() {
    if (!window.confirm(`还有 ${unansweredCount} 道题未答，确认交卷吗？`)) return;
    const nextReport = gradeExam(exam, questions, answers);
    saveWrongQuestions(exam, nextReport.wrongQuestions);
    setSubmitted(true);
    setReport(nextReport);
    saveDraft({ submitted: true, report: nextReport });
  }

  function goBack() {
    window.history.pushState({}, "", "/exams");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  if (loading) return <section className="page-section"><SkeletonCard /></section>;
  if (error) return <section className="page-section"><div className="feedback wrong">{error}</div></section>;
  if (!exam) return <section className="page-section"><div className="empty-state">暂无试卷</div></section>;

  return (
    <section className="page-section exam-taking-page">
      <header className="page-header exam-taking-header">
        <div>
          <button className="ghost-button" onClick={goBack}><ArrowLeft size={16} /> 返回列表</button>
          <h1>{exam.title}</h1>
          <p>{exam.year} 年 {exam.month} 月 · {exam.level} · 第 {exam.set_num || exam.setNum} 套</p>
        </div>
        <div className="exam-toolbar">
          <span className="exam-chip"><Clock size={16} />{lastSavedAt ? `已保存 ${new Date(lastSavedAt).toLocaleTimeString()}` : "等待保存"}</span>
          {submitted && <span className="exam-chip"><Lock size={16} />已交卷</span>}
          {!submitted && <button className="secondary-button" onClick={() => saveDraft()}>保存</button>}
          {!submitted && <button className="primary-button" onClick={submitExam}><Send size={16} /> 交卷</button>}
        </div>
      </header>

      {submitted && report && <ScoreReport report={report} onReview={jumpTo} />}

      <div className="exam-layout">
        <main className="exam-content">
          {activeSectionType === "reading" ? (
            <NestedReadingSection
              exam={exam}
              answers={answers}
              currentKey={current?.key}
              submitted={submitted}
              report={report}
              onJump={jumpTo}
              onAnswer={updateAnswer}
            />
          ) : current ? (
            <QuestionWorkspace
              exam={exam}
              question={current}
              answer={answers[current.key]}
              submitted={submitted}
              report={report}
              onAnswer={(value) => updateAnswer(current.key, value)}
            />
          ) : (
            <div className="empty-state">暂无题目</div>
          )}
        </main>
        <aside className="exam-sidebar">
          <SectionRail exam={exam} currentKey={current?.key} activeSectionType={activeSectionType} answers={answers} onJump={jumpTo} />
          <QuestionGrid questions={questions} currentKey={current?.key} answers={answers} onJump={jumpTo} />
        </aside>
      </div>
    </section>
  );
}

function SectionRail({ exam, currentKey, activeSectionType, answers, onJump }) {
  return (
    <aside className="exam-section-rail">
      {(exam.sections || []).map((section) => {
        const Icon = sectionIcons[section.section_type] || FileText;
        const isActiveSection = section.section_type === activeSectionType;
        return (
          <div key={section._id || section.id} className={isActiveSection ? "exam-section-block active" : "exam-section-block muted"}>
            <h2><Icon size={17} /> {sectionLabels[section.section_type] || section.section_name}</h2>
            <div className="section-mini-grid">
              {(section.questions || []).map((question) => (
                <button
                  key={question.key}
                  className={[
                    "question-dot mini-question",
                    hasAnswer(answers[question.key]) ? "answered" : "unanswered",
                    question.key === currentKey ? "current active" : ""
                  ].join(" ")}
                  onClick={() => onJump(question.key)}
                >
                  {question.displayNo}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </aside>
  );
}

function NestedReadingSection({ exam, answers, currentKey, submitted, report, onJump, onAnswer }) {
  const reading = exam.sections?.find((section) => section.section_type === "reading");
  const questions = reading?.questions || [];
  const passages = reading?.passages?.length ? reading.passages : exam.passages || [];
  const passageItems = useMemo(() => buildPassageItems(passages), [passages]);
  const paragraphRefs = useRef({});
  const questionRefs = useRef({});
  const [activeParagraph, setActiveParagraph] = useState(passageItems[0]?.paragraphs[0]?.key || "");

  useEffect(() => {
    const currentQuestion = questions.find((question) => question.key === currentKey);
    if (!currentQuestion) return;
    const paragraphKey = paragraphKeyForQuestion(currentQuestion, passageItems);
    setActiveParagraph(paragraphKey);
    window.setTimeout(() => {
      paragraphRefs.current[paragraphKey]?.scrollIntoView({ behavior: "smooth", block: "center" });
      questionRefs.current[currentQuestion.key]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 30);
  }, [currentKey, questions, passageItems]);

  function focusQuestion(question) {
    const paragraphKey = paragraphKeyForQuestion(question, passageItems);
    setActiveParagraph(paragraphKey);
    onJump(question.key);
    window.setTimeout(() => {
      paragraphRefs.current[paragraphKey]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 30);
  }

  function focusParagraph(paragraph) {
    setActiveParagraph(paragraph.key);
    const firstQuestion = questions.find((question) => paragraphKeyForQuestion(question, passageItems) === paragraph.key);
    if (firstQuestion) {
      onJump(firstQuestion.key);
      window.setTimeout(() => {
        questionRefs.current[firstQuestion.key]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 30);
    }
  }

  return (
    <article className="nested-reading-panel">
      <div className="nested-reading-header">
        <div>
          <span className="counter">阅读</span>
          <h2>{passages.length > 1 ? `${passages.length} passages` : passages[0]?.title || "Reading Passage"}</h2>
        </div>
        <span className="exam-chip">{questions.filter((q) => hasAnswer(answers[q.key])).length}/{questions.length} 已答</span>
      </div>

      <div className="reading-split nested-reading-layout">
        <section className="reading-passage reading-passage-pane" aria-label="阅读原文">
          {passageItems.map((passage) => {
            const linkedQuestions = questions.filter((question) => idValue(question.passage_ref?.passage_id || question.passage_id) === passage.id);
            return (
              <article key={passage.key} className="reading-passage-block">
                <div className="reading-passage-head">
                  <div>
                    <span className="counter">{passage.label}</span>
                    <h3>{passage.title || `Passage ${passage.index + 1}`}</h3>
                  </div>
                  <span className="exam-chip">{linkedQuestions.length} 题</span>
                </div>
                {passage.paragraphs.map((paragraph) => {
                  const paragraphQuestions = questions.filter((question) => paragraphKeyForQuestion(question, passageItems) === paragraph.key);
                  return (
                    <p
                      key={paragraph.key}
                      ref={(node) => {
                        if (node) paragraphRefs.current[paragraph.key] = node;
                      }}
                      className={paragraph.key === activeParagraph ? "passage-paragraph reading-paragraph active" : "passage-paragraph reading-paragraph"}
                      onClick={() => focusParagraph(paragraph)}
                    >
                      <span className="paragraph-marker paragraph-mark">{paragraph.label}</span>
                      {paragraphQuestions.length > 0 && (
                        <span className="paragraph-question-tags">
                          {paragraphQuestions.map((question) => (
                            <button
                              type="button"
                              key={question.key}
                              onClick={(event) => {
                                event.stopPropagation();
                                focusQuestion(question);
                              }}
                            >
                              Q{question.displayNo}
                            </button>
                          ))}
                        </span>
                      )}
                      <span>{paragraph.text}</span>
                    </p>
                  );
                })}
              </article>
            );
          })}
        </section>

        <section className="reading-questions reading-question-pane" aria-label="阅读题目">
          {questions.map((question) => {
            const detail = report?.details?.find((item) => item.key === question.key);
            return (
              <article
                key={question.key}
                ref={(node) => {
                  if (node) questionRefs.current[question.key] = node;
                }}
                className={question.key === currentKey ? "embedded-reading-question active" : "embedded-reading-question"}
                onClick={() => focusQuestion(question)}
              >
                <div className="embedded-question-head">
                  <button
                    type="button"
                    className="question-dot mini-question current"
                    onClick={(event) => {
                      event.stopPropagation();
                      focusQuestion(question);
                    }}
                  >
                    {question.displayNo}
                  </button>
                  <strong>{question.prompt}</strong>
                  <span className={hasAnswer(answers[question.key]) ? "answer-state answered" : "answer-state"}>
                    {hasAnswer(answers[question.key]) ? "已答" : "未答"}
                  </span>
                </div>
                <ObjectiveAnswer
                  question={question}
                  value={answers[question.key]}
                  disabled={submitted}
                  onChange={(value) => onAnswer(question.key, value)}
                />
                {submitted && detail && <QuestionReview detail={detail} />}
              </article>
            );
          })}
        </section>
      </div>

      <div className="reading-local-nav">
        {questions.map((question) => (
          <button
            type="button"
            key={question.key}
            className={["nav-question", question.key === currentKey ? "active" : "", hasAnswer(answers[question.key]) ? "answered" : ""].join(" ")}
            onClick={() => focusQuestion(question)}
          >
            {hasAnswer(answers[question.key]) ? <CheckCircle2 size={15} /> : <Circle size={15} />}
            {question.displayNo}
          </button>
        ))}
      </div>
    </article>
  );
}

function QuestionWorkspace({ exam, question, answer, submitted, report, onAnswer }) {
  const detail = report?.details?.find((item) => item.key === question.key);
  return (
    <article className="exam-question-card">
      <div className="question-title-row">
        <div>
          <span className="counter">Q{question.displayNo}</span>
          <h2>{question.prompt}</h2>
        </div>
        <span className="exam-chip">{sectionLabels[question.sectionType]}</span>
      </div>
      {question.sectionType === "listening" && <AudioArea exam={exam} />}
      {isSubjective(question) ? (
        <SubjectiveAnswer value={answer || ""} disabled={submitted} onChange={onAnswer} />
      ) : (
        <ObjectiveAnswer question={question} value={answer} disabled={submitted} onChange={onAnswer} />
      )}
      {submitted && detail && <QuestionReview detail={detail} />}
    </article>
  );
}

function AudioArea({ exam }) {
  const audio = exam.sections?.find((section) => section.section_type === "listening")?.audioFiles?.[0] || exam.audioFiles?.[0];
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  if (!audio?.file_url) return <div className="empty-state">鏆傛棤鍚姏闊抽</div>;
  return (
    <div className="audio-player-panel">
      <audio
        ref={audioRef}
        src={audio.file_url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => {
          const node = event.currentTarget;
          setProgress(node.duration ? Math.round((node.currentTime / node.duration) * 100) : 0);
        }}
      />
      <button className="secondary-button" onClick={() => audioRef.current?.paused ? audioRef.current?.play() : audioRef.current?.pause()}>
        {playing ? "鏆傚仠" : "鎾斁"}
      </button>
      <input
        type="range"
        min="0"
        max="100"
        value={progress}
        onChange={(event) => {
          const node = audioRef.current;
          if (!node?.duration) return;
          node.currentTime = (Number(event.target.value) / 100) * node.duration;
          setProgress(Number(event.target.value));
        }}
      />
      <span>{progress}%</span>
    </div>
  );
}

function ObjectiveAnswer({ question, value, disabled, onChange }) {
  const options = normalizeOptions(question.options);
  if (question.question_type === "multiple_choice") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="option-list">
        {options.map((option) => (
          <label key={option.key} className={selected.includes(option.key) ? "option-card choice-check selected" : "option-card choice-check"}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={selected.includes(option.key)}
              onChange={() => onChange(selected.includes(option.key) ? selected.filter((item) => item !== option.key) : [...selected, option.key].sort())}
            />
            <span className="option-letter">{option.key}</span>
            <span>{option.text}</span>
          </label>
        ))}
      </div>
    );
  }
  if (question.question_type === "blank") {
    return <input className="blank-input" disabled={disabled} value={value || ""} onChange={(event) => onChange(event.target.value)} placeholder="请输入答案" />;
  }
  return (
    <div className="option-list">
      {options.map((option) => (
        <button key={option.key} disabled={disabled} className={value === option.key ? "option-card option selected" : "option-card option"} onClick={() => onChange(option.key)}>
          <span className="option-letter">{option.key}</span>
          <span>{option.text}</span>
        </button>
      ))}
    </div>
  );
}

function SubjectiveAnswer({ value, disabled, onChange }) {
  return (
    <div>
      <textarea className="essay-box" disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} placeholder="请输入你的答案" />
      <div className="word-count">字数统计：{countWords(value)}</div>
    </div>
  );
}

function QuestionGrid({ questions, currentKey, answers, onJump }) {
  return (
    <footer className="question-nav exam-bottom-nav">
      {questions.map((question) => (
        <button
          key={question.key}
          className={[
            "question-dot nav-question",
            hasAnswer(answers[question.key]) ? "answered" : "unanswered",
            currentKey === question.key ? "current active" : ""
          ].join(" ")}
          onClick={() => onJump(question.key)}
        >
          {hasAnswer(answers[question.key]) ? <CheckCircle2 size={15} /> : <Circle size={15} />}
          {question.displayNo}
        </button>
      ))}
    </footer>
  );
}

function ScoreReport({ report, onReview }) {
  return (
    <section className="score-report">
      <div>
        <h2>成绩报告</h2>
        <p>总分 {report.totalScore} / {report.totalPossible}，客观题按参考答案批改，主观题暂按字数给测试分。</p>
      </div>
      <div className="score-grid">
        {report.sections.map((section) => (
          <div key={section.sectionType} className="metric-card">
            <span>{sectionLabels[section.sectionType]}</span>
            <strong>{section.score}/{section.total}</strong>
          </div>
        ))}
      </div>
      {report.wrongQuestions.length > 0 && (
        <div className="item-list">
          {report.wrongQuestions.map((item) => (
            <button key={item.key} className="list-card wrong-review-card" onClick={() => onReview(item.key)}>
              <BookmarkCheck size={16} />
              <span>错题 Q{item.displayNo || item.globalNo}：{item.prompt}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function QuestionReview({ detail }) {
  return (
    <div className={detail.isCorrect ? "feedback correct" : "feedback wrong"}>
      <p>我的答案：{formatAnswer(detail.userAnswer) || "未作答"}</p>
      <p>参考答案：{formatAnswer(detail.referenceAnswer)}</p>
      <p>解析：{detail.explanation}</p>
    </div>
  );
}

function normalizeExam(exam) {
  let globalNo = 0;
  return {
    ...exam,
    sections: (exam.sections || []).map((section) => ({
      ...section,
      questions: (section.questions || []).map((question) => {
        globalNo += 1;
        const displayNo = getDisplayQuestionNo(section.section_type, question.order_index, globalNo);
        return {
          ...question,
          key: question._id || question.id || `${section.section_type}-${question.order_index}`,
          globalNo,
          displayNo,
          sectionType: section.section_type,
          prompt: question.question_text?.raw || question.question_text || "占位题，待补全真实题目内容。"
        };
      })
    }))
  };
}

function getDisplayQuestionNo(sectionType, orderIndex, fallbackNo) {
  const order = Number(orderIndex || fallbackNo || 1);
  if (sectionType === "listening") return order;
  if (sectionType === "reading") return 25 + order;
  if (sectionType === "translation") return 56;
  if (sectionType === "writing") return 57;
  return fallbackNo;
}

function flattenQuestions(exam) {
  return (exam?.sections || []).flatMap((section) => section.questions || []);
}

function cleanPassageText(text) {
  const normalized = String(text || "").toLowerCase();
  if (!text || ["placeholder passage", "minimal mode", "pdf parsing", "暂未结构化"].some((token) => normalized.includes(token))) {
    return [
      "This reading passage is currently a structured placeholder. The original PDF text has not been extracted yet.",
      "After the real passage is imported, this area will automatically show the full article with paragraph markers.",
      "Use this placeholder to test the integrated reading workflow: read paragraphs on the left, answer linked questions on the right, and navigate by question number."
    ].join("\n\n");
  }
  return text;
}

function splitParagraphs(text) {
  const rows = String(text || "").split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  return rows.length ? rows : ["阅读文章占位段落。"];
}

function buildParagraphItems(passages) {
  return buildPassageItems(passages).flatMap((passage) => passage.paragraphs);
}

function buildPassageItems(passages) {
  const source = passages?.length ? passages : [{ _id: "placeholder", title: "Reading Passage", passage_text: "" }];
  return source.map((passage, passageIndex) => {
    const passageId = passage._id || passage.id || `passage-${passageIndex + 1}`;
    const paragraphs = splitParagraphs(cleanPassageText(passage.passage_text || passage.passageText || "")).map((text, paragraphIndex) => {
      const paragraphNo = paragraphIndex + 1;
      return {
        key: `${passageId}:P${paragraphNo}`,
        passageId,
        passageIndex,
        paragraphNo,
        label: `P${passageIndex + 1}-${paragraphNo}`,
        markerId: `P${paragraphNo}`,
        text
      };
    });
    return {
      key: passageId,
      id: passageId,
      index: passageIndex,
      title: passage.title || `Passage ${passageIndex + 1}`,
      paragraphs
    };
  });
}

function paragraphKeyForQuestion(question, paragraphItems) {
  const passageRefId = idValue(question.passage_ref?.passage_id || question.passage_id);
  const paragraphId = question.passage_ref?.paragraph_ids?.[0];
  const matchedParagraphNo = String(paragraphId || "").match(/\d+/);
  const paragraphNo = matchedParagraphNo ? Number(matchedParagraphNo[0]) : null;
  const flatParagraphs = paragraphItems.flatMap((item) => item.paragraphs || item);
  const byPassageAndParagraph = flatParagraphs.find((item) => {
    const passageMatches = passageRefId ? item.passageId === passageRefId : true;
    const paragraphMatches = paragraphNo ? item.paragraphNo === paragraphNo : false;
    return passageMatches && paragraphMatches;
  });
  if (byPassageAndParagraph) return byPassageAndParagraph.key;

  const samePassageFirst = flatParagraphs.find((item) => passageRefId && item.passageId === passageRefId);
  if (samePassageFirst) return samePassageFirst.key;

  const fallbackIndex = ((question.order_index || question.globalNo || 1) - 1) % Math.max(flatParagraphs.length, 1);
  return flatParagraphs[fallbackIndex]?.key || "";
}

function paragraphForQuestion(question, paragraphCount) {
  if (question.passage_ref?.paragraph_ids?.[0]) {
    const matched = String(question.passage_ref.paragraph_ids[0]).match(/\d+/);
    if (matched) return clamp(Number(matched[0]), 1, paragraphCount);
  }
  return clamp(((question.order_index || question.globalNo || 1) - 1) % paragraphCount + 1, 1, paragraphCount);
}

function idValue(value) {
  if (value && typeof value === "object") return value.$oid || value._id || value.id;
  return value;
}

function gradeExam(exam, questions, answers) {
  const details = questions.map((question) => {
    const sameSectionQuestions = questions.filter((item) => item.sectionType === question.sectionType);
    const possible = Number((sectionScore(question.sectionType) / (sameSectionQuestions.length || 1)).toFixed(1));
    const referenceAnswer = referenceFor(question);
    const userAnswer = answers[question.key];
    const score = isSubjective(question) ? subjectiveScore(userAnswer, possible) : compareAnswer(userAnswer, referenceAnswer) ? possible : 0;
    return {
      key: question.key,
      globalNo: question.globalNo,
      sectionType: question.sectionType,
      prompt: question.prompt,
      userAnswer,
      referenceAnswer,
      isCorrect: score >= possible * 0.6,
      score,
      possible,
      explanation: question.explanation?.raw || question.explanation || "占位解析：真实题目导入后将显示详细解析。"
    };
  });
  const sections = Object.keys(sectionLabels).map((sectionType) => {
    const rows = details.filter((item) => item.sectionType === sectionType);
    return { sectionType, score: round(rows.reduce((sum, item) => sum + item.score, 0)), total: round(rows.reduce((sum, item) => sum + item.possible, 0)) };
  });
  return {
    submittedAt: new Date().toISOString(),
    examId: exam._id || exam.id,
    totalScore: round(details.reduce((sum, item) => sum + item.score, 0)),
    totalPossible: round(details.reduce((sum, item) => sum + item.possible, 0)),
    sections,
    details,
    wrongQuestions: details.filter((item) => !item.isCorrect)
  };
}

function saveWrongQuestions(exam, wrongQuestions) {
  const existing = readWrongBook();
  const next = [...existing];
  for (const item of wrongQuestions) {
    const id = `${exam._id || exam.id}:${item.key}`;
    const row = {
      id,
      examId: exam._id || exam.id,
      examTitle: exam.title,
      globalNo: item.globalNo,
      sectionType: item.sectionType,
      prompt: item.prompt,
      userAnswer: item.userAnswer,
      referenceAnswer: item.referenceAnswer,
      explanation: item.explanation,
      mastered: false,
      updatedAt: new Date().toISOString()
    };
    const index = next.findIndex((entry) => entry.id === id);
    if (index >= 0) next[index] = row;
    else next.push(row);
  }
  localStorage.setItem(WRONG_BOOK_KEY, JSON.stringify(next));
}

export function readWrongBook() {
  try {
    return JSON.parse(localStorage.getItem(WRONG_BOOK_KEY) || "[]");
  } catch {
    return [];
  }
}

export function writeWrongBook(items) {
  localStorage.setItem(WRONG_BOOK_KEY, JSON.stringify(items));
}

function readDraft(examId) {
  try {
    return JSON.parse(localStorage.getItem(`${DRAFT_PREFIX}${examId}`) || "{}");
  } catch {
    return {};
  }
}

function referenceFor(question) {
  if (Array.isArray(question.correct_answer)) return question.correct_answer;
  if (question.correct_answer && typeof question.correct_answer !== "object") return question.correct_answer;
  if (isSubjective(question)) return "参考答案占位";
  return "A";
}

function compareAnswer(userAnswer, referenceAnswer) {
  if (Array.isArray(referenceAnswer)) return JSON.stringify(userAnswer || []) === JSON.stringify(referenceAnswer);
  return String(userAnswer || "").trim().toUpperCase() === String(referenceAnswer || "").trim().toUpperCase();
}

function subjectiveScore(value, possible) {
  const count = countWords(value || "");
  if (count === 0) return 0;
  if (count < 20) return round(possible * 0.35);
  if (count < 80) return round(possible * 0.65);
  return round(possible * 0.85);
}

function sectionScore(sectionType) {
  return { listening: 35, reading: 35, translation: 15, writing: 15 }[sectionType] || 0;
}

function isSubjective(question) {
  return question.question_type === "subjective" || ["translation", "writing"].includes(question.sectionType);
}

function normalizeOptions(options) {
  if (!Array.isArray(options) || options.length === 0) return defaultOptions();
  return options.map((option, index) => ({
    key: option.key || option.label || String.fromCharCode(65 + index),
    text: option.text || option.value || `选项 ${String.fromCharCode(65 + index)}`
  }));
}

function defaultOptions() {
  return [
    { key: "A", text: "选项 A（占位）" },
    { key: "B", text: "选项 B（占位）" },
    { key: "C", text: "选项 C（占位）" },
    { key: "D", text: "选项 D（占位）" }
  ];
}

function hasAnswer(answer) {
  if (Array.isArray(answer)) return answer.length > 0;
  return answer !== undefined && answer !== null && String(answer).trim() !== "";
}

function countWords(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  return (text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).length + (text.match(/[\u4e00-\u9fa5]/g) || []).length;
}

function formatAnswer(answer) {
  if (Array.isArray(answer)) return answer.join(", ");
  if (answer && typeof answer === "object") return answer.reference || "参考答案占位";
  return String(answer ?? "");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Number(value.toFixed(1));
}

