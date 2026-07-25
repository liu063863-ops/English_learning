import { useEffect, useMemo, useState } from "react";
import "./admin-question-bank.css";

const API = "/api/admin";

export default function AdminQuestionBankPage() {
  const [filters, setFilters] = useState({ year: "", level: "", source: "", keyword: "" });
  const [exams, setExams] = useState([]);
  const [preview, setPreview] = useState(null);
  const [importReport, setImportReport] = useState(null);
  const [selectedExam, setSelectedExam] = useState(null);

  async function loadExams() {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
    const res = await fetch(`${API}/questions?${query}`).then((r) => r.json());
    setExams(res.data || []);
  }

  useEffect(() => {
    loadExams();
  }, []);

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <h1>题库管理后台</h1>
          <p>上传真题 JSON，预览校验结果，确认导入后在题库列表管理试卷。</p>
        </div>
        <button className="primary" onClick={loadExams}>刷新列表</button>
      </header>

      <section className="admin-grid">
        <QuestionBankList filters={filters} setFilters={setFilters} exams={exams} onSearch={loadExams} onPreview={setSelectedExam} />
        <ImportPanel onPreview={setPreview} onImported={setImportReport} reload={loadExams} />
      </section>

      {preview && <ImportPreview preview={preview} />}
      {importReport && <ImportReport report={importReport} />}
      {selectedExam && <ExamPreview exam={selectedExam} />}
    </main>
  );
}

function QuestionBankList({ filters, setFilters, exams, onSearch, onPreview }) {
  return (
    <section className="panel">
      <h2>题库列表</h2>
      <div className="toolbar">
        <input placeholder="年份" value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })} />
        <select value={filters.level} onChange={(e) => setFilters({ ...filters, level: e.target.value })}>
          <option value="">全部级别</option>
          <option value="CET4">CET4</option>
          <option value="CET6">CET6</option>
        </select>
        <select value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>
          <option value="">全部来源</option>
          <option value="past_exam">真题</option>
          <option value="mock">模拟</option>
          <option value="custom">自建</option>
        </select>
        <input placeholder="搜索标题" value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} />
        <button onClick={onSearch}>搜索</button>
      </div>
      <div className="table">
        {exams.map((exam) => (
          <div className="table-row" key={exam._id}>
            <strong>{exam.title}</strong>
            <span>{exam.level}</span>
            <span>{exam.year || "-"} / {exam.month || "-"}</span>
            <span>第 {exam.set_num || "-"} 套</span>
            <span>{exam.source}</span>
            <button onClick={() => onPreview(exam)}>预览</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function ImportPanel({ onPreview, onImported, reload }) {
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState("skip");
  const [dragging, setDragging] = useState(false);

  async function requestImport(path) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API}${path}`, { method: "POST", body: form }).then((r) => r.json());
    return res;
  }

  async function preview() {
    if (!file) return alert("请先选择 JSON 文件");
    onPreview(await requestImport("/questions/bulk-import/preview"));
  }

  async function confirmImport() {
    if (!file) return alert("请先选择 JSON 文件");
    const report = await requestImport(`/questions/bulk-import?mode=${mode}`);
    onImported(report);
    await reload();
  }

  return (
    <section className="panel">
      <h2>批量导入</h2>
      <div
        className={dragging ? "drop-zone dragging" : "drop-zone"}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          setFile(e.dataTransfer.files[0]);
        }}
      >
        <p>{file ? file.name : "拖拽任务3生成的 .mongo-import.json 到这里"}</p>
        <input type="file" accept=".json" onChange={(e) => setFile(e.target.files[0])} />
      </div>
      <div className="toolbar">
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="skip">重复则跳过</option>
          <option value="update">重复则更新</option>
        </select>
        <button onClick={preview}>预览导入</button>
        <button className="primary" onClick={confirmImport}>确认导入</button>
      </div>
    </section>
  );
}

function ImportPreview({ preview }) {
  const data = preview.data || {};
  return (
    <section className="panel">
      <h2>导入预览</h2>
      <pre>{JSON.stringify(data.summary, null, 2)}</pre>
      {(data.validationErrors || []).map((error, index) => (
        <p className="error-line" key={index}>{error.path || error.level}: {error.message}</p>
      ))}
      {data.duplicate && <p className="warn-line">检测到重复试卷：{data.duplicate.title}</p>}
    </section>
  );
}

function ImportReport({ report }) {
  return (
    <section className="panel">
      <h2>导入报告</h2>
      <pre>{JSON.stringify(report.data || report.error || report, null, 2)}</pre>
    </section>
  );
}

function ExamPreview({ exam }) {
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    fetch(`${API}/exams/${exam._id}/preview`).then((r) => r.json()).then((json) => setDetail(json.data));
  }, [exam._id]);

  if (!detail) return <section className="panel">加载试卷预览...</section>;

  return (
    <section className="panel">
      <h2>试卷预览：{detail.exam.title}</h2>
      {detail.sections.map((section) => {
        const questions = detail.questions.filter((q) => q.section_id === section._id);
        return (
          <article className="preview-section" key={section._id}>
            <h3>{section.section_name}</h3>
            {questions.map((question) => (
              <div className="question-card" key={question._id}>
                <strong>{question.order_index}. {question.question_text.raw}</strong>
                <button onClick={() => setEditing(question)}>编辑</button>
              </div>
            ))}
          </article>
        );
      })}
      {editing && <QuestionEditor question={editing} onClose={() => setEditing(null)} />}
      {detail.audioFiles.map((audio) => (
        <AudioTimeline key={audio._id} audio={audio} questions={detail.questions.filter((q) => q.audio_file_id === audio._id)} />
      ))}
    </section>
  );
}

function QuestionEditor({ question, onClose }) {
  const [draft, setDraft] = useState(question);
  async function save() {
    await fetch(`${API}/questions/${question._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft)
    });
    onClose();
  }
  return (
    <div className="modal">
      <section className="modal-body">
        <h2>编辑题目</h2>
        <textarea value={draft.question_text.raw} onChange={(e) => setDraft({ ...draft, question_text: { ...draft.question_text, raw: e.target.value } })} />
        <textarea value={draft.explanation?.raw || ""} onChange={(e) => setDraft({ ...draft, explanation: { ...draft.explanation, raw: e.target.value } })} />
        <div className="toolbar"><button onClick={onClose}>取消</button><button className="primary" onClick={save}>保存</button></div>
      </section>
    </div>
  );
}

function AudioTimeline({ audio, questions }) {
  const [selected, setSelected] = useState(questions[0]?._id || "");
  const active = questions.find((q) => q._id === selected);
  const [range, setRange] = useState({ start: active?.audio_start_time || 0, end: active?.audio_end_time || 0 });
  const duration = audio.duration || 1800;
  const markers = useMemo(() => questions.map((q) => ({ ...q, left: `${((q.audio_start_time || 0) / duration) * 100}%` })), [questions, duration]);

  async function saveRange() {
    if (!active) return;
    await fetch(`${API}/questions/${active._id}/timeline`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio_start_time: Number(range.start), audio_end_time: Number(range.end), transcript: active.transcript || "" })
    });
    alert("时间轴已保存");
  }

  return (
    <section className="audio-panel">
      <h3>音频时间轴</h3>
      <audio controls src={audio.file_url} />
      <div className="timeline">
        {markers.map((marker) => <span key={marker._id} style={{ left: marker.left }} title={marker.question_text.raw} />)}
      </div>
      <div className="toolbar">
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {questions.map((q) => <option value={q._id} key={q._id}>Q{q.order_index}</option>)}
        </select>
        <input type="number" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} placeholder="开始秒" />
        <input type="number" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} placeholder="结束秒" />
        <button onClick={saveRange}>保存片段</button>
      </div>
    </section>
  );
}
