"use client";
import { Coins, Search } from "lucide-react";
import { text, money } from "./pos-helpers";
import { labelOf } from "../../lib/api";
import ReceiptTitle from "./receipt-title";
export default function MenuPicker({ categories, items, selectedCategory, setSelectedCategory, search, setSearch, locale, currency, hasOrder, onNeedOrder, onPick, onCustom }) {
  return (
    <section className="panel menu-panel">
      <div className="panel-title split">
        <div>
          <ReceiptTitle locale={locale} />
        </div>
        <button type="button" className="misc-button" onClick={onCustom} disabled={!hasOrder} title={text(locale, "加入自定义价格的杂项代收", "Add a custom-priced misc charge")}>
          <Coins size={16} /><span>{text(locale, "杂项代收", "Misc charge")}</span>
        </button>
      </div>
      <div className="search-box">
        <Search size={18} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text(locale, "搜索菜品", "Search items")} />
      </div>
      <div className="category-strip">
        <button className={selectedCategory === "all" ? "selected" : ""} onClick={() => setSelectedCategory("all")}>{text(locale, "全部", "All")}</button>
        {categories.filter((category) => category.active).map((category) => (
          <button key={category.id} className={selectedCategory === category.id ? "selected" : ""} onClick={() => setSelectedCategory(category.id)}>
            {labelOf(category.name_i18n, locale)}
          </button>
        ))}
      </div>
      <div className="menu-grid">
        {items.map((item) => {
          const minPrice = Math.min(...item.variants.filter((variant) => variant.active).map((variant) => Number(variant.price)));
          const zhName = labelOf(item.name_i18n, "zh-CN");
          const enName = item.name_i18n?.["en-GB"] || item.name_i18n?.["en"] || "";
          return (
            <button
              className="product-tile"
              key={item.id}
              onClick={() => (hasOrder ? onPick(item) : onNeedOrder())}
              disabled={!hasOrder || !item.variants.some((variant) => variant.active)}
            >
              <strong>{zhName}</strong>
              {enName && enName !== zhName && <em className="product-tile-en">{enName}</em>}
              <span>{labelOf(item.description_i18n, locale) || item.kitchen_group}</span>
              <b>{Number.isFinite(minPrice) ? money(minPrice, currency, locale) : text(locale, "未定价", "Unpriced")}</b>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ReceiptTitle imported from ./_components/receipt-title

