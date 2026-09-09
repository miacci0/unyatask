"use client";

import { useEffect, useRef, useState } from "react";
import { Shippori_Mincho, Zen_Kaku_Gothic_New } from "next/font/google";
import { useRoutineData } from "@/lib/useRoutineData";
import { useDragReorder } from "@/lib/dragReorder";

// 月のルーティン(独立アプリ版)の本体UI。
//
// 元になったデザイン(Artifact「月のルーティン」)の見た目・機能をほぼそのまま踏襲。
// データ層は lib/useRoutineData.js 経由でSupabase(routine_tasks / routine_categories /
// routine_logs、Googleログインでuser_idごとに分離)に保存する。Animator Workspaceとは
// 同じSupabaseプロジェクト(同じGoogleアカウント)を使うが、コード・デプロイは完全に独立。

const shippori = Shippori_Mincho({ subsets: ["latin"], weight: ["400", "500", "600", "800"], variable: "--routine-font-serif" });
const zenKaku = Zen_Kaku_Gothic_New({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--routine-font-sans" });

const WD = ["日", "月", "火", "水", "木", "金", "土"];
const MOONS = ["🌑", "🌒", "🌓", "🌔", "🌕"];
const MOON_TITLES = ["0%(未着手)", "25%", "50%", "75%", "100%(完了)"];
const CATEGORY_COLORS = ["rose", "amber", "moss", "sky", "lavender", "clay", "teal", "slate"];
const LEVEL_OPTIONS = [
  { value: "unset", label: "— 未記録" },
  { value: "0", label: "🌑 0%" },
  { value: "1", label: "🌒 25%" },
  { value: "2", label: "🌓 50%" },
  { value: "3", label: "🌔 75%" },
  { value: "4", label: "🌕 100%" },
  { value: "skip", label: "🌙 今日は不要" },
];

function pad(n) {
  return String(n).padStart(2, "0");
}
function toDateStr(y, m, d) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
function todayStr() {
  const t = new Date();
  return toDateStr(t.getFullYear(), t.getMonth(), t.getDate());
}
function parseDateStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function weekdayOf(dateStr) {
  return parseDateStr(dateStr).getDay();
}
function isApplicable(task, dateStr) {
  if (task.startDate && dateStr < task.startDate) return false;
  if (task.type === "daily") return true;
  if (task.type === "weekly") return (task.daysOfWeek || []).includes(weekdayOf(dateStr));
  if (task.type === "once") return task.date === dateStr;
  return false;
}
function freqLabel(task) {
  if (task.type === "daily") return "毎日";
  if (task.type === "weekly") {
    const days = (task.daysOfWeek || []).slice().sort().map(d => WD[d]).join("・");
    return `週${(task.daysOfWeek || []).length}(${days || "-"})`;
  }
  if (task.type === "once") {
    const d = parseDateStr(task.date);
    return `単発 ${d.getMonth() + 1}/${d.getDate()}`;
  }
  return "";
}
function formatDayTitle(dateStr) {
  const d = parseDateStr(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})の記録`;
}
function formatMonthDay2(dateStr) {
  const d = parseDateStr(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}(${WD[weekdayOf(dateStr)]})`;
}
// タスクの表示順。タスク管理モーダルでのドラッグ並び替え(sortOrder)を基準にし、
// (原理上あり得ないはずだが)値が無いタスクは作成日順でフォールバックして末尾側に回す。
function compareTaskOrder(a, b) {
  const ao = typeof a.sortOrder === "number" ? a.sortOrder : Infinity;
  const bo = typeof b.sortOrder === "number" ? b.sortOrder : Infinity;
  if (ao !== bo) return ao - bo;
  return (a.createdAt || "").localeCompare(b.createdAt || "");
}

export default function RoutineApp() {
  const routine = useRoutineData();

  // 「今日」に依存する初期状態(何年何月を開くか・今日のセルをどれにするか)はSSR時と
  // ハイドレーション時とでサーバー/クライアントのタイムゾーンがずれると食い違い、
  // Reactのハイドレーションエラーになりうる。AuthGate(session===undefinedの間は
  // どちらの環境でも同じ「読み込み中…」を出す)と同じ考え方で、mount後にだけ
  // クライアント側のnew Date()を反映する。
  const [mounted, setMounted] = useState(false);
  const [currentYear, setCurrentYear] = useState(0);
  const [currentMonth, setCurrentMonth] = useState(0);
  const [selectedDate, setSelectedDate] = useState("");
  useEffect(() => {
    const t = new Date();
    setCurrentYear(t.getFullYear());
    setCurrentMonth(t.getMonth());
    setSelectedDate(todayStr());
    setMounted(true);
  }, []);

  // 日々の記録(routine_logs)は全期間を一度に読み込むと際限なく増えるため、
  // 表示中の月が変わるたびに(すでに取得済みでなければ)その月分だけ読み込む。
  // routine自体は毎レンダー新しいオブジェクトなので、依存配列にはuseCallbackで安定した
  // 参照であるensureMonthLoadedだけを入れる(routineを入れると年月が変わっていなくても
  // 毎レンダー発火してしまう)。
  const { ensureMonthLoaded } = routine;
  useEffect(() => {
    if (!mounted) return;
    ensureMonthLoaded(currentYear, currentMonth);
  }, [mounted, currentYear, currentMonth, ensureMonthLoaded]);

  const [view, setView] = useState("calendar");
  const [tableCategoryFilter, setTableCategoryFilter] = useState(null); // null=all, "__none__", or category id

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("daily");
  const [formWeekdays, setFormWeekdays] = useState([]);
  const [formDate, setFormDate] = useState(selectedDate);
  const [formCategoryId, setFormCategoryId] = useState(null);

  const [catAddOpen, setCatAddOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [catColor, setCatColor] = useState(CATEGORY_COLORS[0]);
  const [editingCategoryId, setEditingCategoryId] = useState(null); // null = 新規作成フォーム, idならそのカテゴリの編集フォーム

  const [toast, setToast] = useState("");
  const toastTimerRef = useRef(null);
  const importInputRef = useRef(null);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 3400);
  }
  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  const { tasks, categories, logs } = routine;

  // タスク管理モーダルのドラッグ並び替え。sortedAllTasksは(読み込み中の早期returnより前に
  // Hooksを呼ぶ必要があるため)ここで計算しておく。他の画面(日別パネル・表ビュー)は
  // ドラッグできないが、表示順は同じcompareTaskOrderで揃える。
  const sortedAllTasks = tasks.slice().sort(compareTaskOrder);
  const { dragId, previewIds, registerRef, handlePointerDown } = useDragReorder({
    ids: sortedAllTasks.map(t => t.id),
    onCommit: orderedIds => routine.reorderTasks(orderedIds),
  });
  const tasksById = new Map(sortedAllTasks.map(t => [t.id, t]));
  const displayTasks = previewIds ? previewIds.map(id => tasksById.get(id)).filter(Boolean) : sortedAllTasks;

  function tasksForDate(dateStr) {
    return tasks.filter(t => isApplicable(t, dateStr)).sort(compareTaskOrder);
  }
  function entryFor(dateStr, taskId) {
    const log = logs[dateStr];
    if (!log || !log.entries) return null;
    return log.entries[taskId] || null;
  }
  function computeDayStats(dateStr) {
    const applicable = tasksForDate(dateStr);
    let activeCount = 0,
      sum = 0,
      hasOnce = false;
    applicable.forEach(t => {
      if (t.type === "once") hasOnce = true;
      const e = entryFor(dateStr, t.id);
      if (e && e.skipped) return;
      activeCount++;
      if (e && typeof e.level === "number") sum += e.level;
    });
    const avgPct = activeCount ? Math.round((sum / (activeCount * 4)) * 100) : null;
    return { total: applicable.length, active: activeCount, avgPct, hasOnce };
  }
  function categoryOf(task) {
    return task && task.category ? categories.find(c => c.id === task.category) || null : null;
  }
  function catDot(task) {
    const cat = categoryOf(task);
    return cat ? <span className={`cat-dot swatch-${cat.colorKey}`} /> : null;
  }

  // ---------------- 月移動・今日にもどる ----------------
  function goPrevMonth() {
    setCurrentMonth(m => {
      if (m === 0) {
        setCurrentYear(y => y - 1);
        return 11;
      }
      return m - 1;
    });
  }
  function goNextMonth() {
    setCurrentMonth(m => {
      if (m === 11) {
        setCurrentYear(y => y + 1);
        return 0;
      }
      return m + 1;
    });
  }
  function goToday() {
    const t = new Date();
    setCurrentYear(t.getFullYear());
    setCurrentMonth(t.getMonth());
    setSelectedDate(todayStr());
  }

  // ---------------- 記録の更新 ----------------
  function setLevel(dateStr, taskId, level) {
    routine.setLogEntry(dateStr, taskId, { level, skipped: false });
  }
  function toggleSkip(dateStr, taskId, currentlySkipped) {
    routine.setLogEntry(dateStr, taskId, currentlySkipped ? { level: null, skipped: false } : { level: null, skipped: true });
  }
  function applyCellSelection(dateStr, taskId, value) {
    if (value === "unset") routine.setLogEntry(dateStr, taskId, { level: null, skipped: false });
    else if (value === "skip") routine.setLogEntry(dateStr, taskId, { level: null, skipped: true });
    else routine.setLogEntry(dateStr, taskId, { level: Number(value), skipped: false });
  }
  function requestDeleteTask(t) {
    if (confirm(`「${t.name}」を削除しますか?`)) routine.deleteTask(t.id);
  }

  // ---------------- タスク管理モーダル / フォーム ----------------
  function resetForm() {
    setEditingTaskId(null);
    setFormName("");
    setFormType("daily");
    setFormWeekdays([]);
    setFormDate(selectedDate);
    setFormCategoryId(null);
    setCatAddOpen(false);
    setEditingCategoryId(null);
  }
  function loadTaskIntoForm(t) {
    setEditingTaskId(t.id);
    setFormName(t.name);
    setFormType(t.type);
    setFormWeekdays(t.daysOfWeek || []);
    setFormDate(t.date || selectedDate);
    setFormCategoryId(t.category || null);
    setCatAddOpen(false);
    setEditingCategoryId(null);
  }
  function openModal(prefillOnce) {
    resetForm();
    if (prefillOnce) {
      setFormType("once");
      setFormDate(selectedDate);
    }
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
  }
  function toggleWeekday(idx) {
    setFormWeekdays(prev => (prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx]));
  }
  function saveTaskFromForm() {
    const name = formName.trim();
    if (!name) {
      alert("タスク名を入力してください");
      return;
    }
    if (formType === "weekly" && formWeekdays.length === 0) {
      alert("曜日を1つ以上選んでください");
      return;
    }
    if (formType === "once" && !formDate) {
      alert("日付を選んでください");
      return;
    }
    const patch = {
      name,
      type: formType,
      daysOfWeek: formType === "weekly" ? formWeekdays : null,
      date: formType === "once" ? formDate : null,
      category: formCategoryId || null,
    };
    if (editingTaskId) routine.updateTask(editingTaskId, patch);
    else routine.addTask(patch);
    resetForm();
  }
  function requestDeleteCategory(cat) {
    if (confirm(`カテゴリ「${cat.name}」を削除しますか?(タスクからカテゴリ設定のみ外れます)`)) {
      if (formCategoryId === cat.id) setFormCategoryId(null);
      if (editingCategoryId === cat.id) setCatAddOpen(false);
      routine.deleteCategory(cat.id);
    }
  }
  function openCatAddForm() {
    setEditingCategoryId(null);
    setCatName("");
    setCatColor(CATEGORY_COLORS[0]);
    setCatAddOpen(true);
  }
  function openCatEditForm(cat) {
    setEditingCategoryId(cat.id);
    setCatName(cat.name);
    setCatColor(cat.colorKey);
    setCatAddOpen(true);
  }
  async function confirmCatForm() {
    const name = catName.trim();
    if (!name) {
      alert("カテゴリ名を入力してください");
      return;
    }
    const colorKey = catColor || CATEGORY_COLORS[0];
    if (editingCategoryId) {
      const ok = await routine.updateCategory(editingCategoryId, { name, colorKey });
      if (!ok) {
        showToast("カテゴリの更新に失敗しました");
        return;
      }
    } else {
      const id = await routine.addCategory(name, colorKey);
      if (id) setFormCategoryId(id);
    }
    setCatAddOpen(false);
    setEditingCategoryId(null);
  }

  // ---------------- エクスポート / インポート ----------------
  async function exportData() {
    let allLogs;
    try {
      allLogs = await routine.fetchAllLogs();
    } catch (e) {
      console.error("export: fetchAllLogs failed", e);
      showToast("エクスポートに失敗しました");
      return;
    }
    const payload = {
      app: "moon-routine",
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks,
      categories,
      logs: allLogs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `routine-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("ファイルを書き出しました");
  }
  function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let payload;
      try {
        payload = JSON.parse(String(reader.result));
      } catch {
        showToast("ファイルの読み込みに失敗しました");
        return;
      }
      if (!payload || !Array.isArray(payload.tasks) || !Array.isArray(payload.categories) || typeof payload.logs !== "object" || payload.logs === null) {
        showToast("ファイルの形式が正しくありません");
        return;
      }
      if (!confirm("現在のタスク・カテゴリ・記録をすべて、このファイルの内容で置き換えます。よろしいですか?")) return;
      const ok = await routine.replaceAll({ tasks: payload.tasks, categories: payload.categories, logs: payload.logs });
      showToast(ok ? "データを読み込みました" : "読み込みに失敗しました");
    };
    reader.onerror = () => showToast("ファイルの読み込みに失敗しました");
    reader.readAsText(file);
  }

  if (!mounted || routine.loading) {
    return (
      <div className={`routine-root ${shippori.variable} ${zenKaku.variable}`}>
        <style dangerouslySetInnerHTML={{ __html: ROUTINE_CSS }} />
        <div className="loading-state">読み込み中…</div>
      </div>
    );
  }

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDow = new Date(currentYear, currentMonth, 1).getDay();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push({ dnum: daysInPrevMonth - firstDow + 1 + i, outside: true });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ dnum: d, outside: false, dateStr: toDateStr(currentYear, currentMonth, d) });
  while (cells.length % 7 !== 0) cells.push({ dnum: cells.length - (firstDow + daysInMonth) + 1, outside: true });
  const tStr = todayStr();

  const dayTasks = tasksForDate(selectedDate);

  const tableRows = tasks
    .filter(t => {
      if (tableCategoryFilter === null) return true;
      if (tableCategoryFilter === "__none__") return !t.category;
      return t.category === tableCategoryFilter;
    })
    .filter(t => {
      if (t.type === "once") {
        const d = parseDateStr(t.date);
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
      }
      return true;
    })
    .sort(compareTaskOrder);
  const hasUncategorized = tasks.some(t => !t.category);

  return (
    <div className={`routine-root ${shippori.variable} ${zenKaku.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: ROUTINE_CSS }} />
      <div id="routine-app">
        <div className="app-header">
          <h1>
            <span className="moon-mark">🌗</span>月のルーティン
          </h1>
          <button className="icon-btn" onClick={() => openModal(false)}>
            ⚙ タスク管理
          </button>
        </div>

        <div className="view-tabs">
          <button className={"view-tab" + (view === "calendar" ? " active" : "")} onClick={() => setView("calendar")}>
            🌙 カレンダー
          </button>
          <button className={"view-tab" + (view === "table" ? " active" : "")} onClick={() => setView("table")}>
            📋 一覧(表)
          </button>
        </div>

        <div className="month-nav">
          <button onClick={goPrevMonth} aria-label="前の月">
            ‹
          </button>
          <span className="month-label">
            {currentYear}年{currentMonth + 1}月
          </span>
          <button onClick={goNextMonth} aria-label="次の月">
            ›
          </button>
        </div>
        <div className="today-link" onClick={goToday}>
          今日にもどる
        </div>

        {view === "calendar" && (
          <div>
            <div className="weekday-row">
              {WD.map(w => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="calendar-grid">
              {cells.map((c, i) => {
                if (c.outside) return <div key={i} className="day-cell outside" />;
                const stats = computeDayStats(c.dateStr);
                const pct = stats.avgPct == null ? 0 : stats.avgPct;
                const glowOpacity = stats.total > 0 ? (0.06 + (pct / 100) * 0.4).toFixed(2) : 0;
                const idx = Math.max(0, Math.min(4, Math.round((pct / 100) * 4)));
                const cls = "day-cell" + (c.dateStr === tStr ? " is-today" : "") + (c.dateStr === selectedDate ? " selected" : "");
                return (
                  <div key={i} className={cls} onClick={() => setSelectedDate(c.dateStr)}>
                    <div className="glow" style={{ "--g": glowOpacity }} />
                    <div className="date-num">{c.dnum}</div>
                    {stats.total > 0 && <div className="moon-indicator">{MOONS[idx]}</div>}
                    {stats.hasOnce && <div className="once-badge">✦</div>}
                  </div>
                );
              })}
            </div>

            <div className="legend">
              <span>🌑 0%</span>
              <span>🌒 25%</span>
              <span>🌓 50%</span>
              <span>🌔 75%</span>
              <span>🌕 100%</span>
              <span>✦ その日限定</span>
            </div>

            <div className="day-panel">
              <h2>{formatDayTitle(selectedDate)}</h2>
              <div>
                {dayTasks.length === 0 ? (
                  <div className="empty-state">
                    この日に予定されているタスクはまだありません。
                    <br />
                    「＋ この日だけのタスクを追加」か、タスク管理から毎日・週次のタスクを登録できます。
                  </div>
                ) : (
                  dayTasks.map(t => {
                    const entry = entryFor(selectedDate, t.id) || {};
                    return (
                      <div key={t.id} className={"task-row" + (entry.skipped ? " skipped" : "")}>
                        <div className="task-info">
                          <span className="t-name">
                            {catDot(t)}
                            {t.name}
                          </span>
                          <span className="t-freq">{freqLabel(t)}</span>
                        </div>
                        <div className="task-controls">
                          <div className="moon-picker">
                            {MOONS.map((m, idx2) => (
                              <button
                                key={idx2}
                                className={"moon-btn" + (!entry.skipped && entry.level === idx2 ? " active" : "")}
                                title={MOON_TITLES[idx2]}
                                onClick={() => setLevel(selectedDate, t.id, idx2)}
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                          <button className={"skip-btn" + (entry.skipped ? " active" : "")} onClick={() => toggleSkip(selectedDate, t.id, entry.skipped)}>
                            {entry.skipped ? "戻す" : "今日は不要"}
                          </button>
                          {t.type === "once" && (
                            <button className="row-del" title="このタスクを削除" onClick={() => requestDeleteTask(t)}>
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <button className="add-oneoff" onClick={() => openModal(true)}>
                ＋ この日だけのタスクを追加
              </button>
            </div>
          </div>
        )}

        {view === "table" && (
          <div>
            <div className="cat-chip-row" style={{ marginBottom: 14 }}>
              <div className={"cat-chip" + (tableCategoryFilter === null ? " selected" : "")} onClick={() => setTableCategoryFilter(null)}>
                すべて
              </div>
              {categories.map(cat => (
                <div key={cat.id} className={"cat-chip" + (tableCategoryFilter === cat.id ? " selected" : "")} onClick={() => setTableCategoryFilter(cat.id)}>
                  <span className={`cat-dot swatch-${cat.colorKey}`} />
                  {cat.name}
                </div>
              ))}
              {hasUncategorized && (
                <div className={"cat-chip" + (tableCategoryFilter === "__none__" ? " selected" : "")} onClick={() => setTableCategoryFilter("__none__")}>
                  未分類
                </div>
              )}
            </div>
            <div className="table-wrap">
              <table id="tasks-table">
                <thead>
                  <tr>
                    <th className="task-col">タスク</th>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                      const dateStr = toDateStr(currentYear, currentMonth, d);
                      return (
                        <th key={d} className="day-col" style={dateStr === tStr ? { color: "var(--accent)" } : undefined}>
                          <div>{d}</div>
                          <div style={{ fontSize: 9 }}>{WD[weekdayOf(dateStr)]}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.length === 0 ? (
                    <tr>
                      <td colSpan={daysInMonth + 1} className="empty-state">
                        この月に表示できるタスクがありません
                      </td>
                    </tr>
                  ) : (
                    tableRows.map(t => {
                      const cat = categoryOf(t);
                      return (
                        <tr key={t.id}>
                          <td
                            className="task-col-cell"
                            style={
                              cat
                                ? { borderLeft: `4px solid var(--cat-${cat.colorKey})`, background: `rgba(var(--cat-${cat.colorKey}-rgb),0.10)` }
                                : { borderLeft: "4px solid transparent" }
                            }
                          >
                            <div style={{ fontSize: 14 }}>{t.name}</div>
                          </td>
                          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                            const dateStr = toDateStr(currentYear, currentMonth, d);
                            if (!isApplicable(t, dateStr)) {
                              return (
                                <td key={d}>
                                  <div className="cell-wrap">
                                    <div className="cell-display dash">・</div>
                                  </div>
                                </td>
                              );
                            }
                            const entry = entryFor(dateStr, t.id) || {};
                            const currentValue = entry.skipped ? "skip" : typeof entry.level === "number" ? String(entry.level) : "unset";
                            return (
                              <td key={d}>
                                <div className="cell-wrap">
                                  <div className="cell-display">{entry.skipped ? "➖" : typeof entry.level === "number" ? MOONS[entry.level] : "○"}</div>
                                  <select
                                    className="cell-select"
                                    title={formatMonthDay2(dateStr) + " の達成度"}
                                    value={currentValue}
                                    onChange={e => applyCellSelection(dateStr, t.id, e.target.value)}
                                  >
                                    {LEVEL_OPTIONS.map(opt => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="storage-note">
          {routine.saveStatus === "syncing"
            ? "保存中…"
            : routine.saveStatus === "error"
            ? "保存に失敗しました。しばらくしてから再読み込みしてください"
            : routine.loadFailed
            ? "読み込みに失敗しました。再読み込みしてください"
            : "Googleアカウントに保存されています"}
        </div>
      </div>

      <div className={"toast" + (toast ? " show" : "")}>{toast}</div>

      {modalOpen && (
        <div
          className="modal-overlay"
          onClick={e => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="modal">
            <div className="modal-head">
              <h2>タスク管理</h2>
              <button className="close-x" onClick={closeModal}>
                ✕
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
              <button className="icon-btn" style={{ flex: 1, justifyContent: "center" }} onClick={exportData}>
                ⬇ エクスポート
              </button>
              <button className="icon-btn" style={{ flex: 1, justifyContent: "center" }} onClick={() => importInputRef.current?.click()}>
                ⬆ インポート
              </button>
              <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportFile} />
            </div>

            <div>
              {displayTasks.length === 0 ? (
                <div className="empty-state" style={{ padding: "6px 0 16px" }}>
                  まだタスクがありません
                </div>
              ) : (
                displayTasks.map(t => {
                  const isDragging = dragId === t.id;
                  return (
                    <div
                      key={t.id}
                      data-row-id={t.id}
                      ref={registerRef(t.id)}
                      className="task-list-item"
                      style={
                        isDragging
                          ? {
                              // transformはuseDragReorder側でDOMへ直接書き込むため、ここでは指定しない。
                              opacity: 0.85,
                              zIndex: 50,
                              position: "relative",
                              pointerEvents: "none",
                              boxShadow: "0 12px 28px rgba(0,0,0,0.25)",
                              transition: "none",
                            }
                          : undefined
                      }
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <div className="drag-handle" title="ドラッグして並べ替え" onPointerDown={e => handlePointerDown(e, t.id)}>
                          ⋮⋮
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="t-name">
                            {catDot(t)}
                            {t.name}
                          </div>
                          <div className="t-freq">{freqLabel(t)}</div>
                        </div>
                      </div>
                      <div className="actions">
                        <button onClick={() => loadTaskIntoForm(t)}>編集</button>
                        <button className="del-btn" onClick={() => requestDeleteTask(t)}>
                          削除
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="form-section">
              <h3>{editingTaskId ? `編集:${formName || ""}` : "＋ 新しいタスク"}</h3>
              <div className="field">
                <label htmlFor="routine-f-name">タスク名</label>
                <input id="routine-f-name" type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="例:作画練習" />
              </div>
              <div className="field">
                <label>頻度</label>
                <div className="radio-group">
                  {[
                    ["daily", "毎日"],
                    ["weekly", "週次"],
                    ["once", "単発(この日限定)"],
                  ].map(([val, label]) => (
                    <label key={val} className={formType === val ? "checked" : ""}>
                      <input type="radio" checked={formType === val} onChange={() => setFormType(val)} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              {formType === "weekly" && (
                <div className="field">
                  <label>曜日を選択</label>
                  <div className="weekday-picker">
                    {WD.map((w, idx) => (
                      <label key={idx} className={formWeekdays.includes(idx) ? "checked" : ""}>
                        <input type="checkbox" checked={formWeekdays.includes(idx)} onChange={() => toggleWeekday(idx)} />
                        {w}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {formType === "once" && (
                <div className="field">
                  <label htmlFor="routine-f-date">実施日</label>
                  <input id="routine-f-date" type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
                </div>
              )}
              <div className="field">
                <label>カテゴリ(任意)</label>
                <div className="cat-chip-row">
                  <div className={"cat-chip" + (formCategoryId === null ? " selected" : "")} onClick={() => setFormCategoryId(null)}>
                    未設定
                  </div>
                  {categories.map(cat => (
                    <div key={cat.id} className={"cat-chip" + (formCategoryId === cat.id ? " selected" : "")} onClick={() => setFormCategoryId(cat.id)}>
                      <span className={`cat-dot swatch-${cat.colorKey}`} />
                      {cat.name}
                      <span
                        className="cat-edit"
                        title="カテゴリを編集"
                        onClick={e => {
                          e.stopPropagation();
                          openCatEditForm(cat);
                        }}
                      >
                        ✎
                      </span>
                      <span
                        className="cat-x"
                        onClick={e => {
                          e.stopPropagation();
                          requestDeleteCategory(cat);
                        }}
                      >
                        ✕
                      </span>
                    </div>
                  ))}
                  <div className="cat-chip" onClick={openCatAddForm}>
                    ＋ 新規
                  </div>
                </div>
                {catAddOpen && (
                  <div className="cat-add-form">
                    <input type="text" value={catName} onChange={e => setCatName(e.target.value)} placeholder="カテゴリ名(例:仕事)" autoFocus />
                    <div className="cat-swatches">
                      {CATEGORY_COLORS.map(key => (
                        <button
                          key={key}
                          type="button"
                          className={"cat-swatch swatch-" + key + (catColor === key ? " selected" : "")}
                          onClick={() => setCatColor(key)}
                        />
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="btn-primary" style={{ flex: "none", padding: "8px 16px", fontSize: 13 }} onClick={confirmCatForm}>
                        {editingCategoryId ? "更新" : "追加"}
                      </button>
                      <button type="button" className="btn-secondary" style={{ padding: "8px 16px", fontSize: 13 }} onClick={() => { setCatAddOpen(false); setEditingCategoryId(null); }}>
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="form-actions">
                <button className="btn-primary" onClick={saveTaskFromForm}>
                  保存
                </button>
                <button className="btn-secondary" onClick={resetForm}>
                  クリア
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ROUTINE_CSS = `
.routine-root{
  --bg:#F6F4EF; --surface:#FFFFFF; --surface-2:#EFECE4; --border:#DEDACF;
  --text:#1B1A17; --text-dim:#7A7568; --accent:#A87A2C; --accent-rgb:168,122,44; --accent-ink:#FFFFFF;
  --danger:#A24B41; --shadow:0 1px 2px rgba(20,18,12,0.06); --radius:14px;
  --cat-rose:#B5636B; --cat-amber:#B8863A; --cat-moss:#6E8C5A; --cat-sky:#4C7EA6;
  --cat-lavender:#7C6BA6; --cat-clay:#B06A45; --cat-teal:#3E8C86; --cat-slate:#5B6270;
  --cat-rose-rgb:181,99,107; --cat-amber-rgb:184,134,58; --cat-moss-rgb:110,140,90; --cat-sky-rgb:76,126,166;
  --cat-lavender-rgb:124,107,166; --cat-clay-rgb:176,106,69; --cat-teal-rgb:62,140,134; --cat-slate-rgb:91,98,112;
  background:var(--bg); color:var(--text);
  font-family:var(--routine-font-sans),'Hiragino Sans','Yu Gothic',sans-serif;
  line-height:1.6; -webkit-font-smoothing:antialiased; min-height:100vh;
}
@media (prefers-color-scheme: dark){
  .routine-root{
    --bg:#0B0B0E; --surface:#151519; --surface-2:#1D1D23; --border:#2C2C34;
    --text:#EDEBE4; --text-dim:#8F8C86; --accent:#D9B872; --accent-rgb:217,184,114; --accent-ink:#171208;
    --danger:#D98A79; --shadow:0 1px 3px rgba(0,0,0,0.4);
    --cat-rose:#E39BA3; --cat-amber:#E3BD78; --cat-moss:#A3C98A; --cat-sky:#8FC1E8;
    --cat-lavender:#B9A8E0; --cat-clay:#E3A67D; --cat-teal:#7FCFC7; --cat-slate:#9AA3B5;
    --cat-rose-rgb:227,155,163; --cat-amber-rgb:227,189,120; --cat-moss-rgb:163,201,138; --cat-sky-rgb:143,193,232;
    --cat-lavender-rgb:185,168,224; --cat-clay-rgb:227,166,125; --cat-teal-rgb:127,207,199; --cat-slate-rgb:154,163,181;
  }
}
.routine-root *{ box-sizing:border-box; }
.routine-root h1, .routine-root h2, .routine-root h3{ font-family:var(--routine-font-serif),'Hiragino Mincho ProN',serif; font-weight:600; margin:0; }
.routine-root button{ font-family:inherit; }
.routine-root button:focus-visible, .routine-root input:focus-visible, .routine-root [tabindex]:focus-visible{ outline:2px solid var(--accent); outline-offset:2px; }
.routine-root .loading-state{ min-height:60vh; display:flex; align-items:center; justify-content:center; color:var(--text-dim); font-size:13.5px; }

#routine-app{ max-width:920px; margin:0 auto; padding:28px 20px 80px; }

.routine-root .app-header{ display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:22px; }
.routine-root .app-header h1{ font-size:22px; letter-spacing:0.02em; }
.routine-root .app-header .moon-mark{ display:inline-block; margin-right:8px; }
.routine-root .icon-btn{
  background:var(--surface); border:1px solid var(--border); color:var(--text); border-radius:10px;
  padding:9px 14px; font-size:14px; cursor:pointer; display:inline-flex; align-items:center; gap:6px;
  box-shadow:var(--shadow); transition:background 0.15s ease, transform 0.1s ease;
}
.routine-root .icon-btn:hover{ background:var(--surface-2); }
.routine-root .icon-btn:active{ transform:scale(0.97); }

.routine-root .month-nav{ display:flex; align-items:center; justify-content:center; gap:18px; margin-bottom:16px; }
.routine-root .month-nav button{
  background:transparent; border:1px solid var(--border); color:var(--text); width:34px; height:34px;
  border-radius:50%; cursor:pointer; font-size:15px; display:flex; align-items:center; justify-content:center;
  transition:background 0.15s ease;
}
.routine-root .month-nav button:hover{ background:var(--surface-2); }
.routine-root .month-nav .month-label{ font-family:var(--routine-font-serif),serif; font-size:19px; min-width:150px; text-align:center; }
.routine-root .today-link{
  display:block; text-align:center; font-size:12.5px; color:var(--text-dim); margin-bottom:18px;
  cursor:pointer; text-decoration:underline; text-underline-offset:3px;
}

.routine-root .weekday-row, .routine-root .calendar-grid{ display:grid; grid-template-columns:repeat(7,1fr); gap:6px; }
.routine-root .weekday-row{ margin-bottom:6px; }
.routine-root .weekday-row span{ text-align:center; font-size:12px; color:var(--text-dim); padding-bottom:2px; }
.routine-root .day-cell{
  position:relative; aspect-ratio:1/1; border:1px solid var(--border); border-radius:12px; background:var(--surface);
  cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;
  overflow:hidden; transition:border-color 0.15s ease, transform 0.1s ease;
}
.routine-root .day-cell:hover{ border-color:var(--accent); }
.routine-root .day-cell:active{ transform:scale(0.96); }
.routine-root .day-cell.outside{ opacity:0.32; cursor:default; }
.routine-root .day-cell.selected{ border-color:var(--accent); box-shadow:0 0 0 2px rgba(var(--accent-rgb),0.35); }
.routine-root .day-cell.is-today .date-num{ color:var(--accent); font-weight:700; }
.routine-root .day-cell .glow{
  position:absolute; inset:0; background:radial-gradient(circle at 50% 38%, rgba(var(--accent-rgb),var(--g,0)) 0%, rgba(var(--accent-rgb),0) 72%);
  pointer-events:none;
}
.routine-root .day-cell .date-num{ font-size:13px; z-index:1; font-variant-numeric:tabular-nums; }
.routine-root .day-cell .moon-indicator{ font-size:15px; line-height:1; z-index:1; }
.routine-root .day-cell .once-badge{ position:absolute; top:4px; right:6px; font-size:9px; z-index:1; color:var(--accent); }

.routine-root .legend{ display:flex; justify-content:center; gap:14px; flex-wrap:wrap; margin:18px 0 26px; font-size:11.5px; color:var(--text-dim); }
.routine-root .legend span{ display:inline-flex; align-items:center; gap:4px; }

.routine-root .day-panel{ background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:20px 20px 22px; box-shadow:var(--shadow); }
.routine-root .day-panel h2{ font-size:17px; margin-bottom:14px; }
.routine-root .task-row{ display:flex; align-items:center; justify-content:space-between; gap:14px; padding:12px 0; border-bottom:1px solid var(--border); flex-wrap:wrap; }
.routine-root .task-row:last-of-type{ border-bottom:none; }
.routine-root .task-info{ display:flex; flex-direction:column; gap:3px; min-width:120px; flex:1 1 140px; }
.routine-root .task-info .t-name{ font-size:14.5px; display:flex; align-items:center; }
.routine-root .task-info .t-freq{ font-size:11px; color:var(--text-dim); }
.routine-root .task-controls{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.routine-root .moon-picker{ display:flex; gap:4px; }
.routine-root .moon-btn{
  background:var(--surface-2); border:1px solid var(--border); border-radius:9px; width:34px; height:34px; font-size:16px;
  cursor:pointer; display:flex; align-items:center; justify-content:center; opacity:0.5;
  transition:opacity 0.15s ease, transform 0.1s ease, border-color 0.15s ease;
}
.routine-root .moon-btn:hover{ opacity:0.85; }
.routine-root .moon-btn.active{ opacity:1; border-color:var(--accent); background:rgba(var(--accent-rgb),0.14); transform:scale(1.06); }
.routine-root .skip-btn{ background:transparent; border:1px solid var(--border); color:var(--text-dim); border-radius:8px; padding:7px 10px; font-size:12px; cursor:pointer; white-space:nowrap; }
.routine-root .skip-btn.active{ color:var(--text); border-color:var(--text-dim); background:var(--surface-2); }
.routine-root .row-del{ background:transparent; border:none; color:var(--text-dim); cursor:pointer; font-size:14px; padding:4px 6px; }
.routine-root .row-del:hover{ color:var(--danger); }
.routine-root .task-row.skipped .moon-picker{ opacity:0.3; pointer-events:none; }

.routine-root .empty-state{ text-align:center; padding:26px 10px 10px; color:var(--text-dim); font-size:13.5px; }

.routine-root .add-oneoff{
  margin-top:14px; background:transparent; border:1px dashed var(--border); color:var(--text-dim); border-radius:10px;
  padding:10px; width:100%; cursor:pointer; font-size:13px;
}
.routine-root .add-oneoff:hover{ color:var(--text); border-color:var(--text-dim); }

.routine-root .modal-overlay{ position:fixed; inset:0; background:rgba(10,9,6,0.45); display:flex; align-items:flex-end; justify-content:center; z-index:50; }
@media (min-width:640px){ .routine-root .modal-overlay{ align-items:center; } }
.routine-root .modal{ background:var(--surface); border:1px solid var(--border); width:100%; max-width:520px; max-height:88vh; overflow-y:auto; border-radius:18px 18px 0 0; padding:22px 22px 28px; }
@media (min-width:640px){ .routine-root .modal{ border-radius:18px; } }
.routine-root .modal-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
.routine-root .modal-head h2{ font-size:17px; }
.routine-root .close-x{ background:transparent; border:none; font-size:20px; color:var(--text-dim); cursor:pointer; line-height:1; }
.routine-root .task-list-item{ display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border); gap:10px; }
.routine-root .task-list-item .t-name{ font-size:14px; display:flex; align-items:center; }
.routine-root .task-list-item .t-freq{ font-size:11px; color:var(--text-dim); }
.routine-root .task-list-item .actions{ display:flex; gap:6px; flex-shrink:0; }
.routine-root .task-list-item button{ background:var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:5px 9px; font-size:12px; cursor:pointer; color:var(--text); }
.routine-root .task-list-item button.del-btn:hover{ color:var(--danger); border-color:var(--danger); }
.routine-root .drag-handle{
  flex-shrink:0; display:flex; align-items:center; justify-content:center;
  width:28px; height:32px; padding:4px; margin-left:-4px;
  color:var(--text-dim); font-size:13px; letter-spacing:-2px; line-height:1;
  cursor:grab; touch-action:none; user-select:none;
}
.routine-root .drag-handle:active{ cursor:grabbing; }

.routine-root .form-section{ margin-top:18px; }
.routine-root .form-section h3{ font-size:14px; margin-bottom:10px; color:var(--text-dim); font-weight:500; }
.routine-root .field{ margin-bottom:14px; }
.routine-root .field label{ display:block; font-size:12.5px; color:var(--text-dim); margin-bottom:6px; }
.routine-root .field input[type=text], .routine-root .field input[type=date]{
  width:100%; background:var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:10px 12px; color:var(--text); font-size:14px;
}
.routine-root .radio-group{ display:flex; gap:8px; flex-wrap:wrap; }
.routine-root .radio-group label{ display:inline-flex; align-items:center; gap:6px; border:1px solid var(--border); border-radius:20px; padding:7px 13px; font-size:13px; cursor:pointer; color:var(--text-dim); }
.routine-root .radio-group input{ display:none; }
.routine-root .radio-group label.checked{ border-color:var(--accent); color:var(--text); background:rgba(var(--accent-rgb),0.12); }
.routine-root .weekday-picker{ display:flex; gap:6px; flex-wrap:wrap; }
.routine-root .weekday-picker label{ width:38px; height:38px; border:1px solid var(--border); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; cursor:pointer; color:var(--text-dim); }
.routine-root .weekday-picker input{ display:none; }
.routine-root .weekday-picker label.checked{ border-color:var(--accent); background:rgba(var(--accent-rgb),0.16); color:var(--text); }
.routine-root .form-actions{ display:flex; gap:10px; margin-top:18px; }
.routine-root .btn-primary{ background:var(--accent); color:var(--accent-ink); border:none; border-radius:9px; padding:11px 18px; font-size:14px; font-weight:600; cursor:pointer; flex:1; }
.routine-root .btn-secondary{ background:transparent; border:1px solid var(--border); color:var(--text-dim); border-radius:9px; padding:11px 18px; font-size:14px; cursor:pointer; }
.routine-root .hidden{ display:none !important; }
.routine-root .storage-note{ text-align:center; font-size:11px; color:var(--text-dim); margin-top:26px; opacity:0.7; }
.routine-root .toast{
  position:fixed; left:50%; bottom:20px; transform:translateX(-50%) translateY(10px); background:var(--surface); border:1px solid var(--border);
  color:var(--text); padding:10px 16px; border-radius:10px; font-size:13px; box-shadow:var(--shadow); opacity:0; pointer-events:none;
  transition:opacity 0.25s ease, transform 0.25s ease; z-index:100; max-width:82vw; text-align:center;
}
.routine-root .toast.show{ opacity:1; transform:translateX(-50%) translateY(0); }

.routine-root .view-tabs{ display:flex; justify-content:center; gap:8px; margin-bottom:18px; }
.routine-root .view-tab{ background:transparent; border:1px solid var(--border); border-radius:20px; padding:8px 16px; font-size:13px; cursor:pointer; color:var(--text-dim); }
.routine-root .view-tab.active{ border-color:var(--accent); color:var(--text); background:rgba(var(--accent-rgb),0.12); }

.routine-root .swatch-rose{ background:var(--cat-rose); } .routine-root .swatch-amber{ background:var(--cat-amber); }
.routine-root .swatch-moss{ background:var(--cat-moss); } .routine-root .swatch-sky{ background:var(--cat-sky); }
.routine-root .swatch-lavender{ background:var(--cat-lavender); } .routine-root .swatch-clay{ background:var(--cat-clay); }
.routine-root .swatch-teal{ background:var(--cat-teal); } .routine-root .swatch-slate{ background:var(--cat-slate); }

.routine-root .cat-dot{ width:9px; height:9px; border-radius:50%; display:inline-block; flex-shrink:0; margin-right:6px; }
.routine-root .cat-chip-row{ display:flex; flex-wrap:wrap; gap:8px; }
.routine-root .cat-chip{ display:inline-flex; align-items:center; gap:2px; border:1px solid var(--border); border-radius:20px; padding:6px 12px; font-size:12.5px; cursor:pointer; color:var(--text-dim); background:var(--surface); }
.routine-root .cat-chip.selected{ border-color:var(--accent); color:var(--text); background:rgba(var(--accent-rgb),0.10); }
.routine-root .cat-chip .cat-edit{ margin-left:4px; color:var(--text-dim); font-size:11px; }
.routine-root .cat-chip .cat-edit:hover{ color:var(--accent); }
.routine-root .cat-chip .cat-x{ margin-left:4px; color:var(--text-dim); font-size:11px; }
.routine-root .cat-chip .cat-x:hover{ color:var(--danger); }
.routine-root .cat-swatches{ display:flex; gap:8px; flex-wrap:wrap; margin:4px 0 12px; }
.routine-root .cat-swatch{ width:26px; height:26px; border-radius:50%; cursor:pointer; border:2px solid transparent; padding:0; }
.routine-root .cat-swatch.selected{ border-color:var(--text); }
.routine-root .cat-add-form{ margin-top:10px; padding:12px; border:1px dashed var(--border); border-radius:10px; }
.routine-root .cat-add-form input[type=text]{ width:100%; background:var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:9px 11px; color:var(--text); font-size:13.5px; }

.routine-root .table-wrap{ overflow-x:auto; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); box-shadow:var(--shadow); }
.routine-root #tasks-table{ border-collapse:collapse; width:max-content; min-width:100%; }
.routine-root #tasks-table th, .routine-root #tasks-table td{ border-bottom:1px solid var(--border); text-align:center; padding:0; }
.routine-root #tasks-table thead th{ padding:8px 4px 6px; font-size:11px; color:var(--text-dim); font-weight:500; background:var(--surface); position:sticky; top:0; z-index:3; }
.routine-root th.task-col{ position:sticky; left:0; z-index:4; text-align:left; padding:8px 14px 8px 12px !important; min-width:180px; border-right:1px solid var(--border); background:var(--surface); }
.routine-root td.task-col-cell{ position:sticky; left:0; z-index:2; background:var(--surface); text-align:left; padding:9px 14px 9px 12px; min-width:180px; border-right:1px solid var(--border); }
.routine-root .day-col{ width:36px; }
.routine-root .cell-wrap{ position:relative; width:36px; height:38px; }
.routine-root .cell-display{ width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:14px; color:var(--text); pointer-events:none; }
.routine-root .cell-display.dash{ color:var(--border); font-size:11px; }
.routine-root .cell-select{ position:absolute; inset:0; width:100%; height:100%; opacity:0; border:none; cursor:pointer; font-size:14px; }
.routine-root .cell-wrap:hover .cell-display:not(.dash){ background:var(--surface-2); }
.routine-root #tasks-table tbody tr:nth-child(even) td{ background-image:linear-gradient(rgba(127,127,127,0.045),rgba(127,127,127,0.045)); }
`;
