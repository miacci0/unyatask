import "./globals.css";

export const metadata = {
  title: "UnyaTask",
  description: "カスタマイズ可能な日々のタスク管理",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
