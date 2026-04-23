export interface Env {
  DB: D1Database;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
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
  due_count: number;
  new_count: number;
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
  easiness: number;
  interval_days: number;
  repetitions: number;
  learning_step: number;
  lapses: number;
  correct_count: number;
  incorrect_count: number;
  due_at: string;
  last_studied: string | null;
  introduced_at: string;
}

export interface StudyWord extends Word {
  easiness: number;
  interval_days: number;
  repetitions: number;
  learning_step: number;
  lapses: number;
  correct_count: number;
  incorrect_count: number;
  due_at: string | null;
  is_new: boolean;
  is_learning: boolean;
  is_review: boolean;
  // internal sorting fields stripped before response
  priority?: number;
}
