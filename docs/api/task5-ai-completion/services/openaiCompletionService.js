import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const OPENAI_API_BASE = process.env.OPENAI_API_BASE || "https://api.openai.com/v1";
const TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1";
const EXPLANATION_MODEL = process.env.OPENAI_EXPLANATION_MODEL || "gpt-4.1-mini";

export async function transcribeAudioToSegments(audioFileUrlOrPath) {
  assertApiKey();
  const audioFile = await loadAudioFile(audioFileUrlOrPath);
  const form = new FormData();
  form.append("file", audioFile.blob, audioFile.fileName);
  form.append("model", TRANSCRIPTION_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");

  const response = await fetch(`${OPENAI_API_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form
  });
  const payload = await parseOpenAiResponse(response);

  return {
    model: TRANSCRIPTION_MODEL,
    text: payload.text || "",
    segments: (payload.segments || []).map((segment) => ({
      start: Number(segment.start ?? 0),
      end: Number(segment.end ?? 0),
      text: String(segment.text || "").trim()
    })),
    raw_response: payload
  };
}

export async function generateExplanationCandidate({ question, transcript = "" }) {
  assertApiKey();
  const prompt = buildExplanationPrompt({ question, transcript });
  const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: EXPLANATION_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "你是严谨的大学英语四六级命题解析专家。只基于给定材料生成解析，不编造原文不存在的信息。"
        },
        { role: "user", content: prompt }
      ]
    })
  });
  const payload = await parseOpenAiResponse(response);
  const content = payload.choices?.[0]?.message?.content || "{}";
  const parsed = safeJson(content);

  return {
    model: EXPLANATION_MODEL,
    prompt,
    text: parsed.markdown || formatExplanation(parsed),
    evidence_sentence: parsed.evidence_sentence || "",
    why_correct: parsed.why_correct || "",
    option_analysis: parsed.option_analysis || {},
    raw_response: payload
  };
}

export function buildExplanationPrompt({ question, transcript = "" }) {
  const options = (question.options || [])
    .map((option) => `${option.key}. ${option.text}`)
    .join("\n");
  const correctAnswer = Array.isArray(question.correct_answer)
    ? question.correct_answer.join(", ")
    : String(question.correct_answer ?? "");

  return `你是四六级英语专家。请为以下听力/阅读题生成解析。

要求：
1. 只根据给定原文、题目、选项和正确答案分析。
2. 如果原文不足以支持答案，请在 evidence_sentence 中写“材料不足，需要人工审核”。
3. 输出必须是 JSON，不要输出 Markdown 代码块。
4. JSON 字段：
{
  "evidence_sentence": "答案定位句",
  "why_correct": "为什么选这个答案",
  "option_analysis": { "A": "...", "B": "...", "C": "...", "D": "..." },
  "markdown": "可直接展示给学生的中文解析"
}

原文：
${transcript || "无"}

题目：
${question.question_text?.raw || ""}

选项：
${options || "无"}

正确答案：
${correctAnswer}`;
}

export function sliceSegmentsByRange(segments, startTime, endTime) {
  if (startTime === null || startTime === undefined || endTime === null || endTime === undefined) {
    return "";
  }
  return segments
    .filter((segment) => Number(segment.end) >= Number(startTime) && Number(segment.start) <= Number(endTime))
    .map((segment) => segment.text)
    .join(" ")
    .trim();
}

async function loadAudioFile(audioFileUrlOrPath) {
  if (/^https?:\/\//i.test(audioFileUrlOrPath)) {
    const response = await fetch(audioFileUrlOrPath);
    if (!response.ok) throw new Error(`音频下载失败：${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const fileName = path.basename(new URL(audioFileUrlOrPath).pathname) || "audio.mp3";
    return { fileName, blob: new Blob([arrayBuffer], { type: response.headers.get("content-type") || "audio/mpeg" }) };
  }

  const resolved = path.resolve(audioFileUrlOrPath);
  const buffer = await fs.readFile(resolved);
  return {
    fileName: path.basename(resolved),
    blob: new Blob([buffer], { type: guessAudioMime(resolved) })
  };
}

function guessAudioMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".wav") return "audio/wav";
  if (ext === ".m4a") return "audio/mp4";
  return "audio/mpeg";
}

async function parseOpenAiResponse(response) {
  const payload = await response.json().catch(async () => ({ error: { message: await response.text() } }));
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI API 请求失败：${response.status}`);
  }
  return payload;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { markdown: text, evidence_sentence: "", why_correct: "", option_analysis: {} };
  }
}

function formatExplanation(parsed) {
  return [
    parsed.evidence_sentence ? `答案定位句：${parsed.evidence_sentence}` : "",
    parsed.why_correct ? `为什么选这个：${parsed.why_correct}` : "",
    parsed.option_analysis ? `选项分析：${JSON.stringify(parsed.option_analysis, null, 2)}` : ""
  ].filter(Boolean).join("\n\n");
}

function assertApiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("缺少 OPENAI_API_KEY 环境变量");
  }
}
