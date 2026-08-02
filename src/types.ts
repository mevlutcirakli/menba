export type IngestMode = 'hybrid' | 'questions-only' | 'topics-only';

export interface Source {
  id: string;
  user_id?: string;
  title: string;
  description?: string;
  content: string;
  file_type?: string;
  created_at: string;
  updated_at?: string;
  topics_count?: number;
  questions_count?: number;
}

export interface Topic {
  id: string;
  source_id: string;
  name: string;
  description?: string;
  importance?: number; // 1-5
  mastery_level?: number; // 0-100%
  created_at?: string;
}

export interface Question {
  id: string;
  source_id: string;
  topic_id?: string;
  topic_name?: string;
  question_text: string;
  options: string[]; // 4 options
  correct_option_index: number;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  created_at?: string;
}

export interface UserProgress {
  id?: string;
  user_id?: string;
  topic_id: string;
  topic_name: string;
  total_answered: number;
  correct_count: number;
  accuracy: number;
  last_studied_at: string;
}

export interface QuizAttempt {
  question: Question;
  selected_option_index: number | null;
  is_correct: boolean;
  time_spent_seconds: number;
}

export interface QuizSessionResult {
  source_id: string;
  source_title: string;
  total_questions: number;
  correct_answers: number;
  score_percentage: number;
  time_taken_seconds: number;
  attempts: QuizAttempt[];
  date: string;
}
