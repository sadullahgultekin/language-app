export interface Env {
  DB: D1Database;
}

export interface List {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface ListWithCount extends List {
  word_count: number;
  avg_confidence: number;
}

export interface Word {
  id: number;
  list_id: number;
  word: string;
  translation: string;
  description: string;
  created_at: string;
}

export interface StudyProgress {
  id: number;
  word_id: number;
  correct_count: number;
  incorrect_count: number;
  last_studied: string | null;
  confidence: number;
}

export interface StudyWord extends Word {
  confidence: number;
  correct_count: number;
  incorrect_count: number;
}
