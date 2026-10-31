import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CreditCard, FileText, MapPin } from "lucide-react";
import { api, ApiError, type Order } from "../lib/api";
import { dateTime, rp } from "../lib/format";
import { go } from "../lib/router";
import { useStore } from "../lib/store";
import { Button, Spinner } from "../components/ui";
import { Items, StatusBadge, Timeline, Totals } from "../components/OrderParts";

function useSignedIn(next: string) {
  const { me, meLoaded } = useStore();
  useEffect(() => { if (meLoaded && !me) go(`/login?next=${encodeURIComponent(next)}`); }, [me, meLoaded, next]);
  return me;
}

export function OrderList() {
  const me = useSignedIn("/orders");
  const [orders, setOrders] = useState<Order[] | null>(null);
  useEffect(() => { if (me) api.myOrders().then(setOrders); }, [me]);
  if (!orders) return <div className="py-32 text-center"><Spinner className="text-brand" /></div>;
  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6">
      <h1 className="font-display text-4xl font-semibold">My orders</h1>
      {orders.length === 0 ? <p className="mt-6 text-muted">No orders yet. <a className="font-bold text-brand" href="#/shop">Start shopping</a></p> : (
        <ul className="mt-6 space-y-3">
          {orders.map((o) => (
            <li key={o.number}><a href={`#/orders/${o.number}`} className="shadow-soft flex items-center gap-4 rounded-3xl bg-panel p-4 transition hover:-translate-y-0.5">
              <div className="flex -space-x-3">{o.items.slice(0, 3).map((it) => <img key={it.productId} src={it.image} alt="" className="size-12 rounded-xl object-cover ring-2 ring-panel" />)}</div>
              <div className="min-w-0 flex-1"><p className="font-mono text-sm font-bold">{o.number}</p><p className="truncate text-sm text-muted">{o.items.map((i) => i.name).join(", ")}</p></div>
              <div className="text-right"><StatusBadge s={o.status} /><p className="tnum mt-1 text-sm font-bold">{rp(o.total)}</p></div>
            </a></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Due({ until }: { until: string }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(t); }, []);
  const mins = Math.max(0, Math.round((new Date(until).getTime() - Date.now()) / 60_000));
  return <>{mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}</>;
}

export function OrderDetail({ number, placed }: { number: string; placed: boolean }) {
  const me = useSignedIn(`/orders/${number}`);
  const { toast } = useStore();
  const [o, setO] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.myOrder(number).then(setO).catch(() => toast("Order not found.", "bad")), [number, toast]);
  useEffect(() => { if (me) load(); }, [me, load]);
  useEffect(() => { // follow the pharmacist's review without a reload
    if (o?.status !== "AWAITING_REVIEW") return;
    const t = setInterval(load, 5000); return () => clearInterval(t);
  }, [o?.status, load]);
  if (!o) return <div className="py-32 text-center"><Spinner className="text-brand" /></div>;
  const act = async (fn: () => Promise<Order>, ok: string) => { setBusy(true); try { setO(await fn()); toast(ok); } catch (e) { toast((e as ApiError).message, "bad"); load(); } finally { setBusy(false); } };

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6">
      {placed && <p className="mb-6 flex items-center gap-2 rounded-3xl bg-mint-soft px-5 py-4 font-semibold text-[#17795f]"><CheckCircle2 size={20} /> {o.status === "AWAITING_REVIEW" ? "Order sent. A pharmacist will check your prescription; this page updates by itself." : "Order placed. Pay below to confirm it."}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold">{o.number}</h1><StatusBadge s={o.status} />
      </div>
      <p className="mt-1 text-sm text-muted">Placed {dateTime(o.createdAt)}</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {o.status === "AWAITING_PAYMENT" && o.paymentDueAt && (
            <section className="rounded-3xl bg-brand p-6 text-white">
              <p className="text-sm text-white/70">Amount to pay</p>
              <p className="tnum text-4xl font-extrabold">{rp(o.total)}</p>
              <p className="mt-1 text-sm text-white/70">Pay within <b className="text-white"><Due until={o.paymentDueAt} /></b>, or the order is cancelled and the items go back on the shelf.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button variant="mint" disabled={busy} onClick={() => act(() => api.pay(o.number), "Payment received. Thank you!")}><CreditCard size={18} /> Pay now (demo)</Button>
                <Button variant="ghost" className="text-white/80 hover:bg-white/10 hover:text-white" disabled={busy} onClick={() => act(() => api.cancel(o.number), "Order cancelled")}>Cancel order</Button>
              </div>
              <p className="mt-3 text-xs text-white/60">This demo has no payment gateway; the button stands in for the bank's confirmation.</p>
            </section>
          )}
          {o.status === "AWAITING_REVIEW" && (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-info-soft p-6 text-info">
              <p className="text-sm"><b className="block text-base">A pharmacist is checking your prescription.</b>Your items are held for you meanwhile. You'll pay only after approval.</p>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => act(() => api.cancel(o.number), "Order cancelled")}>Cancel</Button>
            </section>
          )}
          {o.status === "REJECTED" && <section className="rounded-3xl bg-bad-soft p-6 text-bad"><b>The pharmacist could not accept this prescription.</b><p className="mt-1 text-sm">“{o.reviewNote}”: {o.reviewedBy}. Nothing was charged.</p></section>}
          {o.status === "SHIPPED" && <section className="rounded-3xl bg-brand-soft p-6 text-brand"><b>On the way.</b><p className="mt-1 font-mono text-sm">Tracking {o.trackingNo}</p></section>}
          <section className="shadow-soft rounded-3xl bg-panel p-6"><h2 className="mb-2 font-bold">Items</h2><Items o={o} showBatches /><div className="mt-4 border-t border-line pt-4"><Totals o={o} /></div></section>
        </div>
        <aside className="space-y-6">
          <section className="shadow-soft rounded-3xl bg-panel p-6"><h2 className="mb-4 font-bold">History</h2><Timeline o={o} /></section>
          <section className="shadow-soft rounded-3xl bg-panel p-6 text-sm">
            <h2 className="mb-2 flex items-center gap-2 font-bold"><MapPin size={16} /> Delivery</h2>
            <p>{o.recipient} · {o.phone}</p><p className="text-muted">{o.address}, {o.city} {o.postalCode}</p>
            {o.prescriptionId && <a href={`/api/prescriptions/${o.prescriptionId}/file`} target="_blank" rel="noreferrer" className="mt-4 flex items-center gap-2 font-bold text-brand"><FileText size={16} /> View your prescription</a>}
          </section>
        </aside>
      </div>
    </div>
  );
}
