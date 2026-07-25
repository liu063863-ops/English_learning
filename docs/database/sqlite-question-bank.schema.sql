PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('CET4', 'CET6')),
  year INTEGER,
  month INTEGER,
  set_num INTEGER,
  source TEXT NOT NULL DEFAULT 'past_exam',
  source_meta_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(level, year, month, set_num, source)
);

CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  section_type TEXT NOT NULL CHECK (section_type IN ('listening', 'reading', 'translation', 'writing')),
  section_name TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  total_score REAL DEFAULT 0,
  time_limit INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  UNIQUE(exam_id, section_type),
  UNIQUE(exam_id, order_index)
);

CREATE TABLE IF NOT EXISTS audio_files (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  section_id TEXT,
  file_url TEXT NOT NULL,
  duration REAL DEFAULT 0,
  transcript_full TEXT DEFAULT '',
  source_meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL,
  UNIQUE(exam_id, section_id, file_url)
);

CREATE TABLE IF NOT EXISTS passages (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL,
  title TEXT DEFAULT '',
  order_index INTEGER NOT NULL,
  passage_text TEXT NOT NULL,
  paragraph_markers_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  UNIQUE(section_id, order_index)
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL,
  passage_id TEXT,
  audio_file_id TEXT,
  question_type TEXT NOT NULL CHECK (question_type IN ('single_choice', 'multiple_choice', 'blank', 'subjective')),
  order_index INTEGER NOT NULL,
  question_text_json TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  correct_answer_json TEXT DEFAULT NULL,
  explanation_json TEXT NOT NULL DEFAULT '{"raw":"","html":""}',
  audio_start_time REAL,
  audio_end_time REAL,
  transcript TEXT DEFAULT '',
  passage_ref_json TEXT NOT NULL DEFAULT '{}',
  tags_json TEXT NOT NULL DEFAULT '[]',
  difficulty INTEGER DEFAULT 3,
  score REAL DEFAULT 0,
  import_meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  FOREIGN KEY (passage_id) REFERENCES passages(id) ON DELETE SET NULL,
  FOREIGN KEY (audio_file_id) REFERENCES audio_files(id) ON DELETE SET NULL,
  UNIQUE(section_id, order_index)
);

CREATE TABLE IF NOT EXISTS user_answers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exam_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  session_id TEXT,
  answer_json TEXT,
  is_correct INTEGER,
  score_awarded REAL,
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  UNIQUE(user_id, question_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_exams_filter ON exams(status, level, year, month, set_num);
CREATE INDEX IF NOT EXISTS idx_sections_exam ON sections(exam_id, section_type);
CREATE INDEX IF NOT EXISTS idx_questions_section ON questions(section_id, order_index);
CREATE INDEX IF NOT EXISTS idx_passages_section ON passages(section_id, order_index);
CREATE INDEX IF NOT EXISTS idx_audio_exam_section ON audio_files(exam_id, section_id);
CREATE INDEX IF NOT EXISTS idx_user_answers_exam ON user_answers(user_id, exam_id, updated_at);
