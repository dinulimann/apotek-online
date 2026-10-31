import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ClipboardCheck, LogOut, Minus, Package, Plus, Search, ShoppingBag, Trash2, UserRound } from "lucide-react";
import { rp } from "../lib/format";
import { go, link } from "../lib/router";
import { useStore } from "../lib/store";
import { Button, ClassMark, Drawer } from "./ui";

export function Logo({ light }: { light?: boolean }) {
  return (
    <a href="#/" className="flex items-center gap-2.5" aria-label="Apotek Teduh home">
      <img src="/favicon.svg" alt="" className="size-9" />
      <span className="leading-none"><span className={`block font-display text-xl font-semibold ${light ? "text-white" : ""}`}>Apotek Teduh</span><span className={`text-[11px] font-semibold tracking-wide ${light ? "text-white/60" : "text-muted"}`}>ONLINE PHARMACY</span></span>
    </a>
  );
}

function CartDrawer() {
  const { cart, setQty, cartOpen, setCartOpen } = useStore();
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const needsRx = cart.some((l) => l.drugClass === "KERAS");
  return (
    <Drawer open={cartOpen} onClose={() => setCartOpen(false)} title="Your cart">
      {cart.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted">
          <ShoppingBag size={40} strokeWidth={1.4} />
          <p className="mt-3">Your cart is empty.</p>
          <Button className="mt-5" onClick={() => { setCartOpen(false); go("/shop"); }}>Browse medicines</Button>
        </div>
      ) : (
        <>
          <ul className="flex-1 divide-y divide-line overflow-y-auto px-6" data-testid="cart">
            {cart.map((l) => {
              const max = Math.min(20, l.available, l.maxPerOrder ?? 20);
              return (
                <li key={l.productId} className="flex gap-4 py-4">
                  <img src={l.image} alt="" className="size-20 rounded-2xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-bold leading-snug"><ClassMark cls={l.drugClass} size={14} labelled />{l.name}</p>
                    <p className="tnum text-sm text-muted">{rp(l.price)}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center rounded-full border border-line">
                        <button aria-label={`One less ${l.name}`} onClick={() => setQty(l.productId, l.qty - 1)} className="grid size-9 place-items-center">{l.qty === 1 ? <Trash2 size={15} className="text-bad" /> : <Minus size={15} />}</button>
                        <span className="tnum w-6 text-center font-bold">{l.qty}</span>
                        <button aria-label={`One more ${l.name}`} disabled={l.qty >= max} onClick={() => setQty(l.productId, l.qty + 1)} className="grid size-9 place-items-center disabled:opacity-30"><Plus size={15} /></button>
                      </div>
                      <span className="tnum font-bold">{rp(l.price * l.qty)}</span>
                    </div>
                    {l.maxPerOrder !== null && l.qty >= l.maxPerOrder && <p className="mt-1 text-xs text-info">Limited to {l.maxPerOrder} per order</p>}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="space-y-3 border-t border-line p-6">
            {needsRx && <p className="flex gap-2 rounded-2xl bg-bad-soft px-4 py-3 text-[13px] text-bad"><ClassMark cls="KERAS" size={16} /> Your cart has prescription medicine. You'll upload the prescription at checkout and a pharmacist checks it before you pay.</p>}
            <div className="flex justify-between text-sm"><span className="text-muted">Subtotal</span><span className="tnum font-bold">{rp(subtotal)}</span></div>
            <p className="text-xs text-muted">{subtotal >= 150_000 ? "Free delivery on this order." : `Add ${rp(150_000 - subtotal)} more for free delivery.`}</p>
            <Button className="w-full" size="lg" onClick={() => { setCartOpen(false); go("/checkout"); }}>Checkout</Button>
          </div>
        </>
      )}
    </Drawer>
  );
}

export function Header() {
  const { me, cart, setCartOpen, signOut } = useStore();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const count = cart.reduce((s, l) => s + l.qty, 0);
  // "apt. Rina Kusuma, S.Farm." -> "Rina": skip professional titles before the first name.
  const first = me?.name.split(/[\s,]+/).find((w) => w && !/^(apt|dr|drs|ir|prof)\.?$/i.test(w)) ?? "";
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-18 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Logo />
        <form className="relative ml-4 hidden max-w-md flex-1 md:block" onSubmit={(e) => { e.preventDefault(); go(link("/shop", { q }).slice(1)); }} role="search">
          <Search size={18} className="absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search paracetamol, vitamin C, masks…" aria-label="Search medicines" className="h-11 w-full rounded-full border border-line bg-panel pr-4 pl-11 text-sm outline-none focus:border-brand" />
        </form>
        <nav className="ml-auto flex items-center gap-1" aria-label="Main">
          <a href="#/shop" className="hidden rounded-full px-4 py-2 text-sm font-bold hover:bg-panel-2 sm:block">Shop</a>
          {me?.role === "PHARMACIST" && <a href="#/admin" className="hidden items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-brand hover:bg-brand-soft sm:flex"><ClipboardCheck size={16} /> Pharmacist</a>}
          {me ? (
            <div className="relative">
              <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Account" className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold hover:bg-panel-2">
                <span className="grid size-8 place-items-center rounded-full bg-brand-soft text-brand">{first[0]}</span><span className="hidden lg:inline">{first}</span>
              </button>
              <AnimatePresence>
                {menu && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="shadow-soft absolute right-0 mt-2 w-56 rounded-2xl border border-line bg-panel p-2" onClick={() => setMenu(false)}>
                    <p className="px-3 py-2 text-xs text-muted">{me.email}</p>
                    <a href="#/orders" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-panel-2"><Package size={16} /> My orders</a>
                    {me.role === "PHARMACIST" && <a href="#/admin" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-panel-2"><ClipboardCheck size={16} /> Pharmacist desk</a>}
                    <button onClick={signOut} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-panel-2"><LogOut size={16} /> Sign out</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <a href="#/login" className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold hover:bg-panel-2"><UserRound size={17} /> Sign in</a>
          )}
          <button onClick={() => setCartOpen(true)} aria-label={`Cart, ${count} items`} className="relative grid size-11 place-items-center rounded-full bg-brand text-white hover:bg-brand-2">
            <ShoppingBag size={19} />
            {count > 0 && <span className="tnum absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-sun text-[11px] font-extrabold text-fg">{count}</span>}
          </button>
        </nav>
      </div>
      <CartDrawer />
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-20 bg-brand text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo light />
          <p className="mt-4 max-w-sm text-sm text-white/70">Apotek Teduh is a fictional pharmacy built as a portfolio project by Dinul Iman. Nothing here is real: no medicine is sold and no money moves.</p>
        </div>
        <div className="text-sm">
          <p className="font-bold">Medicine classes</p>
          <ul className="mt-3 space-y-2 text-white/80">
            {(["BEBAS", "BEBAS_TERBATAS", "KERAS"] as const).map((c) => <li key={c} className="flex items-center gap-2"><ClassMark cls={c} size={15} />{{ BEBAS: "Over the counter", BEBAS_TERBATAS: "Limited quantity per order", KERAS: "Prescription only" }[c]}</li>)}
          </ul>
        </div>
        <div className="text-sm text-white/70">
          <p className="font-bold text-white">Photos</p>
          <p className="mt-3">Product photos are illustrations from Wikimedia Commons under CC0 and Creative Commons licences, credited in <a className="underline" href="https://github.com/dinulimann/apotek-online/blob/main/CREDITS.md" target="_blank" rel="noreferrer">CREDITS.md</a>. They do not show the actual products.</p>
        </div>
      </div>
    </footer>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">{children}</main>;
}
