import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, type Me, type Product } from "./api";

export interface CartLine { productId: number; slug: string; name: string; price: number; image: string; drugClass: Product["drugClass"]; maxPerOrder: number | null; available: number; qty: number; }

interface Store {
  me: Me | null; meLoaded: boolean; setMe: (m: Me | null) => void; signOut: () => Promise<void>;
  cart: CartLine[]; add: (p: Product, qty: number) => string | null; setQty: (id: number, qty: number) => void; clear: () => void;
  cartOpen: boolean; setCartOpen: (v: boolean) => void;
  toast: (text: string, tone?: "good" | "bad") => void; toasts: { id: number; text: string; tone: "good" | "bad" }[];
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => { const s = useContext(Ctx); if (!s) throw new Error("no store"); return s; };

const KEY = "teduh:cart:v1";
const limit = (l: Pick<CartLine, "maxPerOrder" | "available">) => Math.min(20, l.available, l.maxPerOrder ?? 20);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);
  const [cart, setCart] = useState<CartLine[]>(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } });
  const [cartOpen, setCartOpen] = useState(false);
  const [toasts, setToasts] = useState<Store["toasts"]>([]);

  useEffect(() => { api.me().then(setMe).catch((e) => { if (!(e instanceof ApiError && e.status === 401)) console.warn(e); }).finally(() => setMeLoaded(true)); }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch { /* storage blocked: keep the cart in memory */ } }, [cart]);

  const toast = useCallback((text: string, tone: "good" | "bad" = "good") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  /** Adds to the cart within the per-order limit and the stock. Returns a message when it had to stop short. */
  const add = useCallback((p: Product, qty: number) => {
    const cur = cart.find((l) => l.productId === p.id)?.qty ?? 0;
    const max = limit({ maxPerOrder: p.maxPerOrder, available: p.available });
    const next = Math.min(max, cur + qty);
    setCart((c) => c.some((l) => l.productId === p.id)
      ? c.map((l) => (l.productId === p.id ? { ...l, qty: next, available: p.available, price: p.price } : l))
      : [...c, { productId: p.id, slug: p.slug, name: p.name, price: p.price, image: p.image, drugClass: p.drugClass, maxPerOrder: p.maxPerOrder, available: p.available, qty: next }]);
    if (cur + qty > max) return p.maxPerOrder !== null && max === p.maxPerOrder ? `${p.name} is limited to ${max} per order.` : `Only ${max} in stock.`;
    return null;
  }, [cart]);
  const setQty = useCallback((id: number, qty: number) => setCart((c) => c.flatMap((l) => (l.productId !== id ? [l] : qty <= 0 ? [] : [{ ...l, qty: Math.min(qty, limit(l)) }]))), []);
  const clear = useCallback(() => setCart([]), []);
  const signOut = useCallback(async () => { await api.logout().catch(() => {}); setMe(null); location.hash = "#/"; }, []);

  const value = useMemo(() => ({ me, meLoaded, setMe, signOut, cart, add, setQty, clear, cartOpen, setCartOpen, toast, toasts }), [me, meLoaded, signOut, cart, add, setQty, clear, cartOpen, toast, toasts]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
