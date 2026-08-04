export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

/**
 * Konunun kaynagi. 'ingest' = kaynak islenirken otomatik cikarildi,
 * 'manual' = kullanici "Yeni Konu" akisindan ekledi. Yalnizca 'manual'
 * konular silinebilir (bkz. migration 0006).
 */
export type TopicOrigin = 'ingest' | 'manual';

export interface Database {
    public: {
        Tables: {
            question_logs: {
                Row: {
                    id: string;
                    user_id: string;
                    question_id: string;
                    is_correct: boolean;
                    answered_at: string | null;
                    time_spent_seconds: number | null;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    question_id: string;
                    is_correct: boolean;
                    answered_at?: string;
                    time_spent_seconds?: number | null;
                };
                Update: Partial<Database['public']['Tables']['question_logs']['Insert']>;
                Relationships: [];
            };
            questions: {
                Row: {
                    id: string;
                    topic_id: string;
                    question_text: string;
                    options: Json;
                    correct_answer: string;
                    explanation: string | null;
                    difficulty: number | null;
                    created_at: string | null;
                };
                Insert: {
                    id?: string;
                    topic_id: string;
                    question_text: string;
                    options: Json;
                    correct_answer: string;
                    explanation?: string | null;
                    difficulty?: number;
                    created_at?: string;
                };
                Update: Partial<Database['public']['Tables']['questions']['Insert']>;
                Relationships: [];
            };
            sources: {
                Row: {
                    id: string;
                    user_id: string;
                    title: string;
                    content_text: string;
                    source_type: string;
                    created_at: string | null;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    title: string;
                    content_text: string;
                    source_type?: string;
                    created_at?: string;
                };
                Update: Partial<Database['public']['Tables']['sources']['Insert']>;
                Relationships: [];
            };
            topics: {
                Row: {
                    id: string;
                    source_id: string;
                    name: string;
                    origin: TopicOrigin;
                    created_at: string | null;
                };
                Insert: {
                    id?: string;
                    source_id: string;
                    name: string;
                    origin?: TopicOrigin;
                    created_at?: string;
                };
                Update: Partial<Database['public']['Tables']['topics']['Insert']>;
                Relationships: [];
            };
            user_progress: {
                Row: {
                    user_id: string;
                    topic_id: string;
                    total_attempts: number | null;
                    correct_attempts: number | null;
                    accuracy: number | null;
                    last_attempted_at: string | null;
                };
                Insert: {
                    user_id: string;
                    topic_id: string;
                    total_attempts?: number;
                    correct_attempts?: number;
                    last_attempted_at?: string | null;
                };
                Update: Partial<Database['public']['Tables']['user_progress']['Insert']>;
                Relationships: [];
            };
        };
        Views: {
            [_ in never]: never;
        };
        Functions: {
            [_ in never]: never;
        };
        Enums: {
            [_ in never]: never;
        };
        CompositeTypes: {
            [_ in never]: never;
        };
    };
}
