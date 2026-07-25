import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const outputPath = path.resolve(projectRoot, "backend/data/generated/sample-cet4-2023-06-set1.json");

const sample = buildSampleExam();
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(sample, null, 2), "utf8");

console.log(JSON.stringify({
  ok: true,
  output: outputPath,
  exam: {
    title: sample.exams[0].title,
    sections: sample.sections.length,
    passages: sample.passages.length,
    questions: sample.questions.length,
    readingQuestions: sample.questions.filter((q) => oidValue(q.section_id) === oidValue(sample.sections[1]._id)).length
  }
}, null, 2));

function buildSampleExam() {
  const now = new Date().toISOString();
  const key = "CET4:2023:6:1:past_exam";
  const examId = oid(hashId(`${key}:exam`));
  const sectionIds = {
    listening: oid(hashId(`${key}:section:listening`)),
    reading: oid(hashId(`${key}:section:reading`)),
    translation: oid(hashId(`${key}:section:translation`)),
    writing: oid(hashId(`${key}:section:writing`))
  };
  const audioId = oid(hashId(`${key}:audio:1`));
  const passageIds = {
    a: oid(hashId(`${key}:reading:a`)),
    b: oid(hashId(`${key}:reading:b`)),
    c1: oid(hashId(`${key}:reading:c1`)),
    c2: oid(hashId(`${key}:reading:c2`))
  };

  const listening = buildListening(sectionIds.listening, audioId, now);
  const reading = buildReading(sectionIds.reading, passageIds, now);

  return {
    exams: [{
      _id: examId,
      title: "\u0032\u0030\u0032\u0033\u5e74\u0036\u6708 CET4 \u7b2c\u0031\u5957\u5b8c\u6574\u6837\u4f8b\u5377",
      level: "CET4",
      year: 2023,
      month: 6,
      set_num: 1,
      source: "past_exam",
      source_meta: {
        provider: "generated-sample",
        import_mode: "full_sample_v2",
        note: "\u7528\u4e8e\u9a8c\u8bc1\u5b8c\u6574\u8003\u8bd5\u6d41\u7a0b\u7684\u6837\u4f8b\u6570\u636e\u3002"
      },
      status: "published",
      created_at: now,
      updated_at: now
    }],
    sections: [
      sectionRow(sectionIds.listening, examId, "listening", "Listening Comprehension", 1, 35, 25, now),
      sectionRow(sectionIds.reading, examId, "reading", "Reading Comprehension", 2, 35, 40, now),
      sectionRow(sectionIds.translation, examId, "translation", "Translation", 3, 15, 30, now),
      sectionRow(sectionIds.writing, examId, "writing", "Writing", 4, 15, 30, now)
    ],
    audio_files: [{
      _id: audioId,
      exam_id: examId,
      section_id: sectionIds.listening,
      file_url: createSilentWavDataUri(500, 1000),
      duration: 500,
      transcript_full: buildListeningTranscript(),
      source_meta: { file_name: "sample-listening.wav", mode: "generated-silence" },
      created_at: now,
      updated_at: now
    }],
    passages: [
      passageRow(passageIds.a, sectionIds.reading, 1, "Section A: Banked Cloze", bankedClozePassage(), now, markers(1)),
      passageRow(passageIds.b, sectionIds.reading, 2, "Section B: Matching Information", matchingPassage(), now, markers(10)),
      passageRow(passageIds.c1, sectionIds.reading, 3, "Section C: Careful Reading Passage 1", carefulPassageOne(), now, markers(3)),
      passageRow(passageIds.c2, sectionIds.reading, 4, "Section C: Careful Reading Passage 2", carefulPassageTwo(), now, markers(3))
    ],
    questions: [
      ...listening.questions,
      ...reading.questions,
      translationQuestion(sectionIds.translation, now),
      writingQuestion(sectionIds.writing, now)
    ]
  };
}

function buildListening(sectionId, audioId, now) {
  const prompts = [
    "What does the conversation imply?", "What does the man mean?", "Why is the woman speaking?",
    "What is the topic?", "What happened to the bike?", "What do the speakers plan to do?",
    "What should the student do?", "What is available at the cafe?", "What is the man going to do?",
    "Why was the seminar moved?", "What is the man doing?", "What do the students agree to do?",
    "What does the caller need?", "How does the woman feel about the internship?", "What should the man do?",
    "What is being announced?", "What weather is expected?", "What is the club doing?",
    "What did the survey show?", "Why is the campus garden mentioned?", "What should students do during the drill?",
    "When does the book club meet?", "What will the school install?", "What should the listener do with the ticket?",
    "What is the deadline?"
  ];
  return {
    questions: prompts.map((prompt, index) => question({
      section_id: sectionId,
      audio_file_id: audioId,
      order_index: index + 1,
      question_type: "single_choice",
      question_text: rich(`${partName(index)} ${prompt}`),
      options: options(["Correct listening choice.", "Distractor choice.", "Another distractor.", "Unrelated choice."]),
      correct_answer: "A",
      explanation: richText(`The key information in the transcript supports option A for listening question ${index + 1}.`),
      audio_start_time: index * 20,
      audio_end_time: (index + 1) * 20,
      transcript: `Sample listening transcript segment for question ${index + 1}. The speaker clearly supports option A.`,
      passage_ref: {},
      tags: ["listening", index < 8 ? "part_a" : index < 15 ? "part_b" : "part_c"],
      difficulty: index < 8 ? 2 : 3,
      score: 1.4,
      import_meta: { source_question_no: `L-${index + 1}` },
      now
    }))
  };
}

function buildReading(sectionId, passageIds, now) {
  const sectionA = Array.from({ length: 10 }, (_, index) => question({
    section_id: sectionId,
    passage_id: passageIds.a,
    order_index: index + 1,
    question_type: "single_choice",
    question_text: rich(`Section A ${26 + index}. Choose the best word for blank ${index + 1}.`),
    options: options(["available", "ordinary", "rapid", "complex"]),
    correct_answer: ["A", "B", "C", "D"][index % 4],
    explanation: richText(`Blank ${index + 1} is solved by grammar and context in the banked cloze passage.`),
    passage_ref: ref(passageIds.a, "P1", `Blank ${index + 1}`),
    tags: ["reading", "section_a", "banked_cloze"],
    difficulty: 3,
    score: 1.1667,
    import_meta: { source_question_no: `R-${26 + index}` },
    now
  }));

  const sectionB = Array.from({ length: 10 }, (_, index) => question({
    section_id: sectionId,
    passage_id: passageIds.b,
    order_index: 11 + index,
    question_type: "single_choice",
    question_text: rich(`Section B ${36 + index}. Which paragraph contains the following information?`),
    options: options(["P1", "P2", "P3", "P4"]),
    correct_answer: ["A", "B", "C", "D"][index % 4],
    explanation: richText(`This item is linked only to paragraph P${index + 1} in the matching passage.`),
    passage_ref: ref(passageIds.b, `P${index + 1}`, `Evidence appears in paragraph ${index + 1}.`),
    tags: ["reading", "section_b", "matching"],
    difficulty: 3,
    score: 1.1667,
    import_meta: { source_question_no: `R-${36 + index}` },
    now
  }));

  const carefulRows = [
    [passageIds.c1, "P1", "What is the main idea of Paragraph 1?"],
    [passageIds.c1, "P2", "What did the researchers compare?"],
    [passageIds.c1, "P3", "What does the report conclude?"],
    [passageIds.c1, "P2", "The word stamina is closest in meaning to?"],
    [passageIds.c1, "P3", "What advice does the passage suggest?"],
    [passageIds.c2, "P1", "What is the passage mainly about?"],
    [passageIds.c2, "P2", "What did students learn from the projects?"],
    [passageIds.c2, "P1", "Which item was installed on campus?"],
    [passageIds.c2, "P3", "What is the writer's attitude?"],
    [passageIds.c2, "P3", "What does the passage suggest about green campuses?"]
  ];
  const sectionC = carefulRows.map((row, index) => question({
    section_id: sectionId,
    passage_id: row[0],
    order_index: 21 + index,
    question_type: "single_choice",
    question_text: rich(`Section C ${46 + index}. ${row[2]}`),
    options: options(["Correct answer.", "Distractor one.", "Distractor two.", "Distractor three."]),
    correct_answer: "A",
    explanation: richText(`The answer is located in ${row[1]} of the corresponding careful reading passage.`),
    passage_ref: ref(row[0], row[1], `Evidence is in ${row[1]}.`),
    tags: ["reading", "section_c", "careful_reading"],
    difficulty: 3,
    score: 1.1667,
    import_meta: { source_question_no: `R-${46 + index}` },
    now
  }));

  return { questions: [...sectionA, ...sectionB, ...sectionC] };
}

function bankedClozePassage() {
  return "Many students believe that learning online is easy, but effective online learning requires discipline. A learner has to set a clear schedule, choose useful materials, and review important points regularly. In this sample banked cloze passage, ten blanks are represented by bracketed positions: [1] [2] [3] [4] [5] [6] [7] [8] [9] [10]. Each blank should be completed by choosing a suitable word from the option list.";
}

function matchingPassage() {
  return [
    "P1. A coding club meets every Tuesday to build simple apps for campus life.",
    "P2. The library redesigned a quiet reading room with softer lights and more power sockets.",
    "P3. A recycling drive invites dormitory residents to collect paper, bottles and broken electronics.",
    "P4. The student podcast focuses on interviews with first-year students.",
    "P5. A volunteer tutoring program pairs senior students with freshmen who need help.",
    "P6. An art wall near the canteen is updated by students from different majors.",
    "P7. A food-sharing cabinet lets students leave unopened snacks and pick up items they need.",
    "P8. A language exchange corner brings together students who want to practice different languages.",
    "P9. A night study bus runs from the main library to several dormitory areas.",
    "P10. A campus map app combines building locations, classroom numbers and event reminders."
  ].join("\n\n");
}

function carefulPassageOne() {
  return [
    "A university survey found that students who slept fewer than six hours a night were more likely to miss classes and forget details from lectures.",
    "To understand the habit behind the numbers, the team compared screen time, coffee use and evening routines.",
    "The report concluded that sleep was not a luxury but part of academic success. Regular sleep supported memory, concentration and mood."
  ].join("\n\n");
}

function carefulPassageTwo() {
  return [
    "Many campuses have added solar lights, rain gardens and recycling stations to make daily life cleaner and cheaper.",
    "Student volunteers learned how to sort waste, reduce paper use and keep shared spaces tidy.",
    "The article argues that a green campus is not only about saving energy. It can also become a better learning space."
  ].join("\n\n");
}

function translationQuestion(sectionId, now) {
  return question({
    section_id: sectionId,
    order_index: 1,
    question_type: "subjective",
    question_text: rich("Translate the following paragraph into English:\n\n\u8fd1\u5e74\u6765\uff0c\u8d8a\u6765\u8d8a\u591a\u7684\u5927\u5b66\u751f\u53c2\u52a0\u5fd7\u613f\u670d\u52a1\uff0c\u4ed6\u4eec\u5728\u793e\u533a\u3001\u56fe\u4e66\u9986\u548c\u4e61\u6751\u5b66\u6821\u4e2d\u5e2e\u52a9\u4ed6\u4eba\uff0c\u4e5f\u4ece\u4e2d\u5b66\u4f1a\u4e86\u6c9f\u901a\u3001\u5408\u4f5c\u4e0e\u8d23\u4efb\u3002"),
    options: [],
    correct_answer: { reference: "In recent years, more and more college students have taken part in voluntary service. They help others in communities, libraries and rural schools, and in the process they learn communication, teamwork and responsibility." },
    explanation: richText("The translation should preserve the core ideas and keep the sentence natural."),
    passage_ref: {},
    tags: ["translation"],
    difficulty: 3,
    score: 15,
    import_meta: { source_question_no: "T-1" },
    now
  });
}

function writingQuestion(sectionId, now) {
  return question({
    section_id: sectionId,
    order_index: 1,
    question_type: "subjective",
    question_text: rich("Write an essay of about 120 words on the following topic:\n\nThe Importance of a Healthy Study Routine\n\nYou should write at least three points to support your opinion."),
    options: [],
    correct_answer: { reference: "A sample essay should explain that a healthy study routine improves concentration, prevents exhaustion and helps students stay consistent." },
    explanation: richText("The writing task tests structure, opinion and coherence."),
    passage_ref: {},
    tags: ["writing"],
    difficulty: 3,
    score: 15,
    import_meta: { source_question_no: "W-1" },
    now
  });
}

function sectionRow(id, examId, type, name, orderIndex, score, limit, now) {
  return { _id: id, exam_id: examId, section_type: type, section_name: name, order_index: orderIndex, total_score: score, time_limit: limit, created_at: now, updated_at: now };
}

function passageRow(id, sectionId, orderIndex, title, text, now, paragraphMarkers) {
  return { _id: id, section_id: sectionId, title, order_index: orderIndex, passage_text: text, paragraph_markers: paragraphMarkers, created_at: now, updated_at: now };
}

function question(data) {
  return {
    _id: oid(hashId(`${oidValue(data.section_id)}:${data.order_index}`)),
    section_id: data.section_id,
    passage_id: data.passage_id || null,
    audio_file_id: data.audio_file_id || null,
    question_type: data.question_type,
    order_index: data.order_index,
    question_text: data.question_text,
    options: data.options || [],
    correct_answer: data.correct_answer ?? null,
    explanation: data.explanation || richText(""),
    audio_start_time: data.audio_start_time ?? null,
    audio_end_time: data.audio_end_time ?? null,
    transcript: data.transcript || "",
    passage_ref: data.passage_ref || {},
    tags: data.tags || [],
    difficulty: data.difficulty || 3,
    score: data.score || 0,
    import_meta: data.import_meta || {},
    created_at: data.now,
    updated_at: data.now
  };
}

function rich(raw) {
  return { raw, html: `<p>${escapeHtml(raw).replace(/\n/g, "<br />")}</p>` };
}

function richText(raw) {
  return rich(raw);
}

function options(items) {
  return items.map((text, index) => ({ key: String.fromCharCode(65 + index), text }));
}

function ref(passageId, paragraphId, evidence) {
  return { passage_id: passageId, paragraph_ids: [paragraphId], evidence_text: evidence };
}

function markers(count) {
  return Array.from({ length: count }, (_, index) => ({ paragraph_id: `P${index + 1}`, order_index: index + 1, start_offset: index * 120, end_offset: index * 120 + 119, text_preview: `Paragraph ${index + 1}` }));
}

function partName(index) {
  if (index < 8) return `Part A ${index + 1}.`;
  if (index < 15) return `Part B ${index - 7}.`;
  return `Part C ${index - 14}.`;
}

function buildListeningTranscript() {
  return "Sample audio transcript for the full listening section. Each segment supports option A in the generated sample data.";
}

function createSilentWavDataUri(seconds = 1, sampleRate = 8000) {
  const dataSize = Math.max(1, Math.floor(seconds * sampleRate));
  const buffer = Buffer.alloc(44 + dataSize, 0);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return `data:audio/wav;base64,${buffer.toString("base64")}`;
}

function hashId(seed) {
  return crypto.createHash("md5").update(String(seed)).digest("hex").slice(0, 24);
}

function oid(value) {
  return { $oid: value };
}

function oidValue(value) {
  return value && typeof value === "object" ? value.$oid : value;
}

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
