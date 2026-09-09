import "./globals.css";

export const metadata = {
  title: "月のルーティン",
  description: "カスタマイズ可能な日々のタスク管理",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
