import { CheckCircle2, Circle, Clock, PackageCheck, Truck, XCircle } from "lucide-react";
import type { Order } from "../lib/api";
import { date, dateTime, rp, STATUS_LABEL, STATUS_TONE } from "../lib/format";
import { Badge, ClassMark } from "./ui";

export const StatusBadge = ({ s }: { s: Order["status"] }) => <Badge tone={STATUS_TONE[s]}>{STATUS_LABEL[s]}</Badge>;

const EVENT_LABEL: Record<string, string> = { PLACED: "Order placed", APPROVED: "Prescription approved", REJECTED: "Prescription not accepted", PAID: "Paid", SHIPPED: "Handed to the courier", DELIVERED: "Delivered", CANCELLED: "Cancelled", EXPIRED: "Cancelled: not paid in time" };
const EVENT_ICON: Record<string, typeof Circle> = { PLACED: Clock, APPROVED: CheckCircle2, REJECTED: XCircle, PAID: CheckCircle2, SHIPPED: Truck, DELIVERED: PackageCheck, CANCELLED: XCircle, EXPIRED: XCircle };

export function Timeline({ o }: { o: Order }) {
  return (
    <ol className="space-y-4" aria-label="Order history">
      {o.events.map((e, i) => {
        const Icon = EVENT_ICON[e.type] ?? Circle;
        const bad = ["REJECTED", "CANCELLED", "EXPIRED"].includes(e.type);
        return (
          <li key={i} className="flex gap-3">
            <span className={`grid size-8 shrink-0 place-items-center rounded-full ${bad ? "bg-bad-soft text-bad" : i === o.events.length - 1 ? "bg-brand text-white" : "bg-brand-soft text-brand"}`}><Icon size={16} /></span>
            <div className="text-sm"><p className="font-bold">{EVENT_LABEL[e.type] ?? e.type}</p><p className="text-xs text-muted">{dateTime(e.at)}{e.actor ? ` · ${e.actor}` : ""}</p>{e.note && <p className="mt-1 text-muted">{e.note}</p>}</div>
          </li>
        );
      })}
    </ol>
  );
}

export function Items({ o, showBatches }: { o: Order; showBatches?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {o.items.map((it) => (
        <li key={it.productId} className="flex gap-4 py-3">
          <img src={it.image} alt="" className="size-14 rounded-xl object-cover" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="flex items-center gap-1.5 font-bold"><ClassMark cls={it.drugClass} size={13} labelled />{it.name}</p>
            <p className="text-muted">{it.qty} × {rp(it.unitPrice)}</p>
            {showBatches && it.batches.map((b) => <p key={b.batchNo} className="font-mono text-xs text-muted">batch {b.batchNo} · exp {date(b.expiryDate)} · {b.qty} pcs</p>)}
          </div>
          <span className="tnum text-sm font-bold">{rp(it.lineTotal)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Totals({ o }: { o: Order }) {
  return (
    <dl className="space-y-1.5 text-sm">
      <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tnum">{rp(o.subtotal)}</dd></div>
      <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tnum">{o.shippingFee ? rp(o.shippingFee) : "Free"}</dd></div>
      <div className="flex justify-between text-base font-extrabold"><dt>Total</dt><dd className="tnum">{rp(o.total)}</dd></div>
    </dl>
  );
}
