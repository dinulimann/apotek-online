import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, BadgeCheck, CalendarClock, FileCheck2, HeartPulse, Leaf, Pill, Search, ShieldPlus, Stethoscope, Thermometer, Truck, Wind } from "lucide-react";
import { api, type Category, type Product } from "../lib/api";
import { go, link } from "../lib/router";
import ProductCard from "../components/ProductCard";
import { ClassMark } from "../components/ui";

const ICONS: Record<string, typeof Pill> = { pain: Thermometer, cold: Wind, vitamins: HeartPulse, prescription: FileCheck2, herbal: Leaf, firstaid: ShieldPlus, devices: Stethoscope };

export default function Home() {
  const [cats, setCats] = useState<Category[]>([]);
  const [popular, setPopular] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    api.categories().then(setCats);
    api.products({ size: 48 }).then((p) => setPopular(["vitamin-c-1000", "paracetamol-500", "medical-masks", "digital-thermometer", "jamu-kunyit-asam", "cough-syrup-dmp", "amoxicillin-500", "aloe-vera-gel"].map((s) => p.items.find((x) => x.slug === s)!).filter(Boolean)));
  }, []);

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pt-10 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="inline-flex items-center gap-2 rounded-full bg-mint-soft px-3 py-1.5 text-xs font-bold text-[#17795f]"><BadgeCheck size={15} /> Every prescription checked by a licensed pharmacist</span>
            <h1 className="mt-5 font-display text-[2.6rem] leading-[1.05] font-semibold tracking-tight sm:text-6xl">Your neighbourhood pharmacy, <em className="text-brand">delivered.</em></h1>
            <p className="mt-5 max-w-lg text-lg text-muted">Everyday medicines, vitamins and health devices, plus prescription medicine once our pharmacist has seen your doctor's prescription.</p>
            <form className="mt-8 flex max-w-lg gap-2 rounded-full bg-panel p-2 shadow-soft" role="search" onSubmit={(e) => { e.preventDefault(); go(link("/shop", { q }).slice(1)); }}>
              <Search size={20} className="ml-3 self-center text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What do you need today?" aria-label="Search medicines" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
              <button className="rounded-full bg-brand px-6 py-3 text-sm font-bold text-white hover:bg-brand-2">Search</button>
            </form>
            <div className="mt-8 flex flex-wrap gap-6 text-sm font-semibold text-muted">
              <span className="flex items-center gap-2"><Truck size={18} className="text-mint" /> Free delivery from Rp 150.000</span>
              <span className="flex items-center gap-2"><CalendarClock size={18} className="text-mint" /> At least 30 days before expiry</span>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }} className="relative">
            <div className="aspect-[5/4] overflow-hidden rounded-[2.5rem] rounded-tr-[7rem] shadow-soft">
              <img src="/img/hero-jars.jpg" alt="Amber apothecary jars on a glass shelf" className="size-full object-cover" />
            </div>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="shadow-soft absolute -bottom-6 left-4 flex items-center gap-3 rounded-3xl bg-panel p-4 sm:-left-8">
              <span className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-brand"><FileCheck2 size={22} /></span>
              <span className="text-sm"><b className="block">Upload a prescription</b><span className="text-muted">Checked by a pharmacist before you pay</span></span>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6" aria-labelledby="cats">
        <h2 id="cats" className="font-display text-3xl font-semibold">Shop by need</h2>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {cats.map((c) => {
            const Icon = ICONS[c.slug] ?? Pill;
            return (
              <a key={c.slug} href={link("/shop", { category: c.slug })} className="shadow-soft group rounded-3xl bg-panel p-5 transition hover:-translate-y-1">
                <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand transition group-hover:bg-brand group-hover:text-white"><Icon size={22} /></span>
                <p className="mt-4 text-sm leading-snug font-bold">{c.name}</p>
                <p className="text-xs text-muted">{c.products} products</p>
              </a>
            );
          })}
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-7xl px-4 sm:px-6">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-3xl font-semibold">Popular this week</h2>
          <a href="#/shop" className="flex items-center gap-1 text-sm font-bold text-brand hover:underline">See everything <ArrowRight size={16} /></a>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{popular.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      </section>

      <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6">
        <div className="grid overflow-hidden rounded-[2.5rem] bg-brand text-white lg:grid-cols-2">
          <img src="/img/counter.jpg" alt="Medicine packs in a pharmacy display counter" className="h-72 w-full object-cover lg:h-full" />
          <div className="p-8 sm:p-12">
            <h2 className="font-display text-4xl font-semibold">How prescription orders work</h2>
            <ol className="mt-8 space-y-6">
              {[["Add the medicine and upload your prescription", "A photo or PDF of the doctor's prescription, up to 5 MB."],
                ["A pharmacist checks it", "We hold the stock for you while they compare it with your order."],
                ["Pay, and we deliver", "You pay only after approval. If it's not accepted, you're told why and nothing is charged."]].map(([t, d], i) => (
                <li key={t} className="flex gap-4"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-mint font-bold">{i + 1}</span><span><b className="block">{t}</b><span className="text-sm text-white/70">{d}</span></span></li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6">
        <h2 className="font-display text-3xl font-semibold">What the coloured dots mean</h2>
        <p className="mt-2 max-w-2xl text-muted">Medicines in Indonesia carry a mark on the pack that tells you how they can be sold.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {([["BEBAS", "Obat Bebas", "Sold freely, like paracetamol and vitamins."], ["BEBAS_TERBATAS", "Obat Bebas Terbatas", "Sold without a prescription in limited amounts, with a warning on the pack. We cap how many you can order."], ["KERAS", "Obat Keras", "Prescription only, such as antibiotics and blood pressure medicine. A pharmacist must check your prescription."]] as const).map(([c, t, d]) => (
            <div key={c} className="shadow-soft rounded-3xl bg-panel p-6"><ClassMark cls={c} size={34} /><p className="mt-4 font-bold">{t}</p><p className="mt-1 text-sm text-muted">{d}</p></div>
          ))}
        </div>
      </section>
    </>
  );
}
