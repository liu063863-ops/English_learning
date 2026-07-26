---
title: "Skill 02: PDF 非结构化数据渐进式解析"
category: skills
tags: [pdf, parser, data-import]
created: 2026-07-26
---

> **适用场景**：需要将 PDF（试卷、论文、报告）转为结构化数据库的任何项目。

## 核心流程（4步法）
Step 1: 最小化导入（只存元数据，不解析内容）
→ 确保系统立即可用，不阻塞开发
Step 2: 诊断脚本定位问题
→ diagnosePdfParser.mjs：逐页测试，找出卡死页
Step 3: 生成示例数据验证结构
→ generateSampleData.mjs：用假数据填充，验证前端展示
Step 4: 批量替换真实数据
→ 解析完成后，SQL 批量 UPDATE 替换占位符
plain

## Step 1：最小化导入 SQL 模板

```sql
-- 只存试卷框架，题目用占位符
INSERT INTO exams (id, year, month, level, setNum, title) 
VALUES (?, ?, ?, ?, ?, ?);

INSERT INTO sections (exam_id, section_type, section_name) 
VALUES (?, ?, ?);

INSERT INTO questions (section_id, question_text, is_placeholder) 
VALUES (?, 'placeholder', true);
```
Step 2：诊断脚本框架
JavaScript
```javascript
// diagnosePdfParser.mjs
import pdfplumber from 'pdfplumber';

const pdfPath = process.argv[2];
const pdf = await pdfplumber.open(pdfPath);

for (let i = 0; i < pdf.pages.length; i++) {
  const start = Date.now();
  try {
    const text = await pdf.pages[i].extract_text();
    console.log(`Page ${i + 1}: ✅ ${Date.now() - start}ms`);
  } catch (e) {
    console.log(`Page ${i + 1}: ❌ TIMEOUT`);
  }
}
```
Step 3：示例数据生成
JavaScript
```javascript
// generateSampleData.mjs
const sampleExam = {
  id: 'cet4-2023-6-1',
  sections: [
    { type: 'listening', questions: generateQuestions(25) },
    { type: 'reading', passages: generatePassages(3), questions: generateQuestions(30) },
    { type: 'translation', questions: [generateTranslation()] },
    { type: 'writing', questions: [generateWriting()] }
  ]
};
```
Step 4：批量替换占位符
sql
```sql
-- 解析完成后，用真实数据替换
UPDATE questions 
SET question_text = ?, options = ?, answer = ? 
WHERE section_id = ? AND question_number = ?;
```
关键原则
框架先行：系统可用性优先，不等待解析完成
数据后补：占位符不影响前端开发，真实数据后续替换
诊断优先：先定位问题页面，不盲目全量解析
幂等导入：重复导入不重复插入，支持增量更新
收益
避免"解析不完就不能用"的死锁，系统始终可运行。
plain
