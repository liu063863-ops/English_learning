const baseUrl = "/api";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Request failed");
  }
  return response.json();
}

export const api = {
  examList: (params = {}) => request(`/exams${toQuery(params)}`),
  examDetail: (id, params = {}) => request(`/exams/${id}${toQuery(params)}`),
  startExam: (id) => request(`/exams/${id}/start`, { method: "POST" }),
  examProgress: (id) => request(`/exams/${id}/progress`),
  stats: () => request("/stats"),
  questions: () => request("/questions"),
  submitQuestion: (id, selectedAnswer) =>
    request(`/questions/${id}/attempt`, { method: "POST", body: JSON.stringify({ selectedAnswer }) }),
  errors: () => request("/errors"),
  updateError: (id, mastered) => request(`/errors/${id}`, { method: "PATCH", body: JSON.stringify({ mastered }) }),
  vocabulary: (params = {}) => request(`/vocabulary${toQuery(params)}`),
  vocabularyBooks: () => request("/vocabulary/books"),
  vocabularyStats: () => request("/vocabulary/stats"),
  reviewWord: (id, familiarity) =>
    request(`/vocabulary/${id}/review`, { method: "PATCH", body: JSON.stringify({ familiarity }) }),
  readings: (params = {}) => request(`/reading-practice${toQuery(params)}`),
  readingPractice: (id) => request(`/reading-practice/${id}`),
  submitReading: (id, answers) =>
    request(`/reading-practice/${id}/submit`, { method: "POST", body: JSON.stringify({ answers }) }),
  translations: (params = {}) => request(`/translations${toQuery(params)}`),
  submitTranslation: (id, draft) =>
    request(`/translations/${id}/attempt`, { method: "POST", body: JSON.stringify({ draft }) }),
  writings: (params = {}) => request(`/writings${toQuery(params)}`),
  submitWriting: (id, draft) => request(`/writings/${id}/drafts`, { method: "POST", body: JSON.stringify({ draft }) }),
  recentDrafts: () => request("/writings/drafts/recent")
};

function toQuery(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}
