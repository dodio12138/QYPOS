import Script from "next/script";
import SidebarStateSync from "./sidebar-state-sync";
import "./styles.css";

export const metadata = {
  title: "QYPOS",
  description: "Small restaurant POS"
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        <Script id="qypos-sidebar-state" strategy="beforeInteractive">
          {`try {
  if (window.location.pathname.startsWith('/admin')) {
    var c = window.localStorage.getItem('qypos_sidebar_collapsed') === '1';
    document.body.dataset.qyposSidebarCollapsed = c ? '1' : '0';
    if (c) {
      var s = document.createElement('style');
      s.id = 'qypos-sidebar-prehydrate';
      s.textContent = '.sidebar{width:72px!important}';
      document.head.appendChild(s);
    }
  }
} catch (error) {}`}
        </Script>
        <SidebarStateSync />
        {children}
      </body>
    </html>
  );
}
