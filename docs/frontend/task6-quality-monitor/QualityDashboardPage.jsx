import { useEffect, useMemo, useState } from "react";
import "./quality-dashboard.css";

const API = "/api/quality";

export default function QualityDashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    const [dash, history] = await Promise.all([
      fetchJson(`${API}/admin/dashboard`),
      fetchJson(`${API}/admin/integrity/runs?limit=10`)
    ]);
    setDashboard(dash.data);
    setRuns(history.data || []);
  }

  async function runCheck() {
    setLoading(true);
    try {
      await fetchJson(`${API}/admin/integrity/run`, { method: "POST" });
      await load();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const sectionRows = useMemo(() => Object.entries(dashboard?.sectionCoverage || {}), [dashboard]);
  if (!dashboard) return <main className="quality-dashboard"><p>正在加载题库质量看板...</p></main>;

  return (
    <main className="quality-dashboard">
      <header className="dashboard-header">
        <div>
          <h1>题库完整性看板</h1>
          <p>监控导入覆盖率、缺失试卷、题型覆盖和开放异常。</p>
        </div>
        <button className="primary" disabled={loading} onClick={runCheck}>
          {loading ? "检查中..." : "立即对账"}
        </button>
      </header>

      <section className="metric-grid">
        <Metric label="应导入试卷" value={dashboard.totals.expectedPapers} />
        <Metric label="已导入试卷" value={dashboard.totals.importedPapers} />
        <Metric label="缺失试卷" value={dashboard.totals.missingPapers} danger={dashboard.totals.missingPapers > 0} />
        <Metric label="总题量" value={dashboard.totals.totalQuestions} />
        <Metric label="开放异常" value={dashboard.totals.openIssues} danger={dashboard.totals.openIssues > 0} />
      </section>

      <section className="dashboard-card">
        <h2>各年份完整度热力图</h2>
        <div className="heatmap">
          {dashboard.heatmap.map((cell) => (
            <div className={`heat-cell ${heatClass(cell.completeness)}`} key={`${cell.year}-${cell.month}-${cell.level}`}>
              <strong>{cell.year}.{String(cell.month).padStart(2, "0")}</strong>
              <span>{cell.level}</span>
              <b>{cell.completeness}%</b>
              <small>{cell.imported}/{cell.expected} 套</small>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-card">
        <h2>题型覆盖率</h2>
        <table>
          <thead>
            <tr>
              <th>题型</th>
              <th>覆盖试卷数</th>
              <th>题量</th>
              <th>缺失试卷数</th>
            </tr>
          </thead>
          <tbody>
            {sectionRows.map(([type, row]) => (
              <tr className={row.missingExams ? "danger-row" : ""} key={type}>
                <td>{labelSection(type)}</td>
                <td>{row.examsWithSection}</td>
                <td>{row.questionCount}</td>
                <td>{row.missingExams}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="dashboard-card">
        <h2>异常分布</h2>
        <div className="breakdown">
          {Object.entries(dashboard.issueBreakdown.bySeverity || {}).map(([key, value]) => (
            <span key={key}>{key}: {value}</span>
          ))}
          {Object.entries(dashboard.issueBreakdown.byType || {}).map(([key, value]) => (
            <span key={key}>{key}: {value}</span>
          ))}
        </div>
      </section>

      <section className="dashboard-card">
        <h2>最近监控任务</h2>
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>触发方式</th>
              <th>状态</th>
              <th>告警</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run._id}>
                <td>{new Date(run.started_at).toLocaleString()}</td>
                <td>{run.trigger}</td>
                <td>{run.status}</td>
                <td>{run.alert_sent ? "已发送" : "无"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Metric({ label, value, danger = false }) {
  return (
    <article className={`metric-card ${danger ? "danger" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok || payload.success === false) throw new Error(payload.error?.message || "请求失败");
  return payload;
}

function heatClass(value) {
  if (value >= 95) return "good";
  if (value >= 70) return "warn";
  return "bad";
}

function labelSection(type) {
  return { listening: "听力", reading: "阅读", translation: "翻译", writing: "写作" }[type] || type;
}
