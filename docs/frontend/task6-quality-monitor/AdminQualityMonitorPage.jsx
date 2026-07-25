import { useEffect, useState } from "react";
import "./quality-monitor.css";

const API = "/api/quality";

export default function AdminQualityMonitorPage() {
  const [tab, setTab] = useState("issues");
  const [issues, setIssues] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [patchText, setPatchText] = useState("{}");
  const [reason, setReason] = useState("");

  async function loadIssues() {
    const res = await fetchJson(`${API}/admin/issues?status=open&pageSize=50`);
    setIssues(res.data || []);
  }

  async function loadFeedback() {
    const res = await fetchJson(`${API}/admin/feedback?status=pending&pageSize=50`);
    setFeedback(res.data || []);
  }

  async function updateIssueStatus(issueId, status) {
    await fetchJson(`${API}/admin/issues/${issueId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    await loadIssues();
  }

  async function updateFeedbackStatus(feedbackId, status) {
    await fetchJson(`${API}/admin/feedback/${feedbackId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    await loadFeedback();
  }

  async function fixQuestion() {
    if (!selectedQuestion) return;
    await fetchJson(`${API}/admin/questions/${selectedQuestion._id || selectedQuestion}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patch: JSON.parse(patchText),
        reason,
        issue_id: selectedQuestion.issue_id,
        feedback_id: selectedQuestion.feedback_id
      })
    });
    setSelectedQuestion(null);
    setPatchText("{}");
    setReason("");
    await Promise.all([loadIssues(), loadFeedback()]);
  }

  useEffect(() => {
    loadIssues();
    loadFeedback();
  }, []);

  return (
    <main className="quality-page">
      <header className="quality-header">
        <div>
          <h1>题库质量监控</h1>
          <p>集中处理自动检测问题、用户反馈和题目修正历史。</p>
        </div>
        <nav>
          <button className={tab === "issues" ? "active" : ""} onClick={() => setTab("issues")}>质量问题</button>
          <button className={tab === "feedback" ? "active" : ""} onClick={() => setTab("feedback")}>用户反馈</button>
        </nav>
      </header>

      {tab === "issues" ? (
        <IssueTable rows={issues} updateStatus={updateIssueStatus} selectQuestion={(row) => {
          setSelectedQuestion({ ...(row.question_id || {}), issue_id: row._id });
          setPatchText("{}");
        }} />
      ) : (
        <FeedbackTable rows={feedback} updateStatus={updateFeedbackStatus} selectQuestion={(row) => {
          setSelectedQuestion({ ...(row.question_id || {}), feedback_id: row._id });
          setPatchText("{}");
        }} />
      )}

      {selectedQuestion && (
        <section className="editor-panel">
          <h2>修正题目 #{selectedQuestion.order_index || selectedQuestion._id}</h2>
          <p>{selectedQuestion.question_text?.raw}</p>
          <textarea value={patchText} onChange={(event) => setPatchText(event.target.value)} />
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="修正原因" />
          <div>
            <button onClick={() => setSelectedQuestion(null)}>取消</button>
            <button className="primary" onClick={fixQuestion}>保存修正并记录历史</button>
          </div>
        </section>
      )}
    </main>
  );
}

function IssueTable({ rows, updateStatus, selectQuestion }) {
  return (
    <section className="quality-card">
      <h2>自动检测问题</h2>
      <table>
        <thead>
          <tr>
            <th>严重级别</th>
            <th>类型</th>
            <th>试卷</th>
            <th>题号</th>
            <th>问题</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row._id}>
              <td>{row.severity}</td>
              <td>{row.issue_type}</td>
              <td>{row.exam_id?.title}</td>
              <td>{row.question_id?.order_index || "-"}</td>
              <td>{row.title}</td>
              <td>
                <button onClick={() => updateStatus(row._id, "confirmed")}>确认</button>
                <button onClick={() => selectQuestion(row)}>修正</button>
                <button onClick={() => updateStatus(row._id, "ignored")}>忽略</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function FeedbackTable({ rows, updateStatus, selectQuestion }) {
  return (
    <section className="quality-card">
      <h2>用户反馈</h2>
      <table>
        <thead>
          <tr>
            <th>分类</th>
            <th>试卷</th>
            <th>题号</th>
            <th>描述</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row._id}>
              <td>{row.category}</td>
              <td>{row.exam_id?.title}</td>
              <td>{row.question_id?.order_index}</td>
              <td>{row.description || "-"}</td>
              <td>
                <button onClick={() => updateStatus(row._id, "confirmed")}>确认</button>
                <button onClick={() => selectQuestion(row)}>修正</button>
                <button onClick={() => updateStatus(row._id, "rejected")}>驳回</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
