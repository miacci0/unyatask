# 月のルーティン(独立アプリ版)

カスタマイズ可能な日々のタスク管理システム。Animator Workspaceとは完全に独立したNext.jsアプリ(将来的にはAnimator Workspaceのモジュールとして統合予定だが、現時点では別アプリとして動かす)。

- 認証・データはAnimator Workspaceと**同じSupabaseプロジェクト**(同じGoogleアカウント)を使うが、テーブル(`routine_tasks` / `routine_categories` / `routine_logs`)はこのアプリ専用。
- コード・デプロイ・ドメインはAnimator Workspaceとは別物。ログイン後もこのアプリ自身に戻ってくる。

## セットアップ

1. 依存関係をインストール:
   ```bash
   npm install
   ```
2. `.env.local` はAnimator Workspaceと同じ `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定済み(このアプリ専用の値ではない。同じSupabaseプロジェクトを指す)。
3. Supabaseの SQL Editor で [supabase/routine_schema.sql](supabase/routine_schema.sql) を実行し、`routine_tasks` / `routine_categories` / `routine_logs` テーブルとRLSポリシー、`set_routine_log_entry` 関数を作成する。
4. **【重要】Supabaseダッシュボード → Authentication → URL Configuration → Redirect URLs** に、このアプリのURLを追加登録する。
   - 開発時: `http://localhost:3003`
   - 本番デプロイ後: 実際のデプロイ先URL(例: `https://routine.example.com`)
   - これをしないと、Googleログインの後にSupabaseがリダイレクトを拒否し、ログインが完了しない(またはAnimator Workspace側のURLにリダイレクトされてしまう)。
5. 開発サーバーを起動:
   ```bash
   npm run dev -- -p 3003
   ```

## 構成

- [app/page.js](app/page.js) — ルート(このアプリ全体が「月のルーティン」そのもの)。
- [components/AuthGate.jsx](components/AuthGate.jsx) — Googleログインのみのシンプルなログインゲート。
- [components/RoutineApp.jsx](components/RoutineApp.jsx) — 本体UI(カレンダー/表ビュー、月齢アイコンでの達成度記録、週次・単発タスク、カテゴリ管理、JSONエクスポート/インポート)。
- [lib/useRoutineData.js](lib/useRoutineData.js) — Supabaseとの読み書き(行単位のCRUD + 日々の記録はRPCでjsonbマージ)。
- [supabase/routine_schema.sql](supabase/routine_schema.sql) — テーブル定義・RLSポリシー・RPC関数。

## 既知の制限(v1)

- 表示言語は日本語のみ。
- 複数タブ・複数端末間のリアルタイム同期はなし(保存はSupabaseに反映されるが、他タブの変更が自動で流れてくるのは再読み込み時のみ)。
- 本番デプロイ先(Vercel等)は未設定。デプロイする場合は環境変数(`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`)をデプロイ先にも設定し、上記のRedirect URL登録を忘れずに。
