import { CalendarDays, Clock, FileText, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import SkeletonCard from "./SkeletonCard.jsx";

const years = Array.from({ length: 11 }, (_, index) => 2025 - index);
const levels = [
  { label: "全部", value: "" },
  { label: "CET4", value: "CET4" },
  { label: "CET6", value: "CET6" }
];

export default function ExamListPage() {
  const [filters, setFilters] = useState({ level: "", year: "", month: "", keyword: "", page: 1, pageSize: 20 });
  const [payload, setPayload] = useState({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const query = useMemo(() => ({ ...filters, keyword: filters.keyword.trim() }), [filters]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    api.examList(query)
      .then((result) => {
        if (alive) setPayload(normalizeListResult(result));
      })
      .catch((err) => {
        if (alive) setError(err.message || "加载试卷失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [query]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  }

  function clearFilters() {
    setFilters({ level: "", year: "", month: "", keyword: "", page: 1, pageSize: 20 });
  }

  function openExam(examId) {
    window.history.pushState({}, "", `/exams/${examId}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  const exams = payload.data;
  const pagination = payload.pagination;

  return (
    <section className="page-section exams-page">
      <header className="page-header exams-header">
        <div>
          <h1>真题考试</h1>
          <p>按年份、级别和月份筛选已导入的四六级真题试卷。</p>
        </div>
        <span className="counter">{pagination.total || exams.length} 套试卷</span>
      </header>

      <div className="filter-bar" aria-label="试卷筛选">
        {levels.map((item) => (
          <button
            key={item.label}
            className={filters.level === item.value ? "filter-btn active" : "filter-btn"}
            onClick={() => updateFilter("level", item.value)}
            type="button"
          >
            {item.label}
          </button>
        ))}

        <select className="filter-select" value={filters.year} onChange={(event) => updateFilter("year", event.target.value)}>
          <option value="">全部年份</option>
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>

        <select className="filter-select" value={filters.month} onChange={(event) => updateFilter("month", event.target.value)}>
          <option value="">全部月份</option>
          <option value="6">6月</option>
          <option value="12">12月</option>
          <option value="3">3月</option>
          <option value="7">7月</option>
          <option value="9">9月</option>
        </select>

        <label className="search-control">
          <Search size={16} />
          <input
            className="search-input"
            value={filters.keyword}
            onChange={(event) => updateFilter("keyword", event.target.value)}
            placeholder="搜索 2023 CET4"
          />
        </label>
      </div>

      {error && <div className="feedback wrong">{error}</div>}
      {loading && (
        <div className="skeleton-grid">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}
      {!loading && !error && exams.length === 0 && (
        <div className="empty-state exam-empty-state">
          <div className="empty-icon">📭</div>
          <h3>没有找到符合条件的试卷</h3>
          <p>尝试调整筛选条件或搜索关键词</p>
          <button className="btn-secondary" type="button" onClick={clearFilters}>
            清除筛选
          </button>
        </div>
      )}

      {!loading && exams.length > 0 && (
        <div className="exam-grid">
          {exams.map((exam) => (
            <button key={exam.id} className="exam-card" onClick={() => openExam(exam.id)}>
              <div className="exam-card-top">
                <span className={`exam-badge ${exam.level?.toLowerCase()}`}>{exam.level}</span>
                <span className="exam-set">第 {exam.setNum || exam.set_num} 套</span>
              </div>
              <h2 className="exam-title">{exam.title}</h2>
              <div className="exam-meta">
                <span><CalendarDays size={16} />{exam.year} 年 {exam.month} 月</span>
                <span><FileText size={16} />{exam.totalQuestions ?? exam.questionCount ?? 0} 题</span>
                <span><Clock size={16} />{exam.estimatedTime ?? exam.estimatedMinutes ?? 0} 分钟</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="pagination-row">
          <button className="secondary-button" disabled={filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}>上一页</button>
          <span>第 {pagination.page} / {pagination.totalPages} 页</span>
          <button className="secondary-button" disabled={filters.page >= pagination.totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>下一页</button>
        </div>
      )}
    </section>
  );
}

function normalizeListResult(result) {
  if (Array.isArray(result)) return { data: result, pagination: { page: 1, pageSize: result.length, total: result.length, totalPages: 1 } };
  return {
    data: result?.data || [],
    pagination: result?.pagination || { page: 1, pageSize: 20, total: result?.data?.length || 0, totalPages: 1 }
  };
}
