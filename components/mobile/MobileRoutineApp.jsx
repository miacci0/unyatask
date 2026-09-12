"use client";

import { useEffect, useRef, useState } from "react";
import { APP_DESCRIPTION, VERSION_HISTORY } from "@/lib/appContent";
import {
  WD,
  MOONS,
  MOON_TITLES,
  STAMPS,
  CATEGORY_COLORS,
  CATEGORY_COLOR_HEX,
  toDateStr,
  todayStr,
  weekdayOf,
  isApplicable,
  freqLabel,
  formatDayTitle,
  compareTaskOrder,
} from "@/lib/routineShared";

// UnyaTaskのモバイル版UI。Claude Design(claude.ai/design)で作成されたモックアップ
// 「UnyaTask Mobile.dc.html」を元に実装。モックアップのiOS風フレーム・ステータスバー
// (ios-frame.jsx)はClaude Design上でのプレビュー用チュームであり実装対象ではないため、
// 実際のモバイルブラウザ自身のUI(アドレスバー・ステータスバー)にそのまま任せている。
//
// データ・保存処理はすべて親のRoutineApp.jsxから props で受け取る(useRoutineData()は
// 親で1回だけ呼ばれ、デスクトップ/モバイル両方のツリーで共有される)。ここで新しく状態を
// 持つのは「どの画面を表示しているか」というナビゲーション状態(タブ・シート・フルスクリーン
// 画面の開閉)だけで、タスク・カテゴリ・記録そのものはここでは一切状態を持たない
// (=デスクトップ版と機能・データが食い違うことがない)。
//
// 配色は常時ダーク固定(ログイン画面のAuthGate.jsxと同じ考え方。ユーザー確認済み)。
// デスクトップ版のようにOSのライト/ダーク設定には追従しない(値自体はデスクトップの
// ダークモード配色と同一の値を直接使っている)。
//
// 一覧(表)はデスクトップと違い横スクロール前提(列幅はモックアップ通りの固定px)なので、
// デスクトップのようなResizeObserverでの幅計算は不要。並べ替えもデスクトップのドラッグでは
// なく↑↓ボタン(タッチ操作でのドラッグは誤操作しやすいため、モックアップ通りに変更)。

export default function MobileRoutineApp({
  currentYear,
  currentMonth,
  selectedDate,
  setSelectedDate,
  goPrevMonth,
  goNextMonth,
  goToday,
  tasks,
  categories,
  tasksForDate,
  entryFor,
  computeDayStats,
  categoryOf,
  setLevel,
  toggleSkip,
  requestDeleteTask,
  reorderTasks,
  resetForm,
  loadTaskIntoForm,
  saveTaskFromForm,
  editingTaskId,
  formName,
  setFormName,
  formType,
  setFormType,
  formWeekdays,
  toggleWeekday,
  formDate,
  setFormDate,
  formCategoryId,
  setFormCategoryId,
  catAddOpen,
  openCatAddForm,
  openCatEditForm,
  cancelCatForm,
  catName,
  setCatName,
  catColor,
  setCatColor,
  editingCategoryId,
  confirmCatForm,
  requestDeleteCategory,
  tableCategoryFilter,
  setTableCategoryFilter,
  exportData,
  handleImportFile,
  aboutOpen,
  setAboutOpen,
  userEmail,
  onSignOut,
}) {
  const [mobileTab, setMobileTab] = useState("calendar"); // "calendar" | "list" | "tasks"
  const [moreOpen, setMoreOpen] = useState(false);
  const [dayDetailOpen, setDayDetailOpen] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const importInputRef = useRef(null);
  const listScrollRef = useRef(null);

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const monthLabel = `${currentYear}年${currentMonth + 1}月`;
  const tStr = todayStr();

  // 一覧(表)タブを開いたとき・月を移動したときに、今日の列が見える位置まで自動で
  // 横スクロールする(横に長い表なので、開くたびに1日目からで手動でスクロールするのは
  // 手間なため)。
  function scrollListToToday() {
    const el = listScrollRef.current;
    if (!el) return;
    const t = new Date();
    const colW = 68,
      taskColW = 76;
    if (currentYear === t.getFullYear() && currentMonth === t.getMonth()) {
      const idx = t.getDate() - 1;
      const target = idx * colW - (el.clientWidth - taskColW) / 2 + colW / 2;
      el.scrollLeft = Math.max(0, target);
    } else {
      el.scrollLeft = 0;
    }
  }
  useEffect(() => {
    if (mobileTab !== "list") return;
    const id = setTimeout(scrollListToToday, 30);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileTab, currentYear, currentMonth]);

  function openNewTaskForm() {
    resetForm();
    setTaskFormOpen(true);
  }
  function openOnceForm() {
    resetForm();
    setFormType("once");
    setFormDate(selectedDate);
    setTaskFormOpen(true);
  }
  function editTask(t) {
    loadTaskIntoForm(t);
    setTaskFormOpen(true);
  }
  function closeTaskForm() {
    setTaskFormOpen(false);
    resetForm();
  }
  // saveTaskFromFormはバリデーション失敗時にfalseを返す(RoutineApp.jsx参照)。
  // デスクトップはこの戻り値を無視するが、モバイルはフルスクリーンの入力画面を
  // 保存できたときだけ閉じ、失敗時(名前未入力など)は開いたままにして修正できるようにする。
  function handleSave() {
    if (saveTaskFromForm()) setTaskFormOpen(false);
  }

  // タスク管理タブの並べ替え(↑↓)。デスクトップのドラッグ並べ替えと違うUIだが、
  // 最終的にreorderTasks(全件分の新しい順のid配列)を呼ぶ点は同じで、保存先も同じ
  // sort_orderなので機能としては等価。
  function moveTask(id, dir) {
    const sorted = tasks.slice().sort(compareTaskOrder);
    const idx = sorted.findIndex(t => t.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const reordered = sorted.slice();
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    reorderTasks(reordered.map(t => t.id));
  }

  function openDayDetail(dateStr) {
    setSelectedDate(dateStr);
    setDayDetailOpen(true);
  }

  function catDot(task) {
    const cat = categoryOf(task);
    if (!cat) return null;
    return <span className="mrt-cat-dot" style={{ background: CATEGORY_COLOR_HEX[cat.colorKey][0] }} />;
  }

  // ---------------- カレンダー用のセル ----------------
  const firstDow = new Date(currentYear, currentMonth, 1).getDay();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push({ dnum: daysInPrevMonth - firstDow + 1 + i, outside: true });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ dnum: d, outside: false, dateStr: toDateStr(currentYear, currentMonth, d) });
  while (cells.length % 7 !== 0) cells.push({ dnum: cells.length, outside: true });

  const dayTasks = tasksForDate(selectedDate);
  const hasUncategorized = tasks.some(t => !t.category);
  const listTasks = tasks
    .slice()
    .sort(compareTaskOrder)
    .filter(t => (tableCategoryFilter === null ? true : tableCategoryFilter === "__none__" ? !t.category : t.category === tableCategoryFilter));
  const sortedAllTasks = tasks.slice().sort(compareTaskOrder);
  const listDateCols = Array.from({ length: daysInMonth }, (_, i) => toDateStr(currentYear, currentMonth, i + 1));

  // 日別パネル(カレンダータブ)と日別詳細(一覧タブのセルタップで開く全画面)の
  // 両方から使う、1タスク分の行。表示・操作内容はデスクトップの日別パネルと同じ
  // (達成度ボタン・「今日は不要」・単発タスクの削除)。
  function renderDayTaskRow(t, dateStr) {
    const entry = entryFor(dateStr, t.id) || {};
    return (
      <div key={t.id} className={"mrt-task-row" + (entry.skipped ? " skipped" : "")}>
        <div className="mrt-task-row-info">
          <span className="mrt-task-row-name">
            {catDot(t)}
            {t.name}
          </span>
          <span className="mrt-task-row-freq">{freqLabel(t)}</span>
        </div>
        <div className="mrt-task-row-controls">
          <div className="mrt-moon-picker">
            {/* 0%(🌑)は「未記録」と実質同じ表示になるため選択肢から外し、
                25〜100%の4段階だけ選べるようにする(index=1〜4のまま)。 */}
            {MOONS.map((m, idx) => idx === 0 ? null : (
              <button
                key={idx}
                type="button"
                className={"mrt-moon-btn" + (!entry.skipped && entry.level === idx ? " active" : "")}
                title={MOON_TITLES[idx]}
                onClick={() => setLevel(dateStr, t.id, idx)}
              >
                {m}
              </button>
            ))}
          </div>
          <button type="button" className={"mrt-skip-btn" + (entry.skipped ? " active" : "")} onClick={() => toggleSkip(dateStr, t.id, entry.skipped)}>
            {entry.skipped ? "戻す" : "今日は不要"}
          </button>
          {t.type === "once" && (
            <button type="button" className="mrt-row-del" title="このタスクを削除" onClick={() => requestDeleteTask(t)}>
              ✕
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mrt-root">
      <style dangerouslySetInnerHTML={{ __html: MOBILE_CSS }} />

      <div className="mrt-header">
        <div className="mrt-brand">
          <span>✅</span>UnyaTask
        </div>
        <button type="button" className="mrt-more-btn" onClick={() => setMoreOpen(true)} aria-label="メニュー">
          ⋯
        </button>
      </div>

      <div className="mrt-content">
        {mobileTab === "calendar" && (
          <div>
            <div className="mrt-month-nav">
              <button type="button" onClick={goPrevMonth} aria-label="前の月">
                ‹
              </button>
              <span className="mrt-month-label">{monthLabel}</span>
              <button type="button" onClick={goNextMonth} aria-label="次の月">
                ›
              </button>
            </div>
            <div className="mrt-today-link" onClick={goToday}>
              今日にもどる
            </div>

            <div className="mrt-weekday-row">
              {WD.map(w => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="mrt-cal-grid">
              {cells.map((c, i) => {
                if (c.outside) return <div key={i} className="mrt-day-cell outside" />;
                const stats = computeDayStats(c.dateStr);
                const pct = stats.avgPct == null ? 0 : stats.avgPct;
                // stats.total(該当タスク数全て)ではなくstats.active(「今日は不要」を除いた件数)で
                // 判定する。デスクトップのRoutineApp.jsxと同じ考え方(理由もそちら参照)。
                const glowOpacity = stats.active > 0 ? (0.06 + (pct / 100) * 0.4).toFixed(2) : 0;
                const idx = Math.max(0, Math.min(4, Math.round((pct / 100) * 4)));
                const cls = "mrt-day-cell" + (c.dateStr === tStr ? " is-today" : "") + (c.dateStr === selectedDate ? " selected" : "");
                return (
                  <div key={i} className={cls} onClick={() => setSelectedDate(c.dateStr)}>
                    <div className="mrt-day-glow" style={{ "--g": glowOpacity }} />
                    <div className="mrt-day-num">{c.dnum}</div>
                    {stats.active > 0 && <div className="mrt-day-moon">{MOONS[idx]}</div>}
                    {stats.hasOnce && <div className="mrt-day-once">✦</div>}
                  </div>
                );
              })}
            </div>

            <div className="mrt-legend">
              <span>🌑0%</span>
              <span>🌒25%</span>
              <span>🌓50%</span>
              <span>🌔75%</span>
              <span>🌕100%</span>
              <span>✦単発</span>
            </div>

            <div className="mrt-panel">
              <h2>{formatDayTitle(selectedDate)}</h2>
              {dayTasks.length === 0 ? (
                <div className="mrt-empty">
                  この日に予定されているタスクはまだありません。
                  <br />
                  「＋ この日だけのタスクを追加」か、タスク管理から毎日・週次のタスクを登録できます。
                </div>
              ) : (
                dayTasks.map(t => renderDayTaskRow(t, selectedDate))
              )}
              <button type="button" className="mrt-add-oneoff" onClick={openOnceForm}>
                ＋ この日だけのタスクを追加
              </button>
            </div>
          </div>
        )}

        {mobileTab === "list" && (
          <div>
            <div className="mrt-month-nav">
              <button type="button" onClick={goPrevMonth} aria-label="前の月">
                ‹
              </button>
              <span className="mrt-month-label">{monthLabel}</span>
              <button type="button" onClick={goNextMonth} aria-label="次の月">
                ›
              </button>
            </div>
            <div className="mrt-chip-row">
              <div className={"mrt-chip" + (tableCategoryFilter === null ? " selected" : "")} onClick={() => setTableCategoryFilter(null)}>
                すべて
              </div>
              {categories.map(cat => (
                <div key={cat.id} className={"mrt-chip" + (tableCategoryFilter === cat.id ? " selected" : "")} onClick={() => setTableCategoryFilter(cat.id)}>
                  <span className="mrt-cat-dot" style={{ background: CATEGORY_COLOR_HEX[cat.colorKey][0] }} />
                  {cat.name}
                </div>
              ))}
              {hasUncategorized && (
                <div className={"mrt-chip" + (tableCategoryFilter === "__none__" ? " selected" : "")} onClick={() => setTableCategoryFilter("__none__")}>
                  未分類
                </div>
              )}
            </div>
            <div className="mrt-table-wrap" ref={listScrollRef}>
              <table className="mrt-table">
                <colgroup>
                  <col style={{ width: 76 }} />
                  {listDateCols.map(d => (
                    <col key={d} style={{ width: 68 }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className="mrt-th-task">タスク</th>
                    {listDateCols.map(dateStr => (
                      <th key={dateStr} className={"mrt-th-day" + (dateStr === tStr ? " is-today" : "")}>
                        <div className="mrt-th-dnum">{Number(dateStr.slice(8))}</div>
                        <div className="mrt-th-wd">{WD[weekdayOf(dateStr)]}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {listTasks.length === 0 ? (
                    <tr>
                      <td className="mrt-empty" colSpan={daysInMonth + 1}>
                        表示できるタスクがありません
                      </td>
                    </tr>
                  ) : (
                    listTasks.map(t => (
                      <tr key={t.id}>
                        <td className="mrt-td-task">
                          {catDot(t)}
                          {t.name}
                        </td>
                        {listDateCols.map(dateStr => {
                          if (!isApplicable(t, dateStr)) {
                            return (
                              <td key={dateStr} className="mrt-td-day">
                                <div className="mrt-cell-dash">・</div>
                              </td>
                            );
                          }
                          const entry = entryFor(dateStr, t.id) || {};
                          const icon = entry.skipped ? "➖" : typeof entry.level === "number" ? STAMPS[entry.level] : "○";
                          const unsetLike = !entry.skipped && (typeof entry.level !== "number" || entry.level === 0);
                          return (
                            <td key={dateStr} className={"mrt-td-day" + (dateStr === tStr ? " is-today" : "")} onClick={() => openDayDetail(dateStr)}>
                              <div className={"mrt-cell-icon" + (unsetLike ? " unset" : "")}>{icon}</div>
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {mobileTab === "tasks" && (
          <div>
            <div className="mrt-io-row">
              <button type="button" className="mrt-io-btn" onClick={exportData}>
                ⬇ エクスポート
              </button>
              <button type="button" className="mrt-io-btn" onClick={() => importInputRef.current?.click()}>
                ⬆ インポート
              </button>
              <input ref={importInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} style={{ display: "none" }} />
            </div>
            {sortedAllTasks.length === 0 ? (
              <div className="mrt-empty">まだタスクがありません</div>
            ) : (
              sortedAllTasks.map((t, i) => (
                <div key={t.id} className="mrt-tasklist-row">
                  <div className="mrt-tasklist-info">
                    <div className="mrt-task-row-name">
                      {catDot(t)}
                      {t.name}
                    </div>
                    <div className="mrt-task-row-freq">{freqLabel(t)}</div>
                  </div>
                  <div className="mrt-tasklist-actions">
                    <button type="button" disabled={i === 0} onClick={() => moveTask(t.id, -1)} aria-label="上へ">
                      ↑
                    </button>
                    <button type="button" disabled={i === sortedAllTasks.length - 1} onClick={() => moveTask(t.id, 1)} aria-label="下へ">
                      ↓
                    </button>
                    <button type="button" onClick={() => editTask(t)}>
                      編集
                    </button>
                    <button type="button" className="mrt-del-btn" onClick={() => requestDeleteTask(t)}>
                      削除
                    </button>
                  </div>
                </div>
              ))
            )}
            <button type="button" className="mrt-primary-btn" style={{ marginTop: 16 }} onClick={openNewTaskForm}>
              ＋ 新しいタスク
            </button>
          </div>
        )}
      </div>

      <div className="mrt-tabbar">
        <button type="button" className={"mrt-tab" + (mobileTab === "calendar" ? " active" : "")} onClick={() => setMobileTab("calendar")}>
          <div className="mrt-tab-icon">🌙</div>
          <div className="mrt-tab-label">カレンダー</div>
        </button>
        <button type="button" className={"mrt-tab" + (mobileTab === "list" ? " active" : "")} onClick={() => setMobileTab("list")}>
          <div className="mrt-tab-icon">📋</div>
          <div className="mrt-tab-label">一覧</div>
        </button>
        <button type="button" className={"mrt-tab" + (mobileTab === "tasks" ? " active" : "")} onClick={() => setMobileTab("tasks")}>
          <div className="mrt-tab-icon">⚙</div>
          <div className="mrt-tab-label">タスク管理</div>
        </button>
      </div>

      {dayDetailOpen && (
        <div className="mrt-overlay">
          <div className="mrt-overlay-head">
            <button type="button" className="mrt-back-btn" onClick={() => setDayDetailOpen(false)}>
              ‹
            </button>
            <h2>{formatDayTitle(selectedDate)}</h2>
            <div className="mrt-head-spacer" />
          </div>
          <div className="mrt-overlay-scroll">
            {dayTasks.length === 0 ? (
              <div className="mrt-empty">この日に予定されているタスクはまだありません。</div>
            ) : (
              dayTasks.map(t => renderDayTaskRow(t, selectedDate))
            )}
            <button
              type="button"
              className="mrt-add-oneoff"
              onClick={() => {
                setDayDetailOpen(false);
                openOnceForm();
              }}
            >
              ＋ この日だけのタスクを追加
            </button>
          </div>
        </div>
      )}

      {moreOpen && (
        <div className="mrt-sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="mrt-sheet" onClick={e => e.stopPropagation()}>
            <div className="mrt-sheet-email">{userEmail}</div>
            <button
              type="button"
              className="mrt-sheet-item"
              onClick={() => {
                setMoreOpen(false);
                setAboutOpen(true);
              }}
            >
              このアプリについて
            </button>
            <button
              type="button"
              className="mrt-sheet-item danger"
              onClick={() => {
                setMoreOpen(false);
                onSignOut();
              }}
            >
              ログアウト
            </button>
          </div>
        </div>
      )}

      {aboutOpen && (
        <div className="mrt-overlay">
          <div className="mrt-overlay-head">
            <h2>このアプリについて</h2>
            <button type="button" className="mrt-close-btn" onClick={() => setAboutOpen(false)}>
              ✕
            </button>
          </div>
          <div className="mrt-overlay-scroll">
            <p className="mrt-about-desc">{APP_DESCRIPTION}</p>
            <h3 className="mrt-about-heading">リリースノート</h3>
            {VERSION_HISTORY.map(v => (
              <div key={v.version} className="mrt-about-version">
                <div className="mrt-about-version-head">
                  v{v.version}
                  <span className="mrt-about-version-date">({v.date})</span>
                </div>
                <ul>
                  {v.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {taskFormOpen && (
        <div className="mrt-overlay">
          <div className="mrt-overlay-head">
            <button type="button" className="mrt-back-btn" onClick={closeTaskForm}>
              ‹
            </button>
            <h2>{editingTaskId ? `編集:${formName || ""}` : "＋ 新しいタスク"}</h2>
            <div className="mrt-head-spacer" />
          </div>
          <div className="mrt-overlay-scroll">
            <div className="mrt-field">
              <label>タスク名</label>
              <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="例:作画練習" />
            </div>
            <div className="mrt-field">
              <label>頻度</label>
              <div className="mrt-chip-row">
                {[
                  ["daily", "毎日"],
                  ["weekly", "週次"],
                  ["once", "単発(この日限定)"],
                ].map(([val, label]) => (
                  <div key={val} className={"mrt-chip" + (formType === val ? " selected" : "")} onClick={() => setFormType(val)}>
                    {label}
                  </div>
                ))}
              </div>
            </div>
            {formType === "weekly" && (
              <div className="mrt-field">
                <label>曜日を選択</label>
                <div className="mrt-weekday-picker">
                  {WD.map((w, idx) => (
                    <div key={idx} className={"mrt-weekday-item" + (formWeekdays.includes(idx) ? " selected" : "")} onClick={() => toggleWeekday(idx)}>
                      {w}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {formType === "once" && (
              <div className="mrt-field">
                <label>実施日</label>
                <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
              </div>
            )}
            <div className="mrt-field">
              <label>カテゴリ(任意)</label>
              <div className="mrt-chip-row">
                <div className={"mrt-chip" + (formCategoryId === null ? " selected" : "")} onClick={() => setFormCategoryId(null)}>
                  未設定
                </div>
                {categories.map(cat => (
                  <div key={cat.id} className={"mrt-chip" + (formCategoryId === cat.id ? " selected" : "")} onClick={() => setFormCategoryId(cat.id)}>
                    <span className="mrt-cat-dot" style={{ background: CATEGORY_COLOR_HEX[cat.colorKey][0] }} />
                    {cat.name}
                    <span
                      className="mrt-chip-icon"
                      onClick={e => {
                        e.stopPropagation();
                        openCatEditForm(cat);
                      }}
                    >
                      ✎
                    </span>
                    <span
                      className="mrt-chip-icon"
                      onClick={e => {
                        e.stopPropagation();
                        requestDeleteCategory(cat);
                      }}
                    >
                      ✕
                    </span>
                  </div>
                ))}
                <div className="mrt-chip dashed" onClick={openCatAddForm}>
                  ＋ 新規
                </div>
              </div>
              {catAddOpen && (
                <div className="mrt-cat-add-form">
                  <input type="text" value={catName} onChange={e => setCatName(e.target.value)} placeholder="カテゴリ名(例:仕事)" autoFocus />
                  <div className="mrt-swatches">
                    {CATEGORY_COLORS.map(key => (
                      <button
                        key={key}
                        type="button"
                        className={"mrt-swatch" + (catColor === key ? " selected" : "")}
                        style={{ background: CATEGORY_COLOR_HEX[key][0] }}
                        onClick={() => setCatColor(key)}
                      />
                    ))}
                  </div>
                  <div className="mrt-cat-form-actions">
                    <button type="button" className="mrt-primary-btn small" onClick={confirmCatForm}>
                      {editingCategoryId ? "更新" : "追加"}
                    </button>
                    <button type="button" className="mrt-secondary-btn small" onClick={cancelCatForm}>
                      キャンセル
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="mrt-form-actions">
              <button type="button" className="mrt-primary-btn" onClick={handleSave}>
                保存
              </button>
              <button type="button" className="mrt-secondary-btn" onClick={resetForm}>
                クリア
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const MOBILE_CSS = `
.mrt-root{
  --bg:#0B0B0E; --surface:#151519; --surface2:#1D1D23; --border:#2C2C34;
  --text:#EDEBE4; --text-dim:#8F8C86; --accent:#D9B872; --accent-rgb:217,184,114;
  --accent-ink:#171208; --danger:#D98A79;
  min-height:100dvh; background:var(--bg); color:var(--text);
  font-family:var(--routine-font-sans),'Hiragino Sans','Yu Gothic',sans-serif;
  padding-bottom:64px; position:relative;
}
.mrt-root *{ box-sizing:border-box; }
.mrt-root h1,.mrt-root h2,.mrt-root h3{ font-family:var(--routine-font-serif),'Hiragino Mincho ProN',serif; font-weight:600; margin:0; }
.mrt-root button{ font-family:inherit; }
.mrt-root button:focus-visible, .mrt-root input:focus-visible{ outline:2px solid var(--accent); outline-offset:2px; }

.mrt-header{
  position:sticky; top:0; z-index:5; background:var(--bg);
  display:flex; align-items:center; justify-content:space-between;
  padding:calc(env(safe-area-inset-top,0px) + 10px) 16px 10px;
}
.mrt-brand{ display:flex; align-items:center; gap:8px; font-family:var(--routine-font-serif),serif; font-weight:600; font-size:18px; letter-spacing:0.02em; }
.mrt-more-btn{ background:var(--surface); border:1px solid var(--border); color:var(--text); width:32px; height:32px; border-radius:50%; font-size:15px; cursor:pointer; }

.mrt-content{ padding:0 16px 12px; }

.mrt-month-nav{ display:flex; align-items:center; justify-content:center; gap:16px; margin-bottom:10px; }
.mrt-month-nav button{ background:transparent; border:1px solid var(--border); color:var(--text); width:32px; height:32px; border-radius:50%; cursor:pointer; font-size:14px; }
.mrt-month-label{ font-family:var(--routine-font-serif),serif; font-size:17px; min-width:120px; text-align:center; display:inline-block; }
.mrt-today-link{ text-align:center; font-size:11.5px; color:var(--text-dim); margin-bottom:14px; cursor:pointer; text-decoration:underline; text-underline-offset:3px; }

.mrt-weekday-row{ display:grid; grid-template-columns:repeat(7,1fr); gap:4px; margin-bottom:5px; }
.mrt-weekday-row span{ text-align:center; font-size:11px; color:var(--text-dim); display:block; }
.mrt-cal-grid{ display:grid; grid-template-columns:repeat(7,1fr); gap:4px; }
.mrt-day-cell{
  position:relative; aspect-ratio:1/1; border:1px solid var(--border); border-radius:10px; background:var(--surface);
  cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; overflow:hidden;
}
.mrt-day-cell.outside{ opacity:0.28; border-color:transparent; cursor:default; }
.mrt-day-cell.selected{ border-color:var(--accent); box-shadow:0 0 0 2px rgba(var(--accent-rgb),0.35); }
.mrt-day-cell.is-today{ border-color:var(--accent); }
.mrt-day-cell.is-today .mrt-day-num{ color:var(--accent); font-weight:700; }
.mrt-day-glow{ position:absolute; inset:0; background:radial-gradient(circle at 50% 38%, rgba(var(--accent-rgb),var(--g,0)) 0%, rgba(var(--accent-rgb),0) 72%); pointer-events:none; }
.mrt-day-num{ font-size:12px; position:relative; z-index:1; font-variant-numeric:tabular-nums; }
.mrt-day-moon{ font-size:13px; line-height:1; position:relative; z-index:1; }
.mrt-day-once{ position:absolute; top:3px; right:5px; font-size:8px; z-index:1; color:var(--accent); }

.mrt-legend{ display:flex; justify-content:center; gap:10px; flex-wrap:wrap; margin:14px 0 18px; font-size:10px; color:var(--text-dim); }

.mrt-panel{ background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:16px 14px 18px; }
.mrt-panel h2{ font-size:15px; margin:0 0 12px; }

.mrt-empty{ text-align:center; padding:22px 6px 6px; color:var(--text-dim); font-size:13px; }

.mrt-task-row{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 0; border-bottom:1px solid var(--border); flex-wrap:wrap; }
.mrt-task-row:last-of-type{ border-bottom:none; }
.mrt-task-row.skipped{ opacity:0.55; }
.mrt-task-row.skipped .mrt-moon-picker{ opacity:0.4; pointer-events:none; }
.mrt-task-row-info{ display:flex; flex-direction:column; gap:4px; min-width:0; }
.mrt-task-row-name{ font-size:13.5px; display:flex; align-items:center; }
.mrt-task-row-freq{ font-size:10.5px; color:var(--text-dim); }
.mrt-task-row-controls{ display:flex; flex-wrap:wrap; gap:8px; }
.mrt-moon-picker{ display:flex; gap:4px; }
.mrt-moon-btn{
  background:var(--surface2); border:1px solid var(--border); border-radius:8px; width:30px; height:30px; font-size:14px;
  cursor:pointer; opacity:0.55;
}
.mrt-moon-btn.active{ background:rgba(var(--accent-rgb),0.14); border-color:var(--accent); opacity:1; transform:scale(1.05); }
.mrt-skip-btn{ background:transparent; border:1px solid var(--border); color:var(--text-dim); border-radius:8px; padding:6px 10px; font-size:11px; cursor:pointer; white-space:nowrap; }
.mrt-skip-btn.active{ background:var(--surface2); border-color:var(--text-dim); color:var(--text); }
.mrt-row-del{ background:transparent; border:none; color:var(--text-dim); cursor:pointer; font-size:14px; padding:4px 2px; }

.mrt-add-oneoff{ margin-top:14px; background:transparent; border:1px dashed var(--border); color:var(--text-dim); border-radius:10px; padding:10px; width:100%; cursor:pointer; font-size:12.5px; }

.mrt-chip-row{ display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
.mrt-chip{
  display:inline-flex; align-items:center; border:1px solid var(--border); border-radius:20px; padding:6px 12px;
  font-size:11.5px; cursor:pointer; color:var(--text-dim); background:var(--surface); white-space:nowrap;
}
.mrt-chip.selected{ border-color:var(--accent); color:var(--text); background:rgba(var(--accent-rgb),0.12); }
.mrt-chip.dashed{ border-style:dashed; }
.mrt-chip-icon{ margin-left:5px; color:var(--text-dim); font-size:10px; }
.mrt-cat-dot{ width:8px; height:8px; border-radius:50%; display:inline-block; flex-shrink:0; margin-right:6px; }

.mrt-table-wrap{ overflow-x:auto; border:1px solid var(--border); border-radius:12px; background:var(--surface); -webkit-overflow-scrolling:touch; }
.mrt-table{ border-collapse:collapse; table-layout:fixed; }
.mrt-th-task, .mrt-td-task{ position:sticky; left:0; z-index:2; background:var(--surface); text-align:left; padding:8px 8px; font-size:11px; border-right:1px solid var(--border); border-bottom:1px solid var(--border); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:76px; }
.mrt-th-task{ color:var(--text-dim); z-index:3; }
.mrt-td-task{ font-size:11.5px; height:56px; }
.mrt-th-day{ text-align:center; padding:7px 2px 6px; font-size:10px; color:var(--text-dim); border-bottom:1px solid var(--border); }
.mrt-th-day.is-today{ color:var(--accent); font-weight:700; background:rgba(var(--accent-rgb),0.08); }
.mrt-th-dnum{ font-size:13px; }
.mrt-th-wd{ font-size:9px; }
.mrt-td-day{ text-align:center; padding:0; border-bottom:1px solid var(--border); height:56px; cursor:pointer; }
.mrt-td-day.is-today{ background:rgba(var(--accent-rgb),0.06); }
.mrt-cell-dash{ font-size:11px; color:var(--border); display:flex; align-items:center; justify-content:center; height:56px; }
.mrt-cell-icon{ font-size:30px; display:flex; align-items:center; justify-content:center; height:56px; }
.mrt-cell-icon.unset{ opacity:0.4; }

.mrt-io-row{ display:flex; gap:8px; margin-bottom:16px; }
.mrt-io-btn{ flex:1; background:var(--surface); border:1px solid var(--border); color:var(--text); border-radius:10px; padding:9px 8px; font-size:12.5px; cursor:pointer; }
.mrt-tasklist-row{ display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border); gap:6px; }
.mrt-tasklist-info{ display:flex; flex-direction:column; gap:2px; min-width:0; flex:1; overflow:hidden; }
.mrt-tasklist-actions{ display:flex; gap:3px; flex-shrink:0; align-items:center; }
.mrt-tasklist-actions button{ background:var(--surface2); border:1px solid var(--border); border-radius:6px; font-size:10px; line-height:1; color:var(--text); cursor:pointer; padding:0; width:22px; height:22px; }
.mrt-tasklist-actions button:nth-child(3), .mrt-tasklist-actions button:nth-child(4){ width:auto; padding:5px 7px; border-radius:8px; font-size:11px; }
.mrt-tasklist-actions button:disabled{ opacity:0.3; cursor:default; }
.mrt-tasklist-actions .mrt-del-btn{ color:var(--danger); }

.mrt-primary-btn{ background:var(--accent); color:var(--accent-ink); border:none; border-radius:10px; padding:12px; width:100%; font-size:14px; font-weight:600; cursor:pointer; }
.mrt-primary-btn.small{ width:auto; flex:none; padding:8px 16px; font-size:13px; border-radius:9px; }
.mrt-secondary-btn{ background:transparent; border:1px solid var(--border); color:var(--text-dim); border-radius:9px; padding:12px 18px; font-size:14px; cursor:pointer; }
.mrt-secondary-btn.small{ padding:8px 16px; font-size:13px; }

.mrt-tabbar{
  position:fixed; left:0; right:0; bottom:0; z-index:5; display:flex;
  border-top:1px solid var(--border); background:var(--bg);
  padding:8px 4px calc(env(safe-area-inset-bottom,0px) + 8px);
}
.mrt-tab{ flex:1; display:flex; flex-direction:column; align-items:center; background:transparent; border:none; padding:4px 0; cursor:pointer; color:var(--text-dim); }
.mrt-tab.active{ color:var(--accent); }
.mrt-tab-icon{ font-size:18px; }
.mrt-tab-label{ font-size:10px; margin-top:2px; }

.mrt-overlay{ position:fixed; inset:0; background:var(--bg); z-index:40; display:flex; flex-direction:column; color:var(--text); }
.mrt-overlay-head{
  flex:none; display:flex; align-items:center; justify-content:space-between; gap:10px;
  padding:calc(env(safe-area-inset-top,0px) + 10px) 20px 14px; border-bottom:1px solid var(--border);
}
.mrt-overlay-head h2{ font-size:15px; flex:1; text-align:center; }
.mrt-back-btn, .mrt-close-btn{ background:transparent; border:none; color:var(--text); cursor:pointer; }
.mrt-back-btn{ font-size:20px; }
.mrt-close-btn{ font-size:19px; color:var(--text-dim); }
.mrt-head-spacer{ width:20px; flex:none; }
.mrt-overlay-scroll{ flex:1; overflow-y:auto; padding:16px 20px calc(env(safe-area-inset-bottom,0px) + 24px); }

.mrt-sheet-backdrop{ position:fixed; inset:0; background:rgba(10,9,6,0.5); z-index:45; display:flex; align-items:flex-end; }
.mrt-sheet{ background:var(--surface); border:1px solid var(--border); border-radius:18px 18px 0 0; width:100%; padding:20px 20px calc(env(safe-area-inset-bottom,0px) + 24px); }
.mrt-sheet-email{ font-size:12px; color:var(--text-dim); margin-bottom:14px; text-align:center; }
.mrt-sheet-item{ width:100%; text-align:left; background:transparent; border:none; border-top:1px solid var(--border); color:var(--text); padding:14px 4px; font-size:14px; cursor:pointer; }
.mrt-sheet-item.danger{ color:var(--danger); }

.mrt-about-desc{ font-size:13px; color:var(--text-dim); line-height:1.75; margin:0 0 20px; }
.mrt-about-heading{ font-size:13.5px; margin:0 0 12px; font-weight:500; }
.mrt-about-version{ margin-bottom:16px; }
.mrt-about-version-head{ font-family:var(--routine-font-serif),serif; font-size:14px; margin-bottom:5px; }
.mrt-about-version-date{ font-family:var(--routine-font-sans),sans-serif; font-size:11px; color:var(--text-dim); margin-left:6px; }
.mrt-about-version ul{ margin:0; padding-left:18px; }
.mrt-about-version li{ font-size:12.5px; color:var(--text-dim); line-height:1.65; margin-bottom:4px; }

.mrt-field{ margin-bottom:16px; }
.mrt-field label{ display:block; font-size:12px; color:var(--text-dim); margin-bottom:6px; }
.mrt-field input[type=text], .mrt-field input[type=date]{
  width:100%; background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:10px 12px; color:var(--text); font-size:14px;
}
.mrt-weekday-picker{ display:flex; gap:6px; flex-wrap:wrap; }
.mrt-weekday-item{ width:36px; height:36px; border:1px solid var(--border); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12.5px; cursor:pointer; color:var(--text-dim); }
.mrt-weekday-item.selected{ border-color:var(--accent); background:rgba(var(--accent-rgb),0.16); color:var(--text); }
.mrt-cat-add-form{ margin-top:10px; padding:12px; border:1px dashed var(--border); border-radius:10px; }
.mrt-cat-add-form input[type=text]{ margin-bottom:10px; }
.mrt-swatches{ display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
.mrt-swatch{ width:26px; height:26px; border-radius:50%; cursor:pointer; padding:0; border:2px solid transparent; }
.mrt-swatch.selected{ border-color:var(--text); }
.mrt-cat-form-actions{ display:flex; gap:8px; }
.mrt-form-actions{ display:flex; gap:10px; margin-top:18px; }
`;
