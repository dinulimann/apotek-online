import { Plus } from "lucide-react";
import type { Product } from "../lib/api";
import { rp } from "../lib/format";
import { link } from "../lib/router";
import { useStore } from "../lib/store";
import { ClassMark, ClassTag } from "./ui";

export default function ProductCard({ p }: { p: Product }) {
  const { add, toast, setCartOpen } = useStore();
  const out = p.available <= 0;
  return (
    <article className="group shadow-soft relative flex flex-col overflow-hidden rounded-3xl bg-panel transition hover:-translate-y-1">
      <a href={link(`/p/${p.slug}`)} className="relative block aspect-[4/3] overflow-hidden bg-panel-2" aria-label={p.name}>
        <img src={p.image} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" />
        {p.drugClass !== "ALKES" && <span className="absolute top-3 left-3 flex rounded-full bg-white/90 p-1 backdrop-blur"><ClassMark cls={p.drugClass} size={18} labelled /></span>}
        {p.needsPrescription && <span className="absolute top-3 right-3 rounded-full bg-bad px-2.5 py-1 text-[11px] font-bold text-white">Needs prescription</span>}
        {out && <span className="absolute inset-0 grid place-items-center bg-white/70 text-sm font-bold text-muted">Out of stock</span>}
      </a>
      <div className="flex flex-1 flex-col p-4">
        <ClassTag cls={p.drugClass} />
        <a href={link(`/p/${p.slug}`)} className="mt-1.5 font-bold leading-snug hover:text-brand">{p.name}</a>
        <p className="text-[13px] text-muted">{p.pack}</p>
        <div className="mt-auto flex items-end justify-between pt-4">
          <div>
            <p className="tnum text-lg font-extrabold text-brand">{rp(p.price)}</p>
            {!out && p.available <= 5 && <p className="text-xs font-semibold text-warn">Only {p.available} left</p>}
          </div>
          <button disabled={out} aria-label={`Add ${p.name} to cart`}
            onClick={() => { const msg = add(p, 1); if (msg) toast(msg, "bad"); else { toast(`${p.name} added to cart`); setCartOpen(true); } }}
            className="grid size-11 place-items-center rounded-full bg-brand text-white transition hover:bg-brand-2 active:scale-95 disabled:opacity-30"><Plus size={20} /></button>
        </div>
      </div>
    </article>
  );
}
