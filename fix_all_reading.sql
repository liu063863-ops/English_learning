PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- Delete all existing reading questions and passages, including placeholders.
DELETE FROM questions
WHERE section_id IN (
  SELECT id FROM sections WHERE section_type = 'reading'
);

DELETE FROM passages
WHERE section_id IN (
  SELECT id FROM sections WHERE section_type = 'reading'
);

-- Insert 3 reading passages for every paper:
-- A = banked cloze, B = paragraph matching, C = careful reading container
-- C contains two careful-reading articles inside one passage so each paper displays "3 passages".
INSERT INTO passages (
  id,
  section_id,
  title,
  order_index,
  passage_text,
  paragraph_markers_json,
  created_at,
  updated_at
)
WITH
reading_sections AS (
  SELECT
    s.id AS section_id,
    e.id AS exam_id,
    e.level,
    e.year,
    e.month,
    e.set_num,
    ((e.year + e.month + e.set_num) % 6) AS theme_seed
  FROM sections s
  JOIN exams e ON e.id = s.exam_id
  WHERE s.section_type = 'reading'
),
passage_defs(order_index, code, title_suffix, paragraph_count) AS (
  VALUES
    (1, 'A', 'Section A: Banked Cloze', 1),
    (2, 'B', 'Section B: Matching Information', 10),
    (3, 'C', 'Section C: Careful Reading', 6)
),
themes(seed, theme_name, theme_words) AS (
  VALUES
    (0, 'Education', 'learning, campus life, study habits and academic growth'),
    (1, 'Technology', 'digital tools, online platforms, data and innovation'),
    (2, 'Environment', 'green campuses, recycling, energy saving and public responsibility'),
    (3, 'Health', 'sleep, exercise, diet and mental balance'),
    (4, 'Culture', 'reading, museums, language exchange and community memory'),
    (5, 'Economy', 'jobs, markets, skills and responsible consumption')
),
seq(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 10
),
paragraph_json AS (
  SELECT
    rs.section_id,
    pd.order_index,
    json_group_array(json_object(
      'paragraph_id', 'P' || seq.n,
      'order_index', seq.n,
      'start_offset', (seq.n - 1) * 120,
      'end_offset', seq.n * 120 - 1,
      'text_preview', 'Paragraph ' || seq.n || ' about ' || t.theme_name
    )) AS paragraph_markers_json
  FROM reading_sections rs
  JOIN passage_defs pd
  JOIN themes t ON t.seed = ((rs.theme_seed + pd.order_index - 1) % 6)
  JOIN seq ON seq.n <= pd.paragraph_count
  GROUP BY rs.section_id, pd.order_index
)
SELECT
  'passage_' || rs.section_id || '_' || pd.code AS id,
  rs.section_id,
  pd.title_suffix || ' - ' || t.theme_name AS title,
  pd.order_index,
  CASE pd.code
    WHEN 'A' THEN
      'Section A - Banked Cloze (' || t.theme_name || '). ' ||
      'This 200-word sample passage focuses on ' || t.theme_words || '. ' ||
      'Students read the whole passage and choose the best word for each blank. ' ||
      'The text presents a clear topic sentence, supporting examples and a short conclusion. ' ||
      'Blank [1] introduces the theme, blank [2] tests collocation, blank [3] tests logic, blank [4] tests word form, blank [5] tests transition, blank [6] tests reference, blank [7] tests attitude, blank [8] tests detail, blank [9] tests summary and blank [10] tests conclusion. ' ||
      'The purpose of this generated passage is to replace placeholder data and verify the reading workflow.'
    WHEN 'B' THEN
      'P1. This paragraph introduces ' || t.theme_name || ' and gives a broad background for the topic.' || char(10) || char(10) ||
      'P2. This paragraph describes a specific problem that students or communities often notice in daily life.' || char(10) || char(10) ||
      'P3. This paragraph presents a practical solution and explains why the solution is realistic.' || char(10) || char(10) ||
      'P4. This paragraph reports how a student group or local team tested the idea in a small project.' || char(10) || char(10) ||
      'P5. This paragraph compares two different approaches and points out the strength of the better one.' || char(10) || char(10) ||
      'P6. This paragraph gives evidence from observation, survey results or interviews.' || char(10) || char(10) ||
      'P7. This paragraph discusses a limitation and reminds readers that change usually takes time.' || char(10) || char(10) ||
      'P8. This paragraph explains the role of cooperation among students, teachers and the wider community.' || char(10) || char(10) ||
      'P9. This paragraph shows how the idea may be extended to another place or another group.' || char(10) || char(10) ||
      'P10. This paragraph summarizes the main lesson and links the topic back to long-term learning.'
    ELSE
      'Article C1 - ' || t.theme_name || '. P1. The first careful-reading article opens with a focused observation about ' || t.theme_words || '.' || char(10) || char(10) ||
      'P2. The article then explains the causes behind the observation and gives one concrete example.' || char(10) || char(10) ||
      'P3. It concludes by showing what readers can learn from the case.' || char(10) || char(10) ||
      'Article C2 - ' || t.theme_name || '. P4. The second careful-reading article introduces a related situation from another angle.' || char(10) || char(10) ||
      'P5. It provides details, comparison and a short explanation of the key problem.' || char(10) || char(10) ||
      'P6. It ends with a balanced conclusion and a suggestion for future action.'
  END AS passage_text,
  pj.paragraph_markers_json,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM reading_sections rs
JOIN passage_defs pd
JOIN themes t ON t.seed = ((rs.theme_seed + pd.order_index - 1) % 6)
JOIN paragraph_json pj ON pj.section_id = rs.section_id AND pj.order_index = pd.order_index;

-- Insert 30 complete reading questions for every reading section.
INSERT INTO questions (
  id,
  section_id,
  passage_id,
  audio_file_id,
  question_type,
  order_index,
  question_text_json,
  options_json,
  correct_answer_json,
  explanation_json,
  audio_start_time,
  audio_end_time,
  transcript,
  passage_ref_json,
  tags_json,
  difficulty,
  score,
  import_meta_json,
  created_at,
  updated_at
)
WITH
reading_sections AS (
  SELECT
    s.id AS section_id,
    e.id AS exam_id,
    e.level,
    e.year,
    e.month,
    e.set_num,
    ((e.year + e.month + e.set_num) % 6) AS theme_seed
  FROM sections s
  JOIN exams e ON e.id = s.exam_id
  WHERE s.section_type = 'reading'
),
q(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM q WHERE n < 30
),
themes(seed, theme_name) AS (
  VALUES
    (0, 'Education'),
    (1, 'Technology'),
    (2, 'Environment'),
    (3, 'Health'),
    (4, 'Culture'),
    (5, 'Economy')
),
mapped AS (
  SELECT
    rs.section_id,
    rs.exam_id,
    q.n AS order_index,
    q.n + 25 AS display_no,
    CASE
      WHEN q.n BETWEEN 1 AND 10 THEN 'A'
      WHEN q.n BETWEEN 11 AND 20 THEN 'B'
      ELSE 'C'
    END AS section_code,
    CASE
      WHEN q.n BETWEEN 1 AND 10 THEN 'passage_' || rs.section_id || '_A'
      WHEN q.n BETWEEN 11 AND 20 THEN 'passage_' || rs.section_id || '_B'
      ELSE 'passage_' || rs.section_id || '_C'
    END AS passage_id,
    CASE
      WHEN q.n BETWEEN 1 AND 10 THEN 'P1'
      WHEN q.n BETWEEN 11 AND 20 THEN 'P' || (q.n - 10)
      WHEN q.n BETWEEN 21 AND 25 THEN 'P' || (((q.n - 21) % 3) + 1)
      ELSE 'P' || (((q.n - 26) % 3) + 4)
    END AS paragraph_id,
    CASE
      WHEN q.n BETWEEN 1 AND 10 THEN 'section_a'
      WHEN q.n BETWEEN 11 AND 20 THEN 'section_b'
      ELSE 'section_c'
    END AS section_tag,
    CASE
      WHEN q.n BETWEEN 1 AND 10 THEN ((rs.theme_seed + 0) % 6)
      WHEN q.n BETWEEN 11 AND 20 THEN ((rs.theme_seed + 1) % 6)
      ELSE ((rs.theme_seed + 2) % 6)
    END AS theme_seed
  FROM reading_sections rs
  JOIN q
)
SELECT
  'question_' || section_id || '_' || printf('%02d', order_index) AS id,
  section_id,
  passage_id,
  NULL AS audio_file_id,
  'single_choice' AS question_type,
  order_index,
  json_object(
    'raw',
    CASE
      WHEN section_code = 'A' THEN 'Section A Q' || display_no || '. Choose the best word for blank ' || order_index || '.'
      WHEN section_code = 'B' THEN 'Section B Q' || display_no || '. Which paragraph contains the stated information?'
      ELSE 'Section C Q' || display_no || '. Choose the best answer according to the careful-reading passage.'
    END,
    'html',
    '<p>' ||
    CASE
      WHEN section_code = 'A' THEN 'Section A Q' || display_no || '. Choose the best word for blank ' || order_index || '.'
      WHEN section_code = 'B' THEN 'Section B Q' || display_no || '. Which paragraph contains the stated information?'
      ELSE 'Section C Q' || display_no || '. Choose the best answer according to the careful-reading passage.'
    END ||
    '</p>'
  ) AS question_text_json,
  json_array(
    json_object('key', 'A', 'text', CASE WHEN section_code = 'A' THEN 'available' WHEN section_code = 'B' THEN paragraph_id ELSE 'Correct answer' END),
    json_object('key', 'B', 'text', CASE WHEN section_code = 'A' THEN 'ordinary' WHEN section_code = 'B' THEN 'P' || (((order_index + 1) % 10) + 1) ELSE 'Distractor one' END),
    json_object('key', 'C', 'text', CASE WHEN section_code = 'A' THEN 'rapid' WHEN section_code = 'B' THEN 'P' || (((order_index + 2) % 10) + 1) ELSE 'Distractor two' END),
    json_object('key', 'D', 'text', CASE WHEN section_code = 'A' THEN 'complex' WHEN section_code = 'B' THEN 'P' || (((order_index + 3) % 10) + 1) ELSE 'Distractor three' END)
  ) AS options_json,
  json_quote('A') AS correct_answer_json,
  json_object(
    'raw',
    'The answer is linked to ' || paragraph_id || ' in the ' || section_tag || ' passage about ' || themes.theme_name || '.',
    'html',
    '<p>The answer is linked to ' || paragraph_id || ' in the ' || section_tag || ' passage about ' || themes.theme_name || '.</p>'
  ) AS explanation_json,
  NULL AS audio_start_time,
  NULL AS audio_end_time,
  '' AS transcript,
  json_object(
    'passage_id',
    json_object('$oid', passage_id),
    'paragraph_ids',
    json_array(paragraph_id),
    'evidence_text',
    'Evidence is located in ' || paragraph_id || '.'
  ) AS passage_ref_json,
  json_array('reading', section_tag, themes.theme_name) AS tags_json,
  3 AS difficulty,
  1.1667 AS score,
  json_object(
    'source_question_no',
    'R-' || display_no,
    'generated_by',
    'fix_all_reading.sql'
  ) AS import_meta_json,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM mapped
JOIN themes ON themes.seed = mapped.theme_seed;

COMMIT;

-- Validation queries.
SELECT
  e.id AS exam_id,
  e.title,
  COUNT(DISTINCT p.id) AS reading_passages,
  COUNT(DISTINCT q.id) AS reading_questions
FROM exams e
JOIN sections s ON s.exam_id = e.id AND s.section_type = 'reading'
LEFT JOIN passages p ON p.section_id = s.id
LEFT JOIN questions q ON q.section_id = s.id
GROUP BY e.id
HAVING reading_passages <> 3 OR reading_questions <> 30;
