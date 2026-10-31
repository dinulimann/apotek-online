import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { api, type Category, type Page, type Product } from "../lib/api";
import { go, link } from "../lib/router";
import ProductCard from "../components/ProductCard";
import { CLASS_INFO, ClassMark, Spinner } from "../components/ui";

const SIZE = 12;

export default function Shop({ params }: { params: URLSearchParams }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [page, setPage] = useState<Page<Product> | null>(null);
  const q = params.get("q") ?? "", category = params.get("category") ?? "", drugClass = params.get("class") ?? "", sort = params.get("sort") ?? "NAME";
  const inStock = params.get("stock") === "1";
  const n = Number(params.get("page") ?? 0);
  const set = (patch: Record<string, string | undefined>) => go(link("/shop", { q, category, class: drugClass, sort: sort === "NAME" ? undefined : sort, stock: inStock ? "1" : undefined, ...patch }).slice(1));

  useEffect(() => { api.categories().then(setCats); }, []);
  useEffect(() => {
    setPage(null);
    api.products({ q, category, drugClass, inStock, sort, page: n, size: SIZE }).then(setPage);
  }, [q, category, drugClass, inStock, sort, n]);

  const pages = page ? Math.max(1, Math.ceil(page.total / SIZE)) : 1;
  const title = q ? `Results for “${q}”` : cats.find((c) => c.slug === category)?.name ?? "All products";
  const chip = (on: boolean) => `flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${on ? "bg-brand text-white" : "hover:bg-panel-2"}`;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-6" aria-label="Filters">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-bold tracking-wider text-muted uppercase"><SlidersHorizontal size={14} /> Category</p>
            <div className="flex gap-1 overflow-x-auto lg:flex-col">
              <button className={chip(!category)} onClick={() => set({ category: undefined, page: undefined })}>All</button>
              {cats.map((c) => <button key={c.slug} className={`${chip(category === c.slug)} shrink-0`} onClick={() => set({ category: c.slug, page: undefined })}>{c.name}<span className="ml-2 text-xs opacity-60">{c.products}</span></button>)}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold tracking-wider text-muted uppercase">Medicine class</p>
            <div className="flex flex-wrap gap-1 lg:flex-col">
              {(["", "BEBAS", "BEBAS_TERBATAS", "KERAS", "ALKES"] as const).map((c) => (
                <button key={c || "all"} className={`${chip(drugClass === c)} w-auto lg:w-full`} onClick={() => set({ class: c || undefined, page: undefined })}>
                  <span className="flex items-center gap-2">{c && <ClassMark cls={c} size={14} />}{c ? CLASS_INFO[c].short : "Any class"}</span>
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={inStock} onChange={(e) => set({ stock: e.target.checked ? "1" : undefined, page: undefined })} className="size-4 accent-[var(--brand)]" /> In stock only</label>
        </aside>

        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h1 className="font-display text-4xl font-semibold">{title}</h1><p className="mt-1 text-sm text-muted">{page ? `${page.total} products` : " "}</p></div>
            <select value={sort} onChange={(e) => set({ sort: e.target.value === "NAME" ? undefined : e.target.value, page: undefined })} aria-label="Sort" className="h-10 rounded-full border border-line bg-panel px-4 text-sm font-semibold">
              <option value="NAME">Name A–Z</option><option value="PRICE_ASC">Price: low to high</option><option value="PRICE_DESC">Price: high to low</option>
            </select>
          </div>
          {!page ? <div className="py-24 text-center"><Spinner className="text-brand" /></div> : page.items.length === 0 ? (
            <div className="py-24 text-center"><p className="font-display text-2xl">Nothing found</p><p className="mt-2 text-muted">Try another word, or clear the filters.</p><button className="mt-4 font-bold text-brand underline" onClick={() => go("/shop")}>Clear filters</button></div>
          ) : (
            <>
              <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3" data-testid="results">{page.items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
              {pages > 1 && (
                <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Pages">
                  <button disabled={n === 0} onClick={() => set({ page: String(n - 1) })} aria-label="Previous page" className="grid size-10 place-items-center rounded-full border border-line bg-panel disabled:opacity-30"><ChevronLeft size={18} /></button>
                  {Array.from({ length: pages }, (_, i) => <button key={i} aria-current={i === n ? "page" : undefined} onClick={() => set({ page: i ? String(i) : undefined })} className={`size-10 rounded-full text-sm font-bold ${i === n ? "bg-brand text-white" : "border border-line bg-panel"}`}>{i + 1}</button>)}
                  <button disabled={n >= pages - 1} onClick={() => set({ page: String(n + 1) })} aria-label="Next page" className="grid size-10 place-items-center rounded-full border border-line bg-panel disabled:opacity-30"><ChevronRight size={18} /></button>
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
