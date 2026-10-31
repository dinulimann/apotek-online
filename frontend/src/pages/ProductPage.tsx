import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, Minus, Plus, ShieldCheck } from "lucide-react";
import { api, ApiError, type Product } from "../lib/api";
import { rp } from "../lib/format";
import { useStore } from "../lib/store";
import { Button, CLASS_INFO, ClassMark, Spinner } from "../components/ui";

export default function ProductPage({ slug }: { slug: string }) {
  const { add, toast, setCartOpen, cart } = useStore();
  const [p, setP] = useState<Product | null>(null);
  const [missing, setMissing] = useState(false);
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<"about" | "dosage" | "warnings">("about");
  useEffect(() => { setP(null); setQty(1); api.product(slug).then(setP).catch((e) => e instanceof ApiError && e.status === 404 && setMissing(true)); }, [slug]);
  if (missing) return <div className="py-32 text-center"><p className="font-display text-3xl">We couldn't find that product.</p><a className="mt-4 inline-block font-bold text-brand underline" href="#/shop">Back to the shop</a></div>;
  if (!p) return <div className="py-32 text-center"><Spinner className="text-brand" /></div>;
  const inCart = cart.find((l) => l.productId === p.id)?.qty ?? 0;
  const max = Math.max(0, Math.min(20, p.available, p.maxPerOrder ?? 20) - inCart);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
      <nav className="flex items-center gap-1 text-sm text-muted" aria-label="Breadcrumb">
        <a href="#/shop" className="hover:text-fg">Shop</a><ChevronRight size={14} /><a href={`#/shop?category=${p.categorySlug}`} className="hover:text-fg">{p.categoryName}</a>
      </nav>
      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <div className="relative overflow-hidden rounded-[2rem] bg-panel-2">
          <img src={p.image} alt="" className="aspect-square w-full object-cover" />
          <p className="absolute right-4 bottom-4 rounded-full bg-black/45 px-3 py-1 text-[11px] text-white backdrop-blur">Illustrative photo</p>
        </div>
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-panel px-3 py-1.5 text-xs font-bold shadow-soft"><ClassMark cls={p.drugClass} size={16} />{CLASS_INFO[p.drugClass].label}</span>
          <h1 className="mt-4 font-display text-5xl leading-tight font-semibold">{p.name}</h1>
          <p className="mt-2 text-muted">{p.genericName}{p.strength && ` · ${p.strength}`} · {p.form} · {p.pack}</p>
          <p className="tnum mt-6 text-3xl font-extrabold text-brand">{rp(p.price)}</p>
          <p className={`mt-1 text-sm font-semibold ${p.available === 0 ? "text-bad" : p.available <= 5 ? "text-warn" : "text-good"}`}>
            {p.available === 0 ? "Out of stock" : p.available <= 5 ? `Only ${p.available} left` : "In stock"}
          </p>
          {p.needsPrescription && (
            <div className="mt-6 flex gap-3 rounded-3xl bg-bad-soft p-4 text-sm text-bad"><ShieldCheck size={20} className="shrink-0" />
              <p><b>Prescription medicine.</b> You can add it to your cart, then upload your doctor's prescription at checkout. A pharmacist checks it before you pay.</p></div>
          )}
          {p.maxPerOrder !== null && <p className="mt-4 flex items-center gap-2 text-sm text-info"><AlertTriangle size={16} /> Limited to {p.maxPerOrder} per order{inCart ? ` (you have ${inCart} in your cart)` : ""}.</p>}
          <div className="mt-6 flex items-center gap-3">
            <div className="flex items-center rounded-full border border-line bg-panel">
              <button aria-label="Fewer" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid size-12 place-items-center"><Minus size={18} /></button>
              <span className="tnum w-8 text-center text-lg font-bold" aria-live="polite">{qty}</span>
              <button aria-label="More" disabled={qty >= max} onClick={() => setQty((q) => q + 1)} className="grid size-12 place-items-center disabled:opacity-30"><Plus size={18} /></button>
            </div>
            <Button size="lg" className="flex-1" disabled={max === 0} onClick={() => { const msg = add(p, qty); if (msg) toast(msg, "bad"); else { toast(`${p.name} added to cart`); setCartOpen(true); } setQty(1); }}>
              {max === 0 ? (p.available === 0 ? "Out of stock" : "Limit reached") : `Add to cart · ${rp(p.price * qty)}`}
            </Button>
          </div>
          <div className="mt-10">
            <div className="flex gap-1 border-b border-line" role="tablist">
              {([["about", "About"], ["dosage", "How to use"], ["warnings", "Warnings"]] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-bold ${tab === k ? "border-brand text-brand" : "border-transparent text-muted"}`}>{l}</button>
              ))}
            </div>
            <p className="mt-4 leading-relaxed text-fg/85" role="tabpanel">
              {tab === "about" ? p.description : tab === "dosage" ? (p.dosage || "Follow the instructions on the pack.") : (p.warnings || "No special warnings. Keep out of reach of children.")}
            </p>
            <p className="mt-4 text-xs text-muted">Information here is a short summary. Read the leaflet, and ask a pharmacist or doctor if you're unsure.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
