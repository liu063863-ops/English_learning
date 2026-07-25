import { useEffect, useState } from "react";
import "./ai-completion-review.css";

const API = "/api/ai-completion";

export default function AdminAiCompletionReviewPage() {
  const [type, setType] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [note, setNote] = useState("");

  async function loadCandidates() {
    const query = new URLSearchParams({ status: "pending_review", pageSize: "50" });
    if (type) query.set("candidate_type", type);
    const res = await fetchJson(`${API}/candidates?${query.toString()}`);
    setCandidates(res.data || []);
  }

  async function approve(candidateId, force = false) {
    await fetchJson(`${API}/candidates/${candidateId}/approve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_note: note, force })
    });
    setNote("");
    await loadCandidates();
  }

  async function reject(candidateId) {
    await fetchJson(`${API}/candidates/${candidateId}/reject`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_note: note })
    });
    setNote("");
    await loadCandidates();
  }

  useEffect(() => {
    loadCandidates();
  }, [type]);

  return (
    <main className="ai-review-page">
      <header className="ai-review-header">
        <div>
          <h1>AI 补全审核</h1>
          <p>AI 生成的听力原文和题目解析必须审核后才会写入题库。</p>
        </div>
        <select value={type} onChange={(event) => setType(event.target.value)}>
          <option value="">全部类型</option>
          <option value="transcript">听力原文</option>
          <option value="explanation">题目解析</option>
        </select>
      </header>

      <section className="review-note">
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="审核备注，可选" />
      </section>

      {candidates.map((candidate) => (
        <article className="candidate-card" key={candidate._id}>
          <div className="candidate-meta">
            <strong>{candidate.candidate_type === "transcript" ? "听力原文候选" : "解析候选"}</strong>
            <span>{candidate.exam_id?.title}</span>
            <span>{candidate.section_id?.section_name} · 第 {candidate.question_id?.order_index} 题</span>
          </div>

          <h2>{candidate.question_id?.question_text?.raw}</h2>
          <pre>{candidate.content?.text}</pre>

          {candidate.content?.evidence_sentence && (
            <p><b>定位句：</b>{candidate.content.evidence_sentence}</p>
          )}
          {candidate.content?.why_correct && (
            <p><b>正确原因：</b>{candidate.content.why_correct}</p>
          )}

          <div className="candidate-actions">
            <button onClick={() => reject(candidate._id)}>驳回</button>
            <button className="primary" onClick={() => approve(candidate._id)}>确认写入空字段</button>
            <button className="danger" onClick={() => approve(candidate._id, true)}>强制覆盖</button>
          </div>
        </article>
      ))}
    </main>
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
