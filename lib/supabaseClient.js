import { createClient } from "@supabase/supabase-js";

// Animator Workspaceと同じSupabaseプロジェクト(同じGoogleログインユーザー)を使う。
// テーブルはこのアプリ専用(routine_*)なので、コード・デプロイは完全に独立している。
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
