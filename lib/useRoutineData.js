"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// タスク・カテゴリ・日々の記録をSupabase(routine_tasks / routine_categories / routine_logs、
// すべてRLSでuser_idごとに分離)に読み書きするデータ層。
//
// タスク・カテゴリは行単位のテーブルなので、素朴な insert/update/delete をそのまま使う
// (個人利用でほぼ競合しないため、Animator Workspace本体のapp_dataのような楽観ロックは
// 持たせていない)。日々の記録(routine_logs)だけは「1日1行にその日の全タスク分の記録を
// entries jsonbでまとめる」形なので、複数セルを続けて操作したときに後勝ちで丸ごと
// 上書きしないよう、サーバー側でjsonbマージするRPC(set_routine_log_entry)を使う。
//
// 記録(logs)は全期間を一度に読み込むと際限なく増えるため、表示中の月だけを
// ensureMonthLoaded(year, month)で都度読み込み、取得済みの月はキャッシュする。
// エクスポート時だけは全期間が必要になるので、その場で全件を取得する。

function pad(n) {
  return String(n).padStart(2, "0");
}
function monthRange(year, month) {
  const start = `${year}-${pad(month + 1)}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const end = `${year}-${pad(month + 1)}-${pad(lastDay)}`;
  return { start, end };
}
function rowsToLogsMap(rows) {
  const map = {};
  for (const row of rows) {
    map[row.date] = { date: row.date, entries: row.entries || {} };
  }
  return map;
}
function taskFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    daysOfWeek: row.days_of_week || null,
    date: row.date,
    category: row.category,
    startDate: row.start_date,
    createdAt: row.created_at,
  };
}
function categoryFromRow(row) {
  return { id: row.id, name: row.name, colorKey: row.color_key, createdAt: row.created_at };
}

export function useRoutineData() {
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [logs, setLogs] = useState({}); // dateStr -> { date, entries }
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | syncing | error

  const loadedMonthsRef = useRef(new Set()); // "YYYY-M" already fetched

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ data: catRows, error: catErr }, { data: taskRows, error: taskErr }] = await Promise.all([
          supabase.from("routine_categories").select("*").order("created_at"),
          supabase.from("routine_tasks").select("*").order("created_at"),
        ]);
        if (catErr) throw catErr;
        if (taskErr) throw taskErr;
        if (cancelled) return;
        setCategories((catRows || []).map(categoryFromRow));
        setTasks((taskRows || []).map(taskFromRow));
      } catch (e) {
        console.error("routine initial load failed", e);
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ensureMonthLoaded = useCallback(async (year, month) => {
    const key = `${year}-${month}`;
    if (loadedMonthsRef.current.has(key)) return;
    loadedMonthsRef.current.add(key);
    const { start, end } = monthRange(year, month);
    const { data, error } = await supabase.from("routine_logs").select("*").gte("date", start).lte("date", end);
    if (error) {
      console.error("routine logs load failed", error);
      loadedMonthsRef.current.delete(key); // 失敗時は再試行できるようにしておく
      return;
    }
    setLogs(prev => ({ ...prev, ...rowsToLogsMap(data || []) }));
  }, []);

  const addTask = useCallback(async ({ name, type, daysOfWeek, date, category }) => {
    setStatus("syncing");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStatus("error");
      return null;
    }
    const payload = {
      user_id: user.id,
      name,
      type,
      days_of_week: type === "weekly" ? daysOfWeek : null,
      date: type === "once" ? date : null,
      category: category || null,
      // 過去の日にさかのぼって突然タスクが増えたように見えないよう、作成日を開始日にする。
      start_date: new Date().toISOString().slice(0, 10),
    };
    const { data, error } = await supabase.from("routine_tasks").insert(payload).select().single();
    if (error) {
      console.error("addTask failed", error);
      setStatus("error");
      return null;
    }
    setTasks(prev => [...prev, taskFromRow(data)]);
    setStatus("idle");
    return data.id;
  }, []);

  const updateTask = useCallback(async (id, patch) => {
    setStatus("syncing");
    const dbPatch = {};
    if ("name" in patch) dbPatch.name = patch.name;
    if ("type" in patch) dbPatch.type = patch.type;
    if ("daysOfWeek" in patch) dbPatch.days_of_week = patch.daysOfWeek;
    if ("date" in patch) dbPatch.date = patch.date;
    if ("category" in patch) dbPatch.category = patch.category;
    // 楽観的にローカルへ反映してから送信する(体感の速さのため)。失敗時はトーストで知らせるのみ
    // (個人利用で低頻度な操作のため、厳密なロールバックまでは行わない)。
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)));
    const { error } = await supabase.from("routine_tasks").update(dbPatch).eq("id", id);
    if (error) {
      console.error("updateTask failed", error);
      setStatus("error");
      return;
    }
    setStatus("idle");
  }, []);

  const deleteTask = useCallback(async id => {
    setStatus("syncing");
    setTasks(prev => prev.filter(t => t.id !== id));
    const { error } = await supabase.from("routine_tasks").delete().eq("id", id);
    if (error) {
      console.error("deleteTask failed", error);
      setStatus("error");
      return;
    }
    setStatus("idle");
  }, []);

  const addCategory = useCallback(async (name, colorKey) => {
    setStatus("syncing");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStatus("error");
      return null;
    }
    const { data, error } = await supabase
      .from("routine_categories")
      .insert({ user_id: user.id, name, color_key: colorKey })
      .select()
      .single();
    if (error) {
      console.error("addCategory failed", error);
      setStatus("error");
      return null;
    }
    setCategories(prev => [...prev, categoryFromRow(data)]);
    setStatus("idle");
    return data.id;
  }, []);

  const deleteCategory = useCallback(async id => {
    setStatus("syncing");
    setCategories(prev => prev.filter(c => c.id !== id));
    setTasks(prev => prev.map(t => (t.category === id ? { ...t, category: null } : t)));
    // routine_tasks.category は on delete set null なので、カテゴリ削除だけでタスク側は
    // サーバー側も自動的にnullになる(上のsetTasksはローカル表示を即座に合わせるため)。
    const { error } = await supabase.from("routine_categories").delete().eq("id", id);
    if (error) {
      console.error("deleteCategory failed", error);
      setStatus("error");
      return;
    }
    setStatus("idle");
  }, []);

  const setLogEntry = useCallback(async (dateStr, taskId, entry) => {
    setStatus("syncing");
    setLogs(prev => {
      const prevLog = prev[dateStr] || { date: dateStr, entries: {} };
      return { ...prev, [dateStr]: { date: dateStr, entries: { ...prevLog.entries, [taskId]: entry } } };
    });
    const { error } = await supabase.rpc("set_routine_log_entry", { p_date: dateStr, p_task_id: taskId, p_entry: entry });
    if (error) {
      console.error("setLogEntry failed", error);
      setStatus("error");
      return;
    }
    setStatus("idle");
  }, []);

  // エクスポート用に全期間の記録を取得する(通常の表示では月単位でしか読み込まないため)。
  const fetchAllLogs = useCallback(async () => {
    const { data, error } = await supabase.from("routine_logs").select("*");
    if (error) throw error;
    return rowsToLogsMap(data || []);
  }, []);

  // インポート:既存の全データをこのアカウント分だけ削除し、ファイルの内容で置き換える。
  const replaceAll = useCallback(async ({ tasks: importTasks, categories: importCategories, logs: importLogs }) => {
    setStatus("syncing");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("ログインしていません");

      const [{ data: existingTasks }, { data: existingCategories }, { data: existingLogs }] = await Promise.all([
        supabase.from("routine_tasks").select("id"),
        supabase.from("routine_categories").select("id"),
        supabase.from("routine_logs").select("date"),
      ]);
      if (existingTasks?.length) await supabase.from("routine_tasks").delete().in("id", existingTasks.map(r => r.id));
      if (existingLogs?.length) await supabase.from("routine_logs").delete().in("date", existingLogs.map(r => r.date));
      if (existingCategories?.length) await supabase.from("routine_categories").delete().in("id", existingCategories.map(r => r.id));

      // カテゴリを先に作り直し、旧id→新idの対応表を作る(タスク側のcategory参照を貼り替えるため)。
      const catIdMap = new Map();
      let newCategories = [];
      if (importCategories?.length) {
        const { data, error } = await supabase
          .from("routine_categories")
          .insert(importCategories.map(c => ({ user_id: user.id, name: c.name, color_key: c.colorKey })))
          .select();
        if (error) throw error;
        data.forEach((row, i) => catIdMap.set(importCategories[i].id, row.id));
        newCategories = data.map(categoryFromRow);
      }

      // タスクも同様に作り直し、旧taskId→新taskIdの対応表を作る(logsのentriesキーを貼り替えるため)。
      const taskIdMap = new Map();
      let newTasks = [];
      if (importTasks?.length) {
        const { data, error } = await supabase
          .from("routine_tasks")
          .insert(
            importTasks.map(t => ({
              user_id: user.id,
              name: t.name,
              type: t.type,
              days_of_week: t.daysOfWeek || null,
              date: t.date || null,
              category: t.category ? catIdMap.get(t.category) || null : null,
              start_date: t.startDate || new Date().toISOString().slice(0, 10),
            }))
          )
          .select();
        if (error) throw error;
        data.forEach((row, i) => taskIdMap.set(importTasks[i].id, row.id));
        newTasks = data.map(taskFromRow);
      }

      const logDates = Object.keys(importLogs || {});
      if (logDates.length) {
        const rows = logDates.map(dateStr => {
          const remapped = {};
          const entries = importLogs[dateStr]?.entries || {};
          for (const oldTaskId of Object.keys(entries)) {
            const newTaskId = taskIdMap.get(oldTaskId);
            if (newTaskId) remapped[newTaskId] = entries[oldTaskId];
          }
          return { user_id: user.id, date: dateStr, entries: remapped };
        });
        const { error } = await supabase.from("routine_logs").insert(rows);
        if (error) throw error;
      }

      setCategories(newCategories);
      setTasks(newTasks);
      loadedMonthsRef.current = new Set();
      const merged = {};
      logDates.forEach(dateStr => {
        const entries = importLogs[dateStr]?.entries || {};
        const remapped = {};
        for (const oldTaskId of Object.keys(entries)) {
          const newTaskId = taskIdMap.get(oldTaskId);
          if (newTaskId) remapped[newTaskId] = entries[oldTaskId];
        }
        merged[dateStr] = { date: dateStr, entries: remapped };
      });
      setLogs(merged);
      setStatus("idle");
      return true;
    } catch (e) {
      console.error("replaceAll (import) failed", e);
      setStatus("error");
      return false;
    }
  }, []);

  return {
    loading,
    loadFailed,
    saveStatus: status,
    tasks,
    categories,
    logs,
    ensureMonthLoaded,
    addTask,
    updateTask,
    deleteTask,
    addCategory,
    deleteCategory,
    setLogEntry,
    fetchAllLogs,
    replaceAll,
  };
}
