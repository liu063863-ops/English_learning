import { BookOpenCheck, CheckCircle2, Flame, PenLine, Target, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import SkeletonCard from "./SkeletonCard.jsx";

const fallbackStats = {
  attempts: 0,
  accuracy: 0,
  activeErrors: 0,
  knownWords: 0,
  totalWords: 0,
  translationDrafts: 0,
  writingDrafts: 0
};

export default function Dashboard({ refreshKey }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.stats().then(setStats);
  }, [refreshKey]);

  const safeStats = useMemo(() => normalizeStats(stats), [stats]);

  if (!stats) {
    return (
      <section className="page-section dashboard-page">
        <div className="skeleton-grid">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </section>
    );
  }

  const wordPercent = safeStats.totalWords
    ? Math.min(100, Math.max(0, Math.round((safeStats.knownWords / safeStats.totalWords) * 100)))
    : Number.NaN;
  const progress = Number.isNaN(wordPercent) ? 0 : wordPercent;
  const hasExpressionDrafts = safeStats.translationDrafts > 0 || safeStats.writingDrafts > 0;

  function goToExams() {
    window.history.pushState({}, "", "/exams");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  return (
    <section className="page-section dashboard-page">
      <div className="welcome-banner">
        <div>
          <h1>欢迎回来 👋</h1>
          <p>今天是你坚持学习的第 <span className="highlight">3</span> 天</p>
        </div>
        <div className="welcome-badge">
          <Flame size={18} />
          <span>学习闭环进行中</span>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard icon="📚" label="练习次数" value={safeStats.attempts} color="blue" />
        <StatCard icon="🎯" label="客观题正确率" value={`${safeStats.accuracy}%`} color="green" />
        <StatCard icon="❌" label="待攻克错题" value={safeStats.activeErrors} color="red" />
        <StatCard icon="📖" label="已掌握单词" value={`${safeStats.knownWords}/${safeStats.totalWords || 0}`} color="yellow" />
      </div>

      <div className="dashboard-bento">
        <article className="dashboard-card progress-card">
          <div className="dashboard-card-head">
            <span>复习进度</span>
            <TrendingUp size={20} />
          </div>
          <div className={Number.isNaN(wordPercent) ? "progress-ring-container empty" : "progress-ring-container"}>
            <svg className="progress-ring" viewBox="0 0 120 120" aria-hidden="true">
              <circle className="progress-bg" cx="60" cy="60" r="54" />
              <circle
                className="progress-fill"
                cx="60"
                cy="60"
                r="54"
                style={{ strokeDashoffset: 339.292 - (339.292 * progress) / 100 }}
              />
            </svg>
            <div className="progress-text">
              <span className="progress-number">{Number.isNaN(wordPercent) ? "--" : progress}</span>
              {!Number.isNaN(wordPercent) && <span className="progress-percent">%</span>}
            </div>
          </div>
          <p>已掌握 {safeStats.knownWords} / {safeStats.totalWords} 个单词</p>
        </article>

        <article className="dashboard-card expression-card">
          <div className="dashboard-card-head">
            <span>表达训练</span>
            <PenLine size={20} />
          </div>
          {hasExpressionDrafts ? (
            <>
              <strong>{safeStats.translationDrafts + safeStats.writingDrafts}</strong>
              <p>翻译提交 {safeStats.translationDrafts} 次，写作草稿 {safeStats.writingDrafts} 篇。</p>
            </>
          ) : (
            <div className="empty-state expression-empty-state">
              <div className="empty-icon">✍️</div>
              <h3>还没有表达训练记录</h3>
              <p>完成一套真题的翻译或写作，数据将在这里汇总</p>
              <button className="btn-primary" type="button" onClick={goToExams}>
                去做一套真题
              </button>
            </div>
          )}
        </article>

        <article className="dashboard-card plan-card">
          <div className="dashboard-card-head">
            <span>今日建议</span>
            <Target size={20} />
          </div>
          <ul className="plan-list">
            <li>背诵 10 个高频词</li>
            <li>完成 1 篇阅读训练</li>
            <li>复盘错题并标记掌握</li>
          </ul>
        </article>
      </div>
    </section>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${color}`}>{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </article>
  );
}

function normalizeStats(stats) {
  const source = { ...fallbackStats, ...(stats || {}) };
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, Number.isFinite(Number(value)) ? Number(value) : 0])
  );
}
