import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import SkeletonCard from "./SkeletonCard.jsx";

const categories = [
  { label: "四级", value: "CET4" },
  { label: "六级", value: "CET6" },
  { label: "考研", value: "考研" }
];

const levels = [
  { label: "不认识", value: 0 },
  { label: "模糊", value: 1 },
  { label: "认识", value: 2 },
  { label: "熟练", value: 3 }
];

export default function VocabularyReview({ onChanged }) {
  const [books, setBooks] = useState([]);
  const [words, setWords] = useState([]);
  const [category, setCategory] = useState("CET4");
  const [bookId, setBookId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const availableBooks = useMemo(
    () => books.filter((book) => book.category === category),
    [books, category]
  );

  useEffect(() => {
    api.vocabularyBooks()
      .then((rows) => {
        setBooks(rows);
        const first = rows.find((book) => book.category === category);
        if (first) setBookId(String(first.id));
      })
      .catch((err) => setError(err.message || "加载词库失败"));
  }, []);

  useEffect(() => {
    loadWords();
  }, [category, bookId]);

  async function loadWords(nextKeyword = keyword) {
    setLoading(true);
    setError("");
    try {
      const rows = await api.vocabulary({
        category,
        bookId,
        keyword: nextKeyword,
        limit: 120
      });
      setWords(rows);
      setIndex(0);
      setRevealed(false);
    } catch (err) {
      setError(err.message || "加载单词失败");
    } finally {
      setLoading(false);
    }
  }

  function changeCategory(nextCategory) {
    setCategory(nextCategory);
    const first = books.find((book) => book.category === nextCategory);
    setBookId(first ? String(first.id) : "");
  }

  async function review(value) {
    const word = words[index % words.length];
    if (!word) return;
    await api.reviewWord(word.id, value);
    setWords((current) => current.map((item) => (
      item.id === word.id
        ? { ...item, familiarity: value, reviewCount: (item.reviewCount || 0) + 1 }
        : item
    )));
    setRevealed(false);
    setIndex((nextIndex) => nextIndex + 1);
    onChanged?.();
  }

  const word = words.length ? words[index % words.length] : null;

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <h1>单词本</h1>
          <p>按四级、六级和考研词库复习，结合熟悉度与考频安排下一轮记忆。</p>
        </div>
        <span className="counter">{words.length ? `${index % words.length + 1}/${words.length}` : "0/0"}</span>
      </header>

      <div className="exam-filter-panel vocabulary-filter-panel">
        <div className="level-toggle">
          {categories.map((item) => (
            <button
              key={item.value}
              className={category === item.value ? "level-button active" : "level-button"}
              onClick={() => changeCategory(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <label className="filter-field">
          <span>词库</span>
          <select value={bookId} onChange={(event) => setBookId(event.target.value)}>
            <option value="">全部词库</option>
            {availableBooks.map((book) => (
              <option key={book.id} value={book.id}>
                {book.name}（{book.word_count}）
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field search-field">
          <span>搜索</span>
          <div className="search-box">
            <Search size={16} />
            <input
              value={keyword}
              placeholder="输入英文或中文释义"
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") loadWords(event.currentTarget.value);
              }}
            />
          </div>
        </label>

        <button className="secondary-button" onClick={() => loadWords()}>筛选</button>
      </div>

      {error && <div className="feedback wrong">{error}</div>}
      {loading && <SkeletonCard />}
      {!loading && !word && (
        <div className="empty-state">
          <div className="empty-icon">📚</div>
          <h3>暂无单词</h3>
          <p>请先导入词库，或调整当前筛选条件。</p>
        </div>
      )}

      {!loading && word && (
        <>
          <article className="word-card">
            <div className="word-card-meta">
              <span>{word.category}</span>
              <span>难度 {word.difficulty}/5</span>
              <span>考频 {word.frequency}</span>
              <span>已复习 {word.reviewCount || 0}</span>
            </div>
            <h2 className="word-text">{word.word}</h2>
            <p className="word-phonetic">{word.phonetic || "暂无音标"}</p>
            {revealed ? (
              <div className="word-detail">
                <p className="word-meaning"><strong>释义：</strong>{word.meaning}</p>
                <p><strong>例句：</strong>{word.example || "暂无例句"}</p>
              </div>
            ) : (
              <button className="primary-button" onClick={() => setRevealed(true)}>显示释义</button>
            )}
          </article>

          <div className="review-row">
            {levels.map((level) => (
              <button key={level.value} className="secondary-button" onClick={() => review(level.value)}>
                {level.label}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
