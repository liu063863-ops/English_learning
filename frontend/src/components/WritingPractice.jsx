import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import SkeletonCard from "./SkeletonCard.jsx";

const levels = [
  { label: "全部", value: "" },
  { label: "CET4", value: "CET4" },
  { label: "CET6", value: "CET6" }
];

export default function WritingPractice({ onChanged }) {
  const [filters, setFilters] = useState({ level: "", year: "" });
  const [translations, setTranslations] = useState([]);
  const [writings, setWritings] = useState([]);
  const [activeTranslation, setActiveTranslation] = useState(0);
  const [activeWriting, setActiveWriting] = useState(0);
  const [translationDraft, setTranslationDraft] = useState("");
  const [writingDraft, setWritingDraft] = useState("");
  const [translationResult, setTranslationResult] = useState(null);
  const [savedWriting, setSavedWriting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, [filters.level, filters.year]);

  const translation = translations[activeTranslation] || null;
  const writing = writings[activeWriting] || null;
  const translationWordCount = useMemo(() => countWords(translationDraft), [translationDraft]);
  const writingWordCount = useMemo(() => countWords(writingDraft), [writingDraft]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [translationRows, writingRows] = await Promise.all([
        api.translations({ ...filters, limit: 100 }),
        api.writings({ ...filters, limit: 100 })
      ]);
      setTranslations(Array.isArray(translationRows) ? translationRows : []);
      setWritings(Array.isArray(writingRows) ? writingRows : []);
      resetDrafts();
    } catch (err) {
      setError(err.message || "翻译写作数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  function resetDrafts() {
    setActiveTranslation(0);
    setActiveWriting(0);
    setTranslationDraft("");
    setWritingDraft("");
    setTranslationResult(null);
    setSavedWriting(null);
  }

  async function submitTranslation() {
    if (!translation || !translationDraft.trim()) return;
    const payload = await api.submitTranslation(translation.id, translationDraft);
    setTranslationResult({
      ...payload,
      reference: readableText(translation.reference, "当前题库暂未提供参考译文。"),
      explanation: readableText(translation.explanation, "请对照参考译文检查信息完整度、语法准确度和表达自然度。")
    });
    onChanged?.();
  }

  async function submitWriting() {
    if (!writing || !writingDraft.trim()) return;
    const payload = await api.submitWriting(writing.id, writingDraft);
    setSavedWriting(payload);
    onChanged?.();
  }

  function nextTranslation() {
    if (!translations.length) return;
    setActiveTranslation((index) => (index + 1) % translations.length);
    setTranslationDraft("");
    setTranslationResult(null);
  }

  function nextWriting() {
    if (!writings.length) return;
    setActiveWriting((index) => (index + 1) % writings.length);
    setWritingDraft("");
    setSavedWriting(null);
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <h1>翻译写作</h1>
          <p>复用真题题库中的翻译和写作任务，支持草稿、提交反馈和参考答案复盘。</p>
        </div>
        <span className="counter">{translations.length} 翻译 / {writings.length} 写作</span>
      </header>

      <div className="exam-filter-panel writing-filter-panel">
        <div className="level-toggle" aria-label="考试级别筛选">
          {levels.map((item) => (
            <button
              key={item.label}
              className={filters.level === item.value ? "level-button active" : "level-button"}
              onClick={() => setFilters((current) => ({ ...current, level: item.value }))}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="filter-field">
          <span>年份</span>
          <select value={filters.year} onChange={(event) => setFilters((current) => ({ ...current, year: event.target.value }))}>
            <option value="">全部年份</option>
            {Array.from({ length: 11 }, (_, index) => 2025 - index).map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </label>
        <button className="secondary-button" onClick={loadData} type="button">刷新</button>
      </div>

      {error && <div className="feedback wrong">{error}</div>}
      {loading && (
        <div className="skeleton-grid">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}
      {!loading && (!translation || !writing) && (
        <div className="empty-state">暂无翻译写作数据，请先确认真题题库已初始化。</div>
      )}

      {!loading && translation && writing && (
        <div className="two-column">
          <PracticePanel
            meta={formatMeta(translation)}
            title="翻译练习"
            actionLabel="提交翻译"
            secondaryLabel="换一题"
            prompt={readableText(translation.sourceText, "请将下面中文段落翻译成英文。")}
            hint={readableText(translation.hint, "建议先保证核心信息完整，再优化句式和连接表达。")}
            draft={translationDraft}
            setDraft={(value) => {
              setTranslationDraft(value);
              setTranslationResult(null);
            }}
            placeholder="输入你的英文译文"
            wordCount={translationWordCount}
            onNext={nextTranslation}
            onSubmit={submitTranslation}
            result={translationResult && (
              <div className="feedback correct">
                <strong>参考译文</strong>
                <p>{translationResult.reference}</p>
                <p>{translationResult.explanation}</p>
              </div>
            )}
          />

          <PracticePanel
            meta={formatMeta(writing)}
            title="写作练习"
            actionLabel="保存草稿"
            secondaryLabel="换一题"
            prompt={readableText(writing.prompt, "Directions: Write an essay based on the given topic.")}
            hint={readableText(writing.tips, "建议使用清晰结构：观点、理由、例子、总结。")}
            draft={writingDraft}
            setDraft={(value) => {
              setWritingDraft(value);
              setSavedWriting(null);
            }}
            placeholder="输入 120-200 词作文草稿"
            wordCount={writingWordCount}
            onNext={nextWriting}
            onSubmit={submitWriting}
            result={savedWriting && (
              <div className="feedback correct">
                <strong>草稿已保存</strong>
                <p>当前字数：{savedWriting.wordCount ?? writingWordCount}。后续可接入人工评分或 AI 评分。</p>
                <p><strong>参考范文：</strong>{readableText(writing.reference, "当前题库暂未提供参考范文。")}</p>
              </div>
            )}
          />
        </div>
      )}
    </section>
  );
}

function PracticePanel({
  meta,
  title,
  actionLabel,
  secondaryLabel,
  prompt,
  hint,
  draft,
  setDraft,
  placeholder,
  wordCount,
  onNext,
  onSubmit,
  result
}) {
  return (
    <article className="panel writing-practice-panel">
      <div className="list-card-head">
        <div>
          <span>{meta}</span>
          <h2>{title}</h2>
        </div>
        <button className="ghost-button" onClick={onNext} type="button">{secondaryLabel}</button>
      </div>
      <p className="prompt-block">{prompt}</p>
      <p className="hint">{hint}</p>
      <textarea
        className="essay-box"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
      />
      <div className="action-row">
        <button className="primary-button" disabled={!draft.trim()} onClick={onSubmit} type="button">{actionLabel}</button>
        <span className="word-count">{wordCount} words</span>
      </div>
      {result}
    </article>
  );
}

function formatMeta(item) {
  return `${item.level || "CET"} · ${item.year || ""} 年 ${item.month || ""} 月 · 第 ${item.setNum || 1} 套`;
}

function readableText(value, fallback) {
  const text = String(value || "").trim();
  if (!text || text.includes("�") || /pdf parsing is pending|placeholder|minimal import/i.test(text)) return fallback;
  return text;
}

function countWords(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  const englishWords = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
  return englishWords.length + chineseChars.length;
}
