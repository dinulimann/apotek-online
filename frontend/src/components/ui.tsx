import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import type { DrugClass } from "../lib/api";

export function Button({ variant = "primary", size = "md", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "mint"; size?: "sm" | "md" | "lg" }) {
  const v = {
    primary: "bg-brand text-white hover:bg-brand-2",
    mint: "bg-mint text-white hover:brightness-105",
    secondary: "border border-line bg-panel hover:bg-panel-2",
    ghost: "text-muted hover:bg-panel-2 hover:text-fg",
    danger: "border border-bad/30 bg-panel text-bad hover:bg-bad-soft",
  }[variant];
  const s = { sm: "h-9 px-3 text-[13px]", md: "h-11 px-5 text-sm", lg: "h-13 px-6 text-[15px]" }[size];
  return <button {...rest} className={`inline-flex items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${s} ${v} ${className}`} />;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "good" | "bad" | "warn" | "info" | "brand"; children: ReactNode }) {
  const t = { neutral: "bg-panel-2 text-muted", good: "bg-good-soft text-good", bad: "bg-bad-soft text-bad", warn: "bg-warn-soft text-warn", info: "bg-info-soft text-info", brand: "bg-brand-soft text-brand" }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${t}`}>{children}</span>;
}

/** Indonesia's medicine class marks: green dot (bebas), blue dot (bebas terbatas), red dot with K (keras). */
export const CLASS_INFO: Record<DrugClass, { label: string; short: string; color: string }> = {
  BEBAS: { label: "Obat Bebas · over the counter", short: "Over the counter", color: "#2f9e4f" },
  BEBAS_TERBATAS: { label: "Obat Bebas Terbatas · limited quantity", short: "Limited", color: "#2563c4" },
  KERAS: { label: "Obat Keras · prescription only", short: "Prescription", color: "#d1352b" },
  ALKES: { label: "Alat kesehatan · health product", short: "Health product", color: "#7a8a8c" },
};

/** With `labelled`, the mark names itself for screen readers; otherwise it is decorative next to text that already says the class. */
export function ClassMark({ cls, size = 18, labelled }: { cls: DrugClass; size?: number; labelled?: boolean }) {
  if (cls === "ALKES") return null;
  const c = CLASS_INFO[cls].color;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...(labelled ? { role: "img", "aria-label": CLASS_INFO[cls].label } : { "aria-hidden": true })} className="shrink-0">
      <circle cx="10" cy="10" r="8.6" fill={c} stroke="#111" strokeWidth="1.6" />
      {cls === "KERAS" && <path d="M7 5.2v9.6M7 10.2l5.6-5M8.9 8.6l4 6.2" stroke="#111" strokeWidth="1.9" fill="none" strokeLinecap="round" />}
    </svg>
  );
}

export function ClassTag({ cls }: { cls: DrugClass }) {
  return <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted"><ClassMark cls={cls} size={14} />{CLASS_INFO[cls].short}</span>;
}

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => ref.current?.querySelector<HTMLElement>("button, a, input")?.focus(), 50);
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", on);
    return () => { removeEventListener("keydown", on); prev?.focus?.(); };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-[#0b2a31]/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside ref={ref} role="dialog" aria-modal="true" aria-label={title} initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 32, stiffness: 320 }}
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-panel shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="font-display text-xl font-semibold">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full text-muted hover:bg-panel-2"><X size={20} /></button>
            </div>
            {children}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-bold">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error ? <span className="mt-1 block text-xs font-semibold text-bad">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputCls = (error?: string) => `h-12 w-full rounded-2xl border bg-panel px-4 text-[15px] outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10 ${error ? "border-bad" : "border-line"}`;

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} aria-hidden />;
}
