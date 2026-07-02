/**
 * Typed representation of the Supabase Postgres schema defined in
 * `supabase/migrations/0001_init.sql`.
 *
 * This is hand-maintained to match the migration. Once the project is linked
 * you can regenerate it with:
 *   supabase gen types typescript --linked > lib/types/database.ts
 */

export type Complexity = "eli5" | "standard" | "advanced";
export type Plan = "free" | "premium";
export type SubscriptionStatus = "none" | "active" | "cancelled" | "past_due";
export type FeedbackCategory = "bug" | "idea" | "confusing" | "other";
export type EmailType = "day3_checkin" | "day7_upgrade";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          plan: Plan;
          subscription_status: SubscriptionStatus;
          subscription_provider: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          plan?: Plan;
          subscription_status?: SubscriptionStatus;
          subscription_provider?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          plan?: Plan;
          subscription_status?: SubscriptionStatus;
          subscription_provider?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      animations: {
        Row: {
          id: string;
          question_hash: string;
          question_text: string;
          complexity: Complexity;
          animation_data: Json;
          summary: string | null;
          created_at: string;
          expires_at: string;
          hit_count: number;
        };
        Insert: {
          id?: string;
          question_hash: string;
          question_text: string;
          complexity: Complexity;
          animation_data: Json;
          summary?: string | null;
          created_at?: string;
          expires_at?: string;
          hit_count?: number;
        };
        Update: {
          id?: string;
          question_hash?: string;
          question_text?: string;
          complexity?: Complexity;
          animation_data?: Json;
          summary?: string | null;
          created_at?: string;
          expires_at?: string;
          hit_count?: number;
        };
        Relationships: [];
      };
      user_history: {
        Row: {
          id: string;
          user_id: string;
          animation_id: string;
          is_favorite: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          animation_id: string;
          is_favorite?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          animation_id?: string;
          is_favorite?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_history_animation_id_fkey";
            columns: ["animation_id"];
            referencedRelation: "animations";
            referencedColumns: ["id"];
          },
        ];
      };
      quiz_results: {
        Row: {
          id: string;
          user_id: string;
          animation_id: string;
          score: number;
          total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          animation_id: string;
          score: number;
          total: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          animation_id?: string;
          score?: number;
          total?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quiz_results_animation_id_fkey";
            columns: ["animation_id"];
            referencedRelation: "animations";
            referencedColumns: ["id"];
          },
        ];
      };
      security_events: {
        Row: {
          id: string;
          event_type: string;
          identifier: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_type: string;
          identifier?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_type?: string;
          identifier?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      feedback: {
        Row: {
          id: string;
          user_id: string | null;
          category: FeedbackCategory;
          message: string;
          page_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          category: FeedbackCategory;
          message: string;
          page_path?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          category?: FeedbackCategory;
          message?: string;
          page_path?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      email_lifecycle: {
        Row: {
          user_id: string;
          email: string | null;
          welcome_sent_at: string | null;
          day3_sent_at: string | null;
          day7_sent_at: string | null;
          unsubscribed_at: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          email?: string | null;
          welcome_sent_at?: string | null;
          day3_sent_at?: string | null;
          day7_sent_at?: string | null;
          unsubscribed_at?: string | null;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          email?: string | null;
          welcome_sent_at?: string | null;
          day3_sent_at?: string | null;
          day7_sent_at?: string | null;
          unsubscribed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      long_form_usage: {
        Row: {
          user_id: string;
          used: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          used?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          used?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      email_responses: {
        Row: {
          id: string;
          user_id: string | null;
          email_type: EmailType;
          response: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          email_type: EmailType;
          response: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          email_type?: EmailType;
          response?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      increment_long_form_used: {
        Args: { uid: string };
        Returns: number;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
