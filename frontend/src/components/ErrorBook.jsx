import { CheckCircle2, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { readWrongBook, writeWrongBook } from "./ExamDetailPage.jsx";

export default function ErrorBook({ onChanged }) {
  const [items, setItems] = useState([]);

  function load() {
    setItems(readWrongBook().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))));
  }

  useEffect(() => {
    load();
  }, []);

  function toggle(item) {
    const next = readWrongBook().map((entry) => (
      entry.id === item.id ? { ...entry, mastered: !entry.mastered } : entry
    ));
    writeWrongBook(next);
    load();
    onChanged?.();
  }

  const pendingCount = items.filter((item) => !item.mastered).length;

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <h1>错题本</h1>
          <p>考试和练习中答错的题会自动收录到这里，方便集中复盘。</p>
        </div>
        <span className="counter">{pendingCount} 待复习</span>
      </header>

      <div className="item-list error-book-list">
        {items.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🎯</div>
            <h3>目前没有错题</h3>
            <p>完成一套考试或阅读练习后，错题会自动进入这里。</p>
          </div>
        )}

        {items.map((item) => (
          <article key={item.id} className={item.mastered ? "mistake-item mastered" : "mistake-item"}>
            <span className={item.mastered ? "mistake-status mastered" : "mistake-status"} aria-hidden="true" />
            <div className="mistake-content">
              <div className="mistake-head">
                <span>{item.examTitle} · {sectionName(item.sectionType)} · Q{item.globalNo}</span>
                <button className="ghost-button" onClick={() => toggle(item)}>
                  {item.mastered ? <RotateCcw size={16} /> : <CheckCircle2 size={16} />}
                  {item.mastered ? "恢复复习" : "标记掌握"}
                </button>
              </div>
              <h2>{item.prompt}</h2>
              <div className="error-answer-grid">
                <p><strong>我的答案：</strong>{formatAnswer(item.userAnswer) || "未作答"}</p>
                <p><strong>参考答案：</strong>{formatAnswer(item.referenceAnswer)}</p>
              </div>
              <p className="explanation">{item.explanation || "暂无解析"}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function sectionName(sectionType) {
  return { listening: "听力", reading: "阅读", translation: "翻译", writing: "写作" }[sectionType] || sectionType;
}

function formatAnswer(answer) {
  if (Array.isArray(answer)) return answer.join(", ");
  if (answer && typeof answer === "object") return answer.reference || "参考答案占位";
  return String(answer ?? "");
}
