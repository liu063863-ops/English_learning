import { useEffect, useState } from "react";
import { api } from "../api.js";
import SkeletonCard from "./SkeletonCard.jsx";

export default function PracticeModule({ onChanged }) {
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.questions().then(setQuestions);
  }, []);

  if (!questions.length) {
    return (
      <section className="page-section">
        <SkeletonCard />
      </section>
    );
  }

  const question = questions[current];

  async function submit() {
    const payload = await api.submitQuestion(question.id, selected);
    setResult(payload);
    onChanged();
  }

  function next() {
    setCurrent((index) => (index + 1) % questions.length);
    setSelected("");
    setResult(null);
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <h1>题库练习</h1>
          <p>{question.source} · {question.type}</p>
        </div>
        <span className="counter">{current + 1}/{questions.length}</span>
      </header>

      <article className="exercise-panel">
        <h2>{question.prompt}</h2>
        <div className="option-list">
          {question.options.map((option) => (
            <button
              key={option}
              className={selected === option ? "option selected" : "option"}
              onClick={() => setSelected(option)}
              disabled={Boolean(result)}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="action-row">
          <button className="primary-button" disabled={!selected || result} onClick={submit}>提交答案</button>
          <button className="ghost-button" onClick={next}>下一题</button>
        </div>
      </article>

      {result && (
        <div className={result.isCorrect ? "feedback correct" : "feedback wrong"}>
          <strong>{result.isCorrect ? "回答正确" : "已加入错题本"}</strong>
          <p>正确答案：{result.answer}</p>
          <p>{result.explanation}</p>
        </div>
      )}
    </section>
  );
}
