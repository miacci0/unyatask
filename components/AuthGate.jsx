"use client";

import { useEffect, useState } from "react";
import { Shippori_Mincho } from "next/font/google";
import { supabase } from "@/lib/supabaseClient";

// 独立アプリ版のログインゲート。Animator Workspace側のAuthGate(お試しモード・
// ワークスペース同期・多言語など)は持ち込まず、Googleログインのみのシンプルな構成にする。
// redirectToはこのアプリ自身のorigin(window.location.origin)を指定するため、
// ログイン後はAnimator Workspaceではなくこのアプリに戻ってくる。
//
// 【重要】OAuthのリダイレクト先はSupabaseプロジェクト側の許可リストで管理されている。
// このアプリを別ドメイン/ポートで動かす場合、Supabaseダッシュボードの
// Authentication > URL Configuration > Redirect URLs に、このアプリのURL
// (例: http://localhost:3002 や本番ドメイン)を追加登録する必要がある。

const shippori = Shippori_Mincho({ subsets: ["latin"], weight: ["600"], variable: "--auth-font-serif" });

export default function AuthGate({ children }) {
  // undefined = 読み込み中 / null = 未ログイン / セッションあり = ログイン済み
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function signIn() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (session === undefined) {
    return (
      <div className={`auth-gate-loading ${shippori.variable}`}>
        <style dangerouslySetInnerHTML={{ __html: AUTH_CSS }} />
        読み込み中…
      </div>
    );
  }

  if (!session) {
    return (
      <div className={`auth-gate-login ${shippori.variable}`}>
        <style dangerouslySetInnerHTML={{ __html: AUTH_CSS }} />
        <div className="auth-card">
          <div className="auth-mark">✅</div>
          <h1>UnyaTask</h1>
          <p>Googleアカウントでログインしてください</p>
          <button onClick={signIn}>Googleでログイン</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`auth-gate-shell ${shippori.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: AUTH_CSS }} />
      <div className="auth-topbar">
        <span>{session.user.email}</span>
        <button onClick={signOut}>ログアウト</button>
      </div>
      {children}
    </div>
  );
}

const AUTH_CSS = `
.auth-gate-loading, .auth-gate-login, .auth-gate-shell {
  min-height: 100dvh;
  background: #0B0B0E;
  color: #EDEBE4;
  font-family: 'Zen Kaku Gothic New', 'Hiragino Sans', 'Yu Gothic', sans-serif;
}
.auth-gate-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13.5px;
  color: #8F8C86;
}
.auth-gate-login {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.auth-card {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.auth-mark { font-size: 34px; }
.auth-card h1 {
  font-family: var(--auth-font-serif), 'Hiragino Mincho ProN', serif;
  font-weight: 600;
  font-size: 22px;
  margin: 0;
  letter-spacing: 0.04em;
}
.auth-card p {
  margin: 0;
  font-size: 13px;
  color: #8F8C86;
}
.auth-card button {
  margin-top: 6px;
  background: #D9B872;
  color: #171208;
  border: none;
  border-radius: 8px;
  padding: 10px 22px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.auth-card button:hover { opacity: 0.9; }
.auth-topbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  padding: 8px 16px;
  border-bottom: 1px solid #2C2C34;
  font-size: 12px;
  color: #8F8C86;
}
.auth-topbar button {
  background: transparent;
  border: none;
  color: #8F8C86;
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
  font-family: inherit;
}
.auth-topbar button:hover { color: #EDEBE4; }
/* モバイル(767px以下)ではRoutineApp側の「⋯」シートにメールアドレス・ログアウトを
   表示するため、ここでの重複表示は隠す(RoutineApp.jsxの.rt-desktop-only/.rt-mobile-only
   と同じ767pxブレークポイント)。 */
@media (max-width: 767px) {
  .auth-topbar { display: none; }
}
`;
