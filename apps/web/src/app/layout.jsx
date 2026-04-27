import "./styles.css";

export const metadata = {
  title: "QYPOS",
  description: "Small restaurant POS"
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
