export function validateImportPayload(payload) {
  const errors = [];
  for (const key of ["exams", "sections", "questions"]) {
    if (!Array.isArray(payload[key])) errors.push({ level: "fatal", message: `${key} must be an array` });
  }
  if (errors.some((item) => item.level === "fatal")) return errors;

  const sectionIds = new Set(payload.sections.map((item) => String(item._id?.$oid || item._id)));
  const audioIds = new Set((payload.audio_files || []).map((item) => String(item._id?.$oid || item._id)));
  const passageIds = new Set((payload.passages || []).map((item) => String(item._id?.$oid || item._id)));

  payload.questions.forEach((question, index) => {
    const path = `questions[${index}]`;
    if (!question.question_text?.raw?.trim()) errors.push({ path, message: "题干不能为空" });
    if (!question.section_id) errors.push({ path, message: "section_id 不能为空" });
    if (question.section_id && !sectionIds.has(String(question.section_id.$oid || question.section_id))) {
      errors.push({ path, message: "section_id 未在 sections 中找到" });
    }
    if (question.audio_file_id && !audioIds.has(String(question.audio_file_id.$oid || question.audio_file_id))) {
      errors.push({ path, message: "audio_file_id 未在 audio_files 中找到" });
    }
    if (question.passage_id && !passageIds.has(String(question.passage_id.$oid || question.passage_id))) {
      errors.push({ path, message: "passage_id 未在 passages 中找到" });
    }
    if (["single_choice", "multiple_choice"].includes(question.question_type)) {
      validateOptions(question, path, errors);
    }
    if (question.question_type !== "subjective" && isEmptyAnswer(question.correct_answer)) {
      errors.push({ path, message: "客观题 correct_answer 不能为空" });
    }
  });

  return errors;
}

function validateOptions(question, path, errors) {
  const options = question.options || [];
  if (options.length < 2) errors.push({ path, message: "选择题至少需要 2 个选项" });
  const keys = new Set();
  options.forEach((option, optionIndex) => {
    if (!option.key || !option.text) errors.push({ path: `${path}.options[${optionIndex}]`, message: "选项 key/text 必填" });
    if (keys.has(option.key)) errors.push({ path: `${path}.options[${optionIndex}]`, message: `选项 ${option.key} 重复` });
    keys.add(option.key);
  });
  const correctCount = options.filter((option) => option.is_correct).length;
  if (question.question_type === "single_choice" && correctCount !== 1) {
    errors.push({ path, message: "单选题必须有且仅有 1 个正确选项" });
  }
  if (question.question_type === "multiple_choice" && correctCount < 1) {
    errors.push({ path, message: "多选题至少需要 1 个正确选项" });
  }
}

function isEmptyAnswer(value) {
  if (Array.isArray(value)) return value.length === 0;
  return value === undefined || value === null || String(value).trim() === "";
}
