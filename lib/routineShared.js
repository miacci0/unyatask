// RoutineApp(デスクトップ)とMobileRoutineApp(モバイル)の両方で使う、見た目に依存しない
// 純粋な定数・ヘルパー関数をここにまとめる。両方の画面で機能差が出ないよう、日付計算・
// 頻度判定・並び順などのロジックは必ずここから import して使うこと(画面ごとに書き直さない)。

export const WD = ["日", "月", "火", "水", "木", "金", "土"];
export const MOONS = ["🌑", "🌒", "🌓", "🌔", "🌕"];
export const MOON_TITLES = ["0%(未着手)", "25%", "50%", "75%", "100%(完了)"];
// 一覧(表)専用のスタンプ絵文字。index = 達成度レベル(0〜4)。カレンダー(MOONS)とは別物で、
// 0(=0%)は「未記録」と同じ「○」のままにする(25/50/75/100%の4段階だけスタンプに差し替え)。
export const STAMPS = ["○", "🐢", "⭕️", "⭐️", "💯"];
export const CATEGORY_COLORS = ["rose", "amber", "moss", "sky", "lavender", "clay", "teal", "slate"];
// モバイル版はCSS変数(ライト/ダーク自動切り替え)を使わず常時ダーク固定のため、
// カテゴリ色を直接hexで参照する必要がある箇所(インラインstyle)用のテーブル。
// 値はROUTINE_CSSのダークモード(prefers-color-scheme:dark)側の --cat-* と同じにしてあるので、
// デスクトップのダークモード表示と色味は完全に一致する。[key] -> [hex, "r,g,b"]
export const CATEGORY_COLOR_HEX = {
  rose: ["#E39BA3", "227,155,163"],
  amber: ["#E3BD78", "227,189,120"],
  moss: ["#A3C98A", "163,201,138"],
  sky: ["#8FC1E8", "143,193,232"],
  lavender: ["#B9A8E0", "185,168,224"],
  clay: ["#E3A67D", "227,166,125"],
  teal: ["#7FCFC7", "127,207,199"],
  slate: ["#9AA3B5", "154,163,181"],
};
// 0%(🌑)は「未記録」と実質同じ表示になるため選択肢から外してある(25〜100%の4段階のみ)。
export const LEVEL_OPTIONS = [
  { value: "unset", label: "— 未記録" },
  { value: "1", label: "🐢 25%" },
  { value: "2", label: "⭕️ 50%" },
  { value: "3", label: "⭐️ 75%" },
  { value: "4", label: "💯 100%" },
  { value: "skip", label: "🌙 今日は不要" },
];

export function pad(n) {
  return String(n).padStart(2, "0");
}
export function toDateStr(y, m, d) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
export function todayStr() {
  const t = new Date();
  return toDateStr(t.getFullYear(), t.getMonth(), t.getDate());
}
export function parseDateStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function weekdayOf(dateStr) {
  return parseDateStr(dateStr).getDay();
}
export function isApplicable(task, dateStr) {
  if (task.startDate && dateStr < task.startDate) return false;
  if (task.type === "daily") return true;
  if (task.type === "weekly") return (task.daysOfWeek || []).includes(weekdayOf(dateStr));
  if (task.type === "once") return task.date === dateStr;
  return false;
}
export function freqLabel(task) {
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
export function formatDayTitle(dateStr) {
  const d = parseDateStr(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})の記録`;
}
export function formatMonthDay2(dateStr) {
  const d = parseDateStr(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}(${WD[weekdayOf(dateStr)]})`;
}
// タスクの表示順。タスク管理でのドラッグ/ボタン並び替え(sortOrder)を基準にし、
// (原理上あり得ないはずだが)値が無いタスクは作成日順でフォールバックして末尾側に回す。
export function compareTaskOrder(a, b) {
  const ao = typeof a.sortOrder === "number" ? a.sortOrder : Infinity;
  const bo = typeof b.sortOrder === "number" ? b.sortOrder : Infinity;
  if (ao !== bo) return ao - bo;
  return (a.createdAt || "").localeCompare(b.createdAt || "");
}
