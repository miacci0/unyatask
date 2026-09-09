-- Supabaseの SQL Editor でそのまま実行してください。
--
-- UnyaTask(独立アプリ版)用のテーブル。Animator Workspaceと同じSupabaseプロジェクトの
-- 既存 auth.users(Googleログイン)をそのまま使うが、テーブルはこのアプリ専用に新規作成する
-- (Animator Workspace側のapp_dataテーブルとは一切共有しない)。
--
-- 【設計方針】
-- Animator Workspace側のapp_data(1キーに全データをJSONで丸ごと保存・楽観ロック)とは違い、
-- この独立アプリではタスク・カテゴリを行単位のテーブルにしている(個人利用でほぼ競合しない
-- ため、素朴な行単位のinsert/update/deleteで十分と判断)。日々の記録(routine_logs)だけは
-- 「1日1行、その日の全タスク分の記録をentries jsonbにまとめる」形にし、複数セルを同時に
-- 触ってもRPC(set_routine_log_entry)でサーバー側にjsonbマージさせることで競合を避ける。

create table if not exists routine_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color_key text not null,
  created_at timestamptz not null default now()
);

create table if not exists routine_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('daily', 'weekly', 'once')),
  days_of_week int[],
  date date,
  category uuid references routine_categories(id) on delete set null,
  start_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists routine_logs (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  entries jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table routine_categories enable row level security;
alter table routine_tasks enable row level security;
alter table routine_logs enable row level security;

create policy "select own routine_categories" on routine_categories for select using (auth.uid() = user_id);
create policy "insert own routine_categories" on routine_categories for insert with check (auth.uid() = user_id);
create policy "update own routine_categories" on routine_categories for update using (auth.uid() = user_id);
create policy "delete own routine_categories" on routine_categories for delete using (auth.uid() = user_id);

create policy "select own routine_tasks" on routine_tasks for select using (auth.uid() = user_id);
create policy "insert own routine_tasks" on routine_tasks for insert with check (auth.uid() = user_id);
create policy "update own routine_tasks" on routine_tasks for update using (auth.uid() = user_id);
create policy "delete own routine_tasks" on routine_tasks for delete using (auth.uid() = user_id);

create policy "select own routine_logs" on routine_logs for select using (auth.uid() = user_id);
create policy "insert own routine_logs" on routine_logs for insert with check (auth.uid() = user_id);
create policy "update own routine_logs" on routine_logs for update using (auth.uid() = user_id);
create policy "delete own routine_logs" on routine_logs for delete using (auth.uid() = user_id);

-- 1セル分の記録(達成度 or スキップ)をサーバー側でjsonbマージするRPC。
-- 「その日の記録行を丸ごと読んで書き戻す」方式だと、同時に別のセルを触った場合に
-- 後勝ちで上書きしてしまう恐れがあるため、Postgres側でentries列を部分マージする。
create or replace function set_routine_log_entry(p_date date, p_task_id text, p_entry jsonb)
returns void
language sql
security invoker
as $$
  insert into routine_logs (user_id, date, entries, updated_at)
  values (auth.uid(), p_date, jsonb_build_object(p_task_id, p_entry), now())
  on conflict (user_id, date)
  do update set
    entries = routine_logs.entries || jsonb_build_object(p_task_id, p_entry),
    updated_at = now();
$$;
