# UnyaTask(独立アプリ版)

カスタマイズ可能な日々のタスク管理システム。Animator Workspaceとは完全に独立したNext.jsアプリ(Animator WorkspaceのLabsから外部リンクとして開けるが、コード・デプロイは別物。案件データとの連携は今後の課題)。

- 認証・データはAnimator Workspaceと同じSupabaseアカウント基盤の考え方を踏襲するが、テーブル(`routine_tasks` / `routine_categories` / `routine_logs`)はこのアプリ専用。
- Animator Workspaceと同じ**beta/mainの2系統構成**(下記参照)。

## ブランチ・環境構成(Animator Workspaceと同じ運用)

| ブランチ | 用途 | デプロイ先 | 使うSupabaseプロジェクト |
| --- | --- | --- | --- |
| `main` | 本番。普段は直接pushしない、明示的に頼まれた時だけbetaからマージ | Vercel Production: https://unyatask.vercel.app | Animator Workspaceの**mainの**Supabaseプロジェクト |
| `beta` | 開発用。**普段のコミット・pushはこちら** | Vercelのブランチプレビュー(`https://unyatask-git-beta-<スコープ名>.vercel.app`) | Animator Workspaceの**betaの**Supabaseプロジェクト |

ローカル開発時の`.env.local`はbetaのSupabaseプロジェクトを指す(gitには含めない)。mainブランチのProduction環境変数はVercel側でmainのSupabaseプロジェクトを指すよう設定する(このリポジトリには`.vercel`の連携ファイルが無いため、環境変数はVercelダッシュボードで管理)。

## セットアップ

1. 依存関係をインストール:
   ```bash
   npm install
   ```
2. `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定(通常はbetaのSupabaseプロジェクトの値)。
3. Supabaseの SQL Editor で、対象のSupabaseプロジェクト(beta/mainそれぞれ個別に)に以下を**この順番**で実行し、`routine_tasks` / `routine_categories` / `routine_logs` テーブルとRLSポリシー、関連RPC関数を作成する:
   1. [supabase/routine_schema.sql](supabase/routine_schema.sql)
   2. [supabase/task_sort_order_column.sql](supabase/task_sort_order_column.sql)
4. **【重要】Supabaseダッシュボード → Authentication → URL Configuration → Redirect URLs** に、このアプリのURLを追加登録する(beta用プロジェクト・main用プロジェクトそれぞれ個別に、そのプロジェクトが実際に使われるURLだけを登録する):
   - 開発時: `http://localhost:3003`(beta用プロジェクトに登録)
   - betaのブランチプレビューURL(beta用プロジェクトに登録)
   - 本番: `https://unyatask.vercel.app`(main用プロジェクトに登録)
   - これをしないと、Googleログインの後にSupabaseがリダイレクトを拒否し、ログインが完了しない。
5. 開発サーバーを起動:
   ```bash
   npm run dev -- -p 3003
   ```

## 構成

- [app/page.js](app/page.js) — ルート(このアプリ全体が「UnyaTask」そのもの)。
- [components/AuthGate.jsx](components/AuthGate.jsx) — Googleログインのみのシンプルなログインゲート。
- [components/AnimatorWorkspaceReturnBand.jsx](components/AnimatorWorkspaceReturnBand.jsx) — Animator WorkspaceのLabs経由(`?from=animator-workspace&returnUrl=...`)でアクセスした時だけ「Animator Workspaceに戻る」帯を表示。
- [components/RoutineApp.jsx](components/RoutineApp.jsx) — 本体UI(カレンダー/表ビュー、月齢アイコン・スタンプ絵文字での達成度記録、週次・単発タスク、カテゴリ管理、ドラッグ並べ替え、JSONエクスポート/インポート、「このアプリについて」)。
- [lib/useRoutineData.js](lib/useRoutineData.js) — Supabaseとの読み書き(行単位のCRUD + 日々の記録・並べ替えはRPCで原子的に更新)。
- [lib/appContent.js](lib/appContent.js) — 「このアプリについて」の説明文・リリースノート。
- [supabase/](supabase/) — テーブル定義・RLSポリシー・RPC関数(beta/main両方のSupabaseプロジェクトに同じ内容を適用する)。

## 既知の制限

- 表示言語は日本語のみ。
- 複数タブ・複数端末間のリアルタイム同期はなし(保存はSupabaseに反映されるが、他タブの変更が自動で流れてくるのは再読み込み時のみ)。
- Animator Workspaceの案件データ(作業予定日など)との連携はまだ無い(将来の課題として先送り中)。
