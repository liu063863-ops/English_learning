export const sampleReadingExam = {
  _id: "demo-cet4-reading",
  examType: "CET4",
  year: 2023,
  month: 6,
  paperNo: 1,
  title: "2023年6月 CET4 阅读模块演示卷",
  durationMinutes: 40,
  sections: [
    {
      type: "reading",
      title: "Reading Comprehension",
      readingPassages: [
        {
          passageNo: 1,
          title: "Digital Learning Habits",
          content:
            "Digital learning tools have changed the way college students prepare for exams.\nApps can remind learners to review words, analyze mistakes and manage study time.\nHowever, experts point out that technology works best when students set clear goals and reflect on their performance regularly.\nIn other words, a useful app should not replace thinking; it should help students notice what they have not mastered.",
          paragraphHints: {
            "cet4-2023-06-1-R1": 1,
            "cet4-2023-06-1-R2": 2,
            "cet4-2023-06-1-R3": 3
          },
          answerSentenceHints: {
            "cet4-2023-06-1-R1": [1],
            "cet4-2023-06-1-R2": [2],
            "cet4-2023-06-1-R3": [3]
          },
          questions: [
            {
              questionNo: 1,
              questionKey: "cet4-2023-06-1-R1",
              type: "single-choice",
              prompt: "What is the passage mainly about?",
              options: [
                { key: "A", text: "The cost of college textbooks." },
                { key: "B", text: "How digital tools support exam preparation." },
                { key: "C", text: "Why students should avoid technology." },
                { key: "D", text: "The history of language exams." }
              ],
              difficulty: 2,
              knowledgeTags: ["main-idea", "digital-learning"]
            },
            {
              questionNo: 2,
              questionKey: "cet4-2023-06-1-R2",
              type: "multiple-choice",
              prompt: "Which tasks can apps help learners complete?",
              options: [
                { key: "A", text: "Review words." },
                { key: "B", text: "Analyze mistakes." },
                { key: "C", text: "Manage study time." },
                { key: "D", text: "Avoid reflection." }
              ],
              difficulty: 3,
              knowledgeTags: ["detail", "multiple-choice"]
            },
            {
              questionNo: 3,
              questionKey: "cet4-2023-06-1-R3",
              type: "blank",
              prompt: "Technology works best when students set clear ______.",
              options: [],
              difficulty: 2,
              knowledgeTags: ["detail", "blank"]
            }
          ]
        }
      ]
    }
  ]
};
