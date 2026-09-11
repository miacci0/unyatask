"use client";

import { useEffect, useState } from "react";

// Animator WorkspaceのLabsページ経由でUnyaTaskを開いた場合にだけ、
// 「Animator Workspaceに戻る」帯を表示する。
//
// 表示条件はwindow.location.searchのfrom=animator-workspaceパラメータの有無のみで、
// 暗号学的な検証はしない(個人開発の2アプリ間の利便性機能として、これで十分と判断)。
// パラメータが無い/不正な場合は何も描画しない
// (= UnyaTaskを直接訪れた場合の見た目・挙動は一切変わらない)。
//
// next/navigationのuseSearchParams()は使わない。App RouterでuseSearchParams()を使うと
// 静的プリレンダリング時にSuspense境界で囲む必要が生じる制約があるが、
// app/page.jsは現状Suspenseを持たない単純な構成のため、その変更を避けるのが望ましい。
// マウント後に一度だけwindow.location.searchを読むだけなら、この制約と無関係に動作する。
export default function AnimatorWorkspaceReturnBand() {
  const [returnUrl, setReturnUrl] = useState(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("from") !== "animator-workspace") return;

      const raw = params.get("returnUrl");
      if (!raw) return;

      // new URL()でパースできない、またはhttp/https以外のスキーム
      // (javascript: など)の場合は表示しない。
      const parsed = new URL(raw);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;

      setReturnUrl(parsed.href);
    } catch {
      // returnUrlが不正なURLの場合は何もしない(帯を出さない)
    }
  }, []);

  if (!returnUrl) return null;

  return (
    <div className="aw-return-band">
      <style dangerouslySetInnerHTML={{ __html: AW_RETURN_BAND_CSS }} />
      <a href={returnUrl}>← Animator Workspaceに戻る</a>
    </div>
  );
}

// components/AuthGate.jsxの.auth-topbar・AUTH_CSSと同じ配色・フォント指定を踏襲
// (ダークテーマ固定: #0B0B0E / #EDEBE4 / #8F8C86 / #2C2C34)。
const AW_RETURN_BAND_CSS = `
.aw-return-band {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid #2C2C34;
  font-size: 12px;
  color: #8F8C86;
  background: #0B0B0E;
  font-family: 'Zen Kaku Gothic New', 'Hiragino Sans', 'Yu Gothic', sans-serif;
}
.aw-return-band a {
  color: #8F8C86;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.aw-return-band a:hover {
  color: #EDEBE4;
}
`;
