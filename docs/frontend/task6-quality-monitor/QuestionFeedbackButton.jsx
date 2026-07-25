import { useState } from "react";

const API = "/api/quality";

export default function QuestionFeedbackButton({ examId, sectionId, questionId }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("wrong_answer");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");

  async function submitFeedback() {
    await fetch(`${API}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exam_id: examId,
        section_id: sectionId,
        question_id: questionId,
        category,
        description
      })
    });
    setMessage("反馈已提交");
    setDescription("");
    window.setTimeout(() => setOpen(false), 800);
  }

  return (
    <div className="feedback-widget">
      <button type="button" className="ghost" onClick={() => setOpen(true)}>题目有误</button>
      {open && (
        <div className="feedback-popover">
          <strong>反馈题目问题</strong>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="wrong_answer">答案不对</option>
            <option value="unclear_audio">音频不清晰</option>
            <option value="bad_explanation">解析有误</option>
            <option value="typo">题干/选项错别字</option>
            <option value="other">其他问题</option>
          </select>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="请描述你发现的问题"
          />
          <div className="feedback-actions">
            <button type="button" onClick={() => setOpen(false)}>取消</button>
            <button type="button" className="primary" onClick={submitFeedback}>提交</button>
          </div>
          {message && <small>{message}</small>}
        </div>
      )}
    </div>
  );
}
