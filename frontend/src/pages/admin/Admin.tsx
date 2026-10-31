import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Boxes, CheckCircle2, ClipboardCheck, ExternalLink, FileText, PackageCheck, Truck, XCircle, ZoomIn } from "lucide-react";
import { api, ApiError, type Batch, type ExpiringRow, type Order, type OrderStatus, type StockRow } from "../../lib/api";
import { date, dateTime, rp, STATUS_LABEL } from "../../lib/format";
import { go, link } from "../../lib/router";
import { useStore } from "../../lib/store";
import { Badge, Button, ClassMark, Field, inputCls, Spinner } from "../../components/ui";
import { Items, StatusBadge, Timeline, Totals } from "../../components/OrderParts";

const TABS = [["", "Overview", ClipboardCheck], ["review", "Prescriptions", FileText], ["orders", "Orders", Truck], ["inventory", "Inventory", Boxes]] as const;

function Prescription({ o }: { o: Order }) {
  const [zoom, setZoom] = useState(false);
  const [kind, setKind] = useState<"image" | "pdf" | null>(null);
  const src = `/api/prescriptions/${o.prescriptionId}/file`;
  useEffect(() => { fetch(src, { method: "HEAD" }).then((r) => setKind(r.headers.get("content-type")?.includes("pdf") ? "pdf" : "image")); }, [src]);
  if (!kind) return <div className="grid h-80 place-items-center rounded-3xl bg-panel-2"><Spinner className="text-brand" /></div>;
  if (kind === "pdf") return <a href={src} target="_blank" rel="noreferrer" className="flex h-80 flex-col items-center justify-center gap-2 rounded-3xl bg-panel-2 font-bold text-brand"><FileText size={40} /> Open the PDF prescription <ExternalLink size={14} /></a>;
  return (
    <div className="relative">
      <button onClick={() => setZoom((z) => !z)} aria-label={zoom ? "Zoom out" : "Zoom in"} className={`block w-full overflow-auto rounded-3xl bg-panel-2 ${zoom ? "max-h-[75vh]" : ""}`}>
        <img src={src} alt="Customer's prescription" className={zoom ? "max-w-none" : "max-h-[70vh] w-full object-contain"} style={zoom ? { width: "180%" } : undefined} data-testid="rx-image" />
      </button>
      <span className="pointer-events-none absolute top-3 right-3 flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white"><ZoomIn size={13} /> {zoom ? "Click to fit" : "Click to zoom"}</span>
    </div>
  );
}

function Review({ number }: { number?: string }) {
  const { toast } = useStore();
  const [queue, setQueue] = useState<Order[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.admin.orders("AWAITING_REVIEW").then(setQueue), []);
  useEffect(() => { load(); }, [load]);
  const o = queue?.find((x) => x.number === number) ?? queue?.[0];
  useEffect(() => setNote(""), [o?.number]);
  if (!queue) return <div className="py-24 text-center"><Spinner className="text-brand" /></div>;
  if (!o) return <div className="py-24 text-center"><CheckCircle2 size={40} className="mx-auto text-good" /><p className="mt-3 font-display text-2xl">No prescriptions waiting</p></div>;
  const decide = async (approve: boolean) => {
    setBusy(true);
    try { await api.admin.review(o.number, approve, note); toast(approve ? `${o.number} approved` : `${o.number} rejected; stock returned`); load(); go("/admin/review"); }
    catch (e) { toast((e as ApiError).message, "bad"); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <ul className="space-y-2" aria-label="Waiting for review">
        {queue.map((x) => (
          <li key={x.number}><a href={link(`/admin/review/${x.number}`)} aria-current={x.number === o.number} className={`block rounded-2xl p-3 text-sm ${x.number === o.number ? "bg-brand text-white" : "bg-panel shadow-soft"}`}>
            <p className="font-mono font-bold">{x.number}</p><p className={x.number === o.number ? "text-white/70" : "text-muted"}>{x.customerName} · {dateTime(x.createdAt)}</p>
          </a></li>
        ))}
      </ul>
      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Prescription o={o} />
        <div className="space-y-5">
          <div><p className="font-mono text-xl font-bold">{o.number}</p><p className="text-sm text-muted">{o.customerName} · {o.customerEmail}</p></div>
          <section className="shadow-soft rounded-3xl bg-panel p-5">
            <p className="mb-1 text-sm font-bold">Check against the prescription</p>
            <Items o={o} showBatches />
            <p className="mt-3 flex items-center gap-2 rounded-2xl bg-bad-soft px-3 py-2 text-xs font-semibold text-bad"><ClassMark cls="KERAS" size={14} /> Prescription items: {o.items.filter((i) => i.drugClass === "KERAS").map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
          </section>
          <Field label="Note to the customer" hint="Required when rejecting: say what's wrong so they can fix it.">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={`${inputCls()} h-auto py-3`} placeholder="e.g. Prescription is older than 30 days" />
          </Field>
          <div className="flex gap-3">
            <Button variant="mint" className="flex-1" disabled={busy} onClick={() => decide(true)}><CheckCircle2 size={18} /> Approve</Button>
            <Button variant="danger" className="flex-1" disabled={busy || note.trim().length < 5} onClick={() => decide(false)}><XCircle size={18} /> Reject</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Orders({ status }: { status: string }) {
  const { toast } = useStore();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [open, setOpen] = useState<Order | null>(null);
  const [tracking, setTracking] = useState("");
  const load = useCallback(() => api.admin.orders(status).then(setOrders), [status]);
  useEffect(() => { setOrders(null); load(); }, [load]);
  const act = async (fn: () => Promise<Order>, msg: string) => { try { const o = await fn(); setOpen(o); toast(msg); load(); } catch (e) { toast((e as ApiError).message, "bad"); } };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Status">
          {(["PAID", "SHIPPED", "AWAITING_PAYMENT", "DELIVERED", "REJECTED", "CANCELLED", ""] as const).map((s) => (
            <a key={s || "all"} role="tab" aria-selected={status === s} href={link("/admin/orders", { status: s || undefined })} className={`rounded-full px-3.5 py-1.5 text-sm font-bold ${status === s ? "bg-brand text-white" : "bg-panel text-muted"}`}>{s ? STATUS_LABEL[s] : "All"}</a>
          ))}
        </div>
        <div className="shadow-soft mt-4 overflow-x-auto rounded-3xl bg-panel">
          {!orders ? <div className="p-10 text-center"><Spinner className="text-brand" /></div> : orders.length === 0 ? <p className="p-8 text-center text-muted">No orders here.</p> : (
            <table className="w-full min-w-[620px] text-sm" aria-label="Orders">
              <thead className="text-left text-xs text-muted"><tr className="border-b border-line"><th className="px-5 py-3 font-semibold">Order</th><th className="px-3 font-semibold">Customer</th><th className="px-3 font-semibold">Status</th><th className="px-3 text-right font-semibold">Total</th><th className="px-5 text-right font-semibold">Placed</th></tr></thead>
              <tbody>{orders.map((o) => (
                <tr key={o.number} onClick={() => { setOpen(o); setTracking(""); }} className={`cursor-pointer border-b border-line last:border-0 hover:bg-panel-2 ${open?.number === o.number ? "bg-brand-soft" : ""}`}>
                  <td className="px-5 py-3 font-mono font-bold">{o.number}</td><td className="px-3">{o.customerName}</td><td className="px-3"><StatusBadge s={o.status} /></td>
                  <td className="tnum px-3 text-right font-semibold">{rp(o.total)}</td><td className="px-5 text-right text-muted">{dateTime(o.createdAt)}</td>
                </tr>))}</tbody>
            </table>
          )}
        </div>
      </div>
      {open ? (
        <aside className="shadow-soft h-fit space-y-5 rounded-3xl bg-panel p-5 lg:sticky lg:top-24" aria-label={`Order ${open.number}`}>
          <div className="flex items-center justify-between"><p className="font-mono font-bold">{open.number}</p><StatusBadge s={open.status} /></div>
          <p className="text-sm">{open.recipient} · {open.phone}<br /><span className="text-muted">{open.address}, {open.city} {open.postalCode}</span></p>
          <Items o={open} showBatches /><Totals o={open} />
          {open.status === "PAID" && (
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); act(() => api.admin.ship(open.number, tracking), `${open.number} shipped`); }}>
              <Field label="Courier tracking number"><input value={tracking} onChange={(e) => setTracking(e.target.value.toUpperCase())} placeholder="JNE-0012345678" className={inputCls()} /></Field>
              <Button type="submit" className="w-full" disabled={tracking.length < 6}><Truck size={17} /> Mark as shipped</Button>
            </form>
          )}
          {open.status === "SHIPPED" && <Button className="w-full" onClick={() => act(() => api.admin.deliver(open.number), `${open.number} delivered`)}><PackageCheck size={17} /> Mark as delivered</Button>}
          <div className="border-t border-line pt-4"><Timeline o={open} /></div>
        </aside>
      ) : <p className="hidden text-sm text-muted lg:block">Pick an order to see its items, batches and history.</p>}
    </div>
  );
}

function Inventory() {
  const { toast } = useStore();
  const [rows, setRows] = useState<StockRow[] | null>(null);
  const [expiring, setExpiring] = useState<ExpiringRow[]>([]);
  const [sel, setSel] = useState<StockRow | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [f, setF] = useState({ batchNo: "", expiryDate: "", qty: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const load = useCallback(() => { api.admin.inventory().then(setRows); api.admin.expiring(90).then(setExpiring); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (sel) api.admin.batches(sel.productId).then(setBatches); }, [sel]);
  const receive = async () => {
    if (!sel) return;
    setErrors({});
    try { await api.admin.receive(sel.productId, { batchNo: f.batchNo, expiryDate: f.expiryDate, qty: Number(f.qty) }); toast(`Batch ${f.batchNo.toUpperCase()} received`); setF({ batchNo: "", expiryDate: "", qty: "" }); api.admin.batches(sel.productId).then(setBatches); load(); }
    catch (e) { const err = e as ApiError; setErrors(err.errors as Record<string, string>); toast(err.message, "bad"); }
  };
  const writeOff = async (id: number) => { try { await api.admin.writeOff(id); toast("Expired stock written off"); load(); if (sel) api.admin.batches(sel.productId).then(setBatches); } catch (e) { toast((e as ApiError).message, "bad"); } };
  const statusTone = { SELLABLE: "good", NOT_FOR_SALE: "warn", EXPIRED: "bad" } as const;

  return (
    <div className="space-y-6">
      {expiring.length > 0 && (
        <section className="rounded-3xl bg-warn-soft p-5" aria-label="Expiring soon">
          <p className="flex items-center gap-2 font-bold text-warn"><AlertTriangle size={18} /> Expired or expiring within 90 days</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {expiring.map((e) => (
              <li key={e.batchId} className="flex items-center justify-between gap-2 rounded-2xl bg-panel px-4 py-2.5 text-sm">
                <span><b>{e.product}</b><span className="block font-mono text-xs text-muted">{e.batchNo} · {e.qtyAvailable} pcs · {e.daysLeft < 0 ? `expired ${-e.daysLeft} days ago` : `${e.daysLeft} days left`}</span></span>
                {e.daysLeft < 0 ? <Button size="sm" variant="danger" onClick={() => writeOff(e.batchId)}>Write off</Button> : <Badge tone={e.daysLeft < 30 ? "warn" : "neutral"}>{e.daysLeft < 30 ? "not sold online" : "sell first"}</Badge>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="shadow-soft overflow-x-auto rounded-3xl bg-panel">
          {!rows ? <div className="p-10 text-center"><Spinner className="text-brand" /></div> : (
            <table className="w-full min-w-[620px] text-sm" aria-label="Stock">
              <thead className="text-left text-xs text-muted"><tr className="border-b border-line"><th className="px-5 py-3 font-semibold">Product</th><th className="px-3 text-right font-semibold">Sellable</th><th className="px-3 text-right font-semibold">On hand</th><th className="px-3 font-semibold">Next expiry</th><th className="px-5 font-semibold" /></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.productId} onClick={() => setSel(r)} className={`cursor-pointer border-b border-line last:border-0 hover:bg-panel-2 ${sel?.productId === r.productId ? "bg-brand-soft" : ""}`}>
                  <td className="px-5 py-2.5"><span className="flex items-center gap-3"><img src={r.image} alt="" className="size-9 rounded-lg object-cover" /><span className="flex items-center gap-1.5 font-semibold"><ClassMark cls={r.drugClass} size={13} labelled />{r.name}</span></span></td>
                  <td className={`tnum px-3 text-right font-bold ${r.low ? "text-warn" : ""}`}>{r.sellable}</td>
                  <td className="tnum px-3 text-right text-muted">{r.onHand}</td>
                  <td className="px-3 text-muted">{r.nextExpiry ? date(r.nextExpiry) : "—"}</td>
                  <td className="px-5 text-right">{r.expiredOnHand > 0 ? <Badge tone="bad">{r.expiredOnHand} expired</Badge> : r.low ? <Badge tone="warn">low</Badge> : null}</td>
                </tr>))}</tbody>
            </table>
          )}
        </div>
        <aside className="shadow-soft h-fit rounded-3xl bg-panel p-5 lg:sticky lg:top-24">
          {!sel ? <p className="text-sm text-muted">Pick a product to see its batches and receive a delivery.</p> : (
            <>
              <p className="font-bold">{sel.name}</p>
              <p className="text-xs text-muted">Sold first-expiry-first-out. Batches with under 30 days left are kept off the online shop.</p>
              <ul className="mt-4 space-y-2" aria-label="Batches">
                {batches.map((b) => (
                  <li key={b.id} className="flex items-center justify-between rounded-2xl bg-panel-2 px-3.5 py-2.5 text-sm">
                    <span><span className="font-mono font-bold">{b.batchNo}</span><span className="block text-xs text-muted">exp {date(b.expiryDate)} · {b.qtyAvailable}/{b.qtyReceived}</span></span>
                    <span className="flex items-center gap-2"><Badge tone={statusTone[b.status]}>{b.status.replace(/_/g, " ").toLowerCase()}</Badge>{b.status === "EXPIRED" && b.qtyAvailable > 0 && <button onClick={() => writeOff(b.id)} className="text-xs font-bold text-bad underline">write off</button>}</span>
                  </li>
                ))}
              </ul>
              <form className="mt-5 space-y-3 border-t border-line pt-5" onSubmit={(e) => { e.preventDefault(); receive(); }}>
                <p className="text-sm font-bold">Receive a delivery</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Batch no." error={errors.batchNo}><input value={f.batchNo} onChange={(e) => setF({ ...f, batchNo: e.target.value })} className={inputCls(errors.batchNo)} /></Field>
                  <Field label="Quantity" error={errors.qty}><input value={f.qty} inputMode="numeric" onChange={(e) => setF({ ...f, qty: e.target.value.replace(/\D/g, "") })} className={inputCls(errors.qty)} /></Field>
                </div>
                <Field label="Expiry date" error={errors.expiryDate}><input type="date" value={f.expiryDate} onChange={(e) => setF({ ...f, expiryDate: e.target.value })} className={inputCls(errors.expiryDate)} /></Field>
                <Button type="submit" className="w-full" disabled={!f.batchNo || !f.expiryDate || !f.qty}>Add batch</Button>
              </form>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function Overview() {
  const [counts, setCounts] = useState<Record<OrderStatus, number> | null>(null);
  const [low, setLow] = useState<StockRow[]>([]);
  const [exp, setExp] = useState<ExpiringRow[]>([]);
  useEffect(() => { api.admin.counts().then(setCounts); api.admin.inventory().then((r) => setLow(r.filter((x) => x.low))); api.admin.expiring(30).then(setExp); }, []);
  if (!counts) return <div className="py-24 text-center"><Spinner className="text-brand" /></div>;
  const tiles = [
    ["Prescriptions to check", counts.AWAITING_REVIEW, "/admin/review", FileText, "info"],
    ["Paid, ready to pack", counts.PAID, "/admin/orders?status=PAID", Truck, "brand"],
    ["Low stock products", low.length, "/admin/inventory", Boxes, "warn"],
    ["Batches expired or under 30 days", exp.length, "/admin/inventory", AlertTriangle, "bad"],
  ] as const;
  const tone = { info: "bg-info-soft text-info", brand: "bg-brand-soft text-brand", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad" };
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="admin-tiles">
      {tiles.map(([label, n, to, Icon, t]) => (
        <a key={label} href={`#${to}`} className="shadow-soft rounded-3xl bg-panel p-6 transition hover:-translate-y-0.5">
          <span className={`grid size-11 place-items-center rounded-2xl ${tone[t]}`}><Icon size={20} /></span>
          <p className="tnum mt-4 text-4xl font-extrabold">{n}</p><p className="mt-1 text-sm font-semibold text-muted">{label}</p>
        </a>
      ))}
    </div>
  );
}

export default function Admin({ path, params }: { path: string[]; params: URLSearchParams }) {
  const { me, meLoaded } = useStore();
  useEffect(() => { if (meLoaded && !me) go("/login?next=/admin"); }, [me, meLoaded]);
  if (!me) return null;
  if (me.role !== "PHARMACIST") return <div className="py-32 text-center"><p className="font-display text-3xl">This area is for pharmacists.</p></div>;
  const tab = path[1] ?? "";
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold text-mint">Pharmacist desk</p><h1 className="font-display text-4xl font-semibold">{me.name}</h1></div>
        <nav className="flex gap-1 rounded-full bg-panel p-1 shadow-soft" aria-label="Pharmacist">
          {TABS.map(([t, label, Icon]) => <a key={t} href={`#/admin${t ? `/${t}` : ""}`} aria-current={tab === t ? "page" : undefined} className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold ${tab === t ? "bg-brand text-white" : "text-muted hover:text-fg"}`}><Icon size={16} /><span className="hidden sm:inline">{label}</span></a>)}
        </nav>
      </div>
      <div className="mt-8">
        {tab === "" && <Overview />}
        {tab === "review" && <Review number={path[2]} />}
        {tab === "orders" && <Orders status={params.get("status") ?? "PAID"} />}
        {tab === "inventory" && <Inventory />}
      </div>
    </div>
  );
}
