"use client";

import { ClipboardList } from "lucide-react";
import { text } from "./pos-helpers";

export default function ReceiptTitle({ locale }) {
  return (
    <div className="inline-title">
      <ClipboardList size={18} />
      <h2>{text(locale, "菜单", "Menu")}</h2>
    </div>
  );
}
