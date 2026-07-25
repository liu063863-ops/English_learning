export const userProfile = {
  nickname: "Student",
  targetExam: "CET-6",
  dailyWordGoal: 20,
  dailyReviewGoal: 30,
  createdAt: "2026-07-22T00:00:00.000Z",
  lastStudyDate: null,
  studyDays: 0
};

export const wordBooks = [
  {
    id: "cet4",
    name: "CET-4 Core Vocabulary",
    examType: "CET-4",
    source: "built-in",
    description: "High-frequency vocabulary for College English Test Band 4.",
    importUrl: "/api/import/wordbooks/cet4"
  },
  {
    id: "cet6",
    name: "CET-6 Advanced Vocabulary",
    examType: "CET-6",
    source: "built-in",
    description: "Advanced vocabulary for College English Test Band 6.",
    importUrl: "/api/import/wordbooks/cet6"
  },
  {
    id: "kaoyan",
    name: "Postgraduate English Vocabulary",
    examType: "KAOYAN",
    source: "built-in",
    description: "Core vocabulary for postgraduate entrance English exams.",
    importUrl: "/api/import/wordbooks/kaoyan"
  }
];

export const words = [
  {
    wordBookId: "cet4",
    word: "efficient",
    phonetic: "/i'fɪʃnt/",
    meaning: "adj. efficient, working well without wasting time or energy",
    chinese: "高效的",
    example: "An efficient study plan helps students prepare with less anxiety.",
    memoryImage: "A clean study desk with a timer and a checklist.",
    partOfSpeech: "adjective",
    synonyms: ["effective", "productive"],
    confusables: ["effective", "sufficient", "proficient"],
    group: "CET-4 Day 1",
    tags: ["plan", "study"]
  },
  {
    wordBookId: "cet4",
    word: "effective",
    phonetic: "/ɪ'fektɪv/",
    meaning: "adj. producing the intended result",
    chinese: "有效的",
    example: "Effective review depends on feedback and repetition.",
    memoryImage: "A target hit exactly in the center.",
    partOfSpeech: "adjective",
    synonyms: ["useful", "successful"],
    confusables: ["efficient", "sufficient", "affective"],
    group: "CET-4 Day 1",
    tags: ["plan", "study"]
  },
  {
    wordBookId: "cet4",
    word: "sufficient",
    phonetic: "/sə'fɪʃnt/",
    meaning: "adj. enough for a particular purpose",
    chinese: "足够的",
    example: "Students need sufficient time to review mistakes.",
    memoryImage: "A full battery marked enough.",
    partOfSpeech: "adjective",
    synonyms: ["enough", "adequate"],
    confusables: ["efficient", "effective", "proficient"],
    group: "CET-4 Day 1",
    tags: ["plan", "study"]
  },
  {
    wordBookId: "cet4",
    word: "proficient",
    phonetic: "/prə'fɪʃnt/",
    meaning: "adj. skilled and experienced",
    chinese: "熟练的",
    example: "A proficient learner knows how to correct errors.",
    memoryImage: "A student confidently solving a difficult exercise.",
    partOfSpeech: "adjective",
    synonyms: ["skilled", "capable"],
    confusables: ["efficient", "sufficient", "effective"],
    group: "CET-4 Day 1",
    tags: ["ability", "study"]
  },
  {
    wordBookId: "cet4",
    word: "approach",
    phonetic: "/ə'prəʊtʃ/",
    meaning: "n./v. a method of doing something; to move closer",
    chinese: "方法；接近",
    example: "A balanced approach combines vocabulary, reading and listening.",
    memoryImage: "A student walking toward three doors labeled words, reading and listening.",
    partOfSpeech: "noun",
    synonyms: ["method", "way"],
    confusables: ["access", "approval", "attempt"],
    group: "CET-4 Day 1",
    tags: ["method"]
  },
  {
    wordBookId: "cet4",
    word: "access",
    phonetic: "/'ækses/",
    meaning: "n./v. the right or chance to use something",
    chinese: "入口；使用权",
    example: "Online platforms give students access to practice materials.",
    memoryImage: "A key opening a digital library.",
    partOfSpeech: "noun",
    synonyms: ["entry", "permission"],
    confusables: ["approach", "assess", "process"],
    group: "CET-4 Day 1",
    tags: ["method"]
  },
  {
    wordBookId: "cet6",
    word: "substantial",
    phonetic: "/səb'stænʃl/",
    meaning: "adj. large in amount, value or importance",
    chinese: "大量的；实质性的",
    example: "Substantial progress comes from repeated practice.",
    memoryImage: "A progress bar moving forward after daily practice.",
    partOfSpeech: "adjective",
    synonyms: ["considerable", "significant"],
    confusables: ["essential", "potential", "partial"],
    group: "CET-6 Day 1",
    tags: ["writing", "reading"]
  },
  {
    wordBookId: "cet6",
    word: "essential",
    phonetic: "/ɪ'senʃl/",
    meaning: "adj. completely necessary",
    chinese: "必要的；本质的",
    example: "Regular review is essential for long-term memory.",
    memoryImage: "A foundation stone supporting a building.",
    partOfSpeech: "adjective",
    synonyms: ["necessary", "vital"],
    confusables: ["substantial", "potential", "partial"],
    group: "CET-6 Day 1",
    tags: ["writing", "reading"]
  },
  {
    wordBookId: "cet6",
    word: "potential",
    phonetic: "/pə'tenʃl/",
    meaning: "adj./n. possible but not yet developed",
    chinese: "潜在的；潜力",
    example: "Mistake review reveals potential weaknesses.",
    memoryImage: "A seed about to grow into a tree.",
    partOfSpeech: "adjective",
    synonyms: ["possible", "latent"],
    confusables: ["substantial", "essential", "partial"],
    group: "CET-6 Day 1",
    tags: ["writing", "reading"]
  },
  {
    wordBookId: "cet6",
    word: "partial",
    phonetic: "/'pɑːʃl/",
    meaning: "adj. not complete; favoring one side",
    chinese: "部分的；偏袒的",
    example: "A partial answer may miss the author's main point.",
    memoryImage: "A puzzle with several missing pieces.",
    partOfSpeech: "adjective",
    synonyms: ["incomplete", "biased"],
    confusables: ["substantial", "potential", "essential"],
    group: "CET-6 Day 1",
    tags: ["reading"]
  },
  {
    wordBookId: "cet6",
    word: "interpret",
    phonetic: "/ɪn'tɜːprɪt/",
    meaning: "v. to explain the meaning of something",
    chinese: "解释；理解",
    example: "Students need to interpret the author's attitude in reading tasks.",
    memoryImage: "A reader highlighting clues in an article.",
    partOfSpeech: "verb",
    synonyms: ["explain", "understand"],
    confusables: ["interrupt", "interact", "integrate"],
    group: "CET-6 Day 1",
    tags: ["reading"]
  },
  {
    wordBookId: "cet6",
    word: "interrupt",
    phonetic: "/ˌɪntə'rʌpt/",
    meaning: "v. to stop someone while they are speaking or doing something",
    chinese: "打断；中断",
    example: "Do not interrupt the listening recording too often.",
    memoryImage: "A pause sign suddenly appearing in a conversation.",
    partOfSpeech: "verb",
    synonyms: ["stop", "break"],
    confusables: ["interpret", "interact", "integrate"],
    group: "CET-6 Day 1",
    tags: ["listening", "reading"]
  },
  {
    wordBookId: "cet6",
    word: "integrate",
    phonetic: "/'ɪntɪɡreɪt/",
    meaning: "v. to combine things into a whole",
    chinese: "整合",
    example: "The app integrates vocabulary and practice tests.",
    memoryImage: "Several study cards merging into one dashboard.",
    partOfSpeech: "verb",
    synonyms: ["combine", "unite"],
    confusables: ["interpret", "interrupt", "interact"],
    group: "CET-6 Day 1",
    tags: ["method", "study"]
  },
  {
    wordBookId: "kaoyan",
    word: "ambiguous",
    phonetic: "/æm'bɪɡjuəs/",
    meaning: "adj. unclear, with more than one possible meaning",
    chinese: "模棱两可的",
    example: "The author's position is deliberately ambiguous.",
    memoryImage: "A signpost pointing in two opposite directions.",
    partOfSpeech: "adjective",
    synonyms: ["unclear", "vague"],
    confusables: ["ambitious", "obvious", "anonymous"],
    group: "Kaoyan Day 1",
    tags: ["reading", "translation"]
  },
  {
    wordBookId: "kaoyan",
    word: "derive",
    phonetic: "/dɪ'raɪv/",
    meaning: "v. to get something from a source",
    chinese: "源于；获得；推导",
    example: "Many academic terms derive from Latin.",
    memoryImage: "A tree root feeding several branches of words.",
    partOfSpeech: "verb",
    synonyms: ["obtain", "originate"],
    confusables: ["deprive", "drive", "deliver"],
    group: "Kaoyan Day 1",
    tags: ["translation"]
  }
];

export const questions = [
  {
    examType: "CET-4",
    year: 2023,
    paper: "June Set 1",
    type: "vocabulary",
    difficulty: "easy",
    knowledgePoints: ["context clue", "word meaning"],
    prompt: "The new library system is more ______ and allows students to find books quickly.",
    options: ["efficient", "distant", "casual", "silent"],
    answer: "efficient",
    explanation: "The clue is 'find books quickly', so efficient is the best choice.",
    expansion: "efficient often modifies system, method, plan and service."
  },
  {
    examType: "CET-6",
    year: 2022,
    paper: "December Set 2",
    type: "reading",
    difficulty: "medium",
    knowledgePoints: ["main idea", "inference"],
    prompt: "According to the passage, the main benefit of deliberate practice is that it ______.",
    options: ["reduces all pressure", "builds skills through feedback", "replaces basic knowledge", "depends only on talent"],
    answer: "builds skills through feedback",
    explanation: "Deliberate practice emphasizes targeted repetition and feedback.",
    expansion: "In CET-6 reading, watch for abstract nouns like feedback, evidence and assumption."
  },
  {
    examType: "KAOYAN",
    year: 2021,
    paper: "English I",
    type: "grammar",
    difficulty: "medium",
    knowledgePoints: ["inversion", "fixed structure"],
    prompt: "No sooner had the lecture begun ______ several students raised questions.",
    options: ["when", "than", "before", "while"],
    answer: "than",
    explanation: "No sooner ... than ... is a fixed inverted structure.",
    expansion: "Related structures include Hardly ... when ... and Scarcely ... when ...."
  },
  {
    examType: "KAOYAN",
    year: 2020,
    paper: "English II",
    type: "translation",
    difficulty: "hard",
    knowledgePoints: ["parallel structure", "education topic"],
    prompt: "Choose the best translation: 教育的目的不仅是传授知识，而且是培养独立思考的能力。",
    options: [
      "The purpose of education is not only to transmit knowledge but also to cultivate independent thinking.",
      "Education only transmits knowledge and avoids independent thinking.",
      "The purpose of knowledge is to cultivate education independently.",
      "Independent thinking is not related to the purpose of education."
    ],
    answer: "The purpose of education is not only to transmit knowledge but also to cultivate independent thinking.",
    explanation: "The sentence uses the parallel pattern not only ... but also ....",
    expansion: "For translation, keep grammatical parallelism and avoid word-for-word Chinese order."
  }
];

export const mockQuestions = [
  {
    examType: "CET-4",
    year: 2026,
    paper: "Daily Mock",
    type: "cloze",
    difficulty: "easy",
    knowledgePoints: ["collocation"],
    prompt: "Students should ______ a habit of reviewing mistakes after each test.",
    options: ["develop", "damage", "delay", "deny"],
    answer: "develop",
    explanation: "develop a habit is a common collocation.",
    expansion: "Other collocations: build a habit, form a habit."
  },
  {
    examType: "CET-6",
    year: 2026,
    paper: "Daily Mock",
    type: "reading",
    difficulty: "medium",
    knowledgePoints: ["author attitude"],
    prompt: "The author's attitude toward online learning is best described as ______.",
    options: ["balanced", "hostile", "indifferent", "confused"],
    answer: "balanced",
    explanation: "A balanced attitude discusses both convenience and self-discipline.",
    expansion: "Attitude questions often use words such as skeptical, cautious, optimistic, critical."
  }
];

export const listeningMaterials = [
  {
    title: "CET-4 Campus News Listening",
    examType: "CET-4",
    source: "placeholder",
    audioUrl: "",
    transcript: "This placeholder represents a campus news listening material.",
    segments: [{ start: 8, end: 22, label: "main fact" }],
    searchEndpoint: "/api/listening/search?keyword=campus"
  },
  {
    title: "CET-6 Lecture Listening",
    examType: "CET-6",
    source: "placeholder",
    audioUrl: "",
    transcript: "This placeholder represents a short academic lecture listening material.",
    segments: [{ start: 15, end: 40, label: "key argument" }],
    searchEndpoint: "/api/listening/search?keyword=lecture"
  }
];

export const examPapers = [
  {
    id: "cet6-2023-06-sample",
    examType: "CET-6",
    year: 2023,
    month: 6,
    title: "CET-6 2023 June Structured Sample",
    difficulty: "medium",
    durationMinutes: 130,
    source: {
      type: "manual-structured-sample",
      url: "",
      licenseNote: "Sample paper structure for MVP. Replace with authorized past-paper data through the import adapter."
    },
    sections: [
      {
        id: "listening",
        type: "listening",
        title: "Listening Comprehension",
        score: 35,
        audioUrl: "",
        audioNote: "Audio placeholder. Import scripts can attach local or authorized online audio URLs.",
        questions: [
          {
            id: "L1",
            kind: "single-choice",
            prompt: "What does the speaker suggest students should do before a major exam?",
            options: ["Review mistakes regularly", "Memorize every article", "Avoid timed practice", "Change plans daily"],
            answer: "Review mistakes regularly",
            explanation: "The key clue is the recommendation to return to previous mistakes before the exam.",
            difficulty: "easy",
            knowledgePoints: ["listening detail", "study plan"]
          },
          {
            id: "L2",
            kind: "single-choice",
            prompt: "What is the speaker's attitude toward online learning tools?",
            options: ["Balanced", "Hostile", "Indifferent", "Uncertain"],
            answer: "Balanced",
            explanation: "The speaker mentions both convenience and the need for self-discipline.",
            difficulty: "medium",
            knowledgePoints: ["attitude", "listening inference"]
          }
        ]
      },
      {
        id: "reading",
        type: "reading",
        title: "Reading Comprehension",
        score: 35,
        passages: [
          {
            id: "R1",
            title: "Deliberate Practice and Language Learning",
            text: "Successful language learners rarely depend on long study hours alone. They set clear targets, receive feedback, and return to difficult points repeatedly. This cycle turns mistakes into signals rather than failures.",
            questions: [
              {
                id: "R1Q1",
                kind: "single-choice",
                prompt: "What is the main idea of the passage?",
                options: ["Feedback-based practice improves learning", "Long hours are always enough", "Mistakes should be ignored", "Targets make feedback unnecessary"],
                answer: "Feedback-based practice improves learning",
                explanation: "The passage emphasizes targets, feedback, repetition and mistake review.",
                difficulty: "medium",
                knowledgePoints: ["main idea", "reading"]
              },
              {
                id: "R1Q2",
                kind: "single-choice",
                prompt: "What does the word 'signals' imply in the passage?",
                options: ["Useful information for improvement", "Proof of failure", "Exam rules", "Unrelated notes"],
                answer: "Useful information for improvement",
                explanation: "Signals here means information that guides the next round of practice.",
                difficulty: "medium",
                knowledgePoints: ["word meaning in context"]
              }
            ]
          }
        ]
      },
      {
        id: "translation",
        type: "translation",
        title: "Translation",
        score: 15,
        prompt: "Translate into English: 系统性的复盘能帮助学生发现薄弱环节，并把错误转化为下一步学习计划。",
        referenceAnswer: "Systematic review helps students identify weak points and turn mistakes into the next study plan.",
        scoring: "manual",
        manualRubric: ["accuracy", "grammar", "fluency", "key information"]
      },
      {
        id: "writing",
        type: "writing",
        title: "Writing",
        score: 15,
        prompt: "Write an essay of about 150 words on the importance of reviewing mistakes in English learning.",
        referenceAnswer: "",
        scoring: "manual",
        manualRubric: ["content", "organization", "language", "task response"]
      }
    ]
  },
  {
    id: "kaoyan-2022-12-sample",
    examType: "KAOYAN",
    year: 2022,
    month: 12,
    title: "Postgraduate English 2022 Structured Sample",
    difficulty: "hard",
    durationMinutes: 180,
    source: {
      type: "manual-structured-sample",
      url: "",
      licenseNote: "Sample paper structure for MVP. Replace with authorized past-paper data through the import adapter."
    },
    sections: [
      {
        id: "reading",
        type: "reading",
        title: "Reading Comprehension",
        score: 40,
        passages: [
          {
            id: "R1",
            title: "Academic Reading Habits",
            text: "Academic reading requires more than recognizing vocabulary. Readers must follow argument structure, distinguish evidence from opinion, and infer why an author selects certain examples.",
            questions: [
              {
                id: "R1Q1",
                kind: "single-choice",
                prompt: "According to the passage, academic reading mainly requires readers to ______.",
                options: ["follow arguments and evaluate evidence", "translate every word immediately", "skip examples", "memorize isolated grammar rules"],
                answer: "follow arguments and evaluate evidence",
                explanation: "The passage lists argument structure, evidence, opinion and examples as key tasks.",
                difficulty: "hard",
                knowledgePoints: ["inference", "argument structure"]
              }
            ]
          }
        ]
      },
      {
        id: "translation",
        type: "translation",
        title: "Translation",
        score: 15,
        prompt: "Translate into Chinese: Careful readers do not merely collect information; they examine how claims are supported.",
        referenceAnswer: "细心的读者不只是收集信息；他们还会考察观点是如何被支撑的。",
        scoring: "manual",
        manualRubric: ["meaning", "logic", "expression"]
      },
      {
        id: "writing",
        type: "writing",
        title: "Writing",
        score: 25,
        prompt: "Write a short essay about how university students can balance efficiency and depth in exam preparation.",
        referenceAnswer: "",
        scoring: "manual",
        manualRubric: ["argument", "examples", "coherence", "language"]
      }
    ]
  }
];
