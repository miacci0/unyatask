-- Supabaseの SQL Editor でこのファイル単体をそのまま実行してください。
--
-- タスクをドラッグで並べ替えられるようにするための列。既存の行は作成日(created_at)順を
-- 初期値としてそのまま引き継ぐ(バックフィル)。

alter table routine_tasks add column if not exists sort_order integer;

update routine_tasks t
set sort_order = sub.rn
from (
  select id, row_number() over (partition by user_id order by created_at) - 1 as rn
  from routine_tasks
) sub
where t.id = sub.id
  and t.sort_order is null;

alter table routine_tasks alter column sort_order set not null;

-- ドラッグ確定時、並べ替え後の順序(uuid配列)をまとめて1回のトランザクションで反映するRPC。
-- set_routine_log_entry と同じ考え方(security invoker、RLSはそのまま効く)。
create or replace function reorder_routine_tasks(p_ids uuid[])
returns void
language sql
security invoker
as $$
  update routine_tasks t
  set sort_order = x.ord - 1
  from unnest(p_ids) with ordinality as x(id, ord)
  where t.id = x.id;
$$;
