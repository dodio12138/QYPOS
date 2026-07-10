"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

export default function SidebarStateSync() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    try {
      if (pathname.startsWith("/admin")) {
        const collapsed = window.localStorage.getItem("qypos_sidebar_collapsed") === "1";
        document.body.dataset.qyposSidebarCollapsed = collapsed ? "1" : "0";
      } else {
        document.body.removeAttribute("data-qypos-sidebar-collapsed");
      }
    } catch (error) {
      document.body.removeAttribute("data-qypos-sidebar-collapsed");
    }
  }, [pathname]);

  return null;
}