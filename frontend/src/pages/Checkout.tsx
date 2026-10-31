import { useEffect, useRef, useState, type FormEvent } from "react";
import { FileText, Lock, UploadCloud, X } from "lucide-react";
import { api, ApiError, type Prescription } from "../lib/api";
import { rp } from "../lib/format";
import { go } from "../lib/router";
import { useStore } from "../lib/store";
import { Button, ClassMark, Field, inputCls, Spinner } from "../components/ui";

export default function Checkout() {
  const { me, meLoaded, cart, clear, toast } = useStore();
  const [f, setF] = useState({ recipient: "", phone: "", address: "", city: "", postalCode: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rx, setRx] = useState<Prescription | null>(null);
  const [rxPreview, setRxPreview] = useState<string | null>(null);
  const [doctor, setDoctor] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  // One key per checkout attempt, so a retry after a network error cannot create a second order.
  const key = useRef(crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (meLoaded && !me) go("/login?next=/checkout"); }, [me, meLoaded]);
  useEffect(() => { if (me) setF((x) => ({ ...x, recipient: x.recipient || me.name })); }, [me]);
  if (!me) return null;
  if (cart.length === 0) return <div className="py-32 text-center"><p className="font-display text-3xl">Your cart is empty.</p><a href="#/shop" className="mt-4 inline-block font-bold text-brand underline">Go shopping</a></div>;

  const needsRx = cart.some((l) => l.drugClass === "KERAS");
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const shipping = subtotal >= 150_000 ? 0 : 15_000;

  const upload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) { toast("Files can be at most 5 MB.", "bad"); return; }
    setUploading(true);
    try {
      const p = await api.uploadPrescription(file, doctor);
      setRx(p);
      setRxPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    } catch (e) { toast((e as ApiError).message, "bad"); }
    finally { setUploading(false); }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (needsRx && !rx) { toast("Upload the prescription first.", "bad"); return; }
    setBusy(true); setErrors({});
    try {
      const o = await api.placeOrder({ items: cart.map((l) => ({ productId: l.productId, qty: l.qty })), ...f, prescriptionId: needsRx ? rx?.id : undefined }, key.current);
      clear();
      go(`/orders/${o.number}?placed=1`);
    } catch (err) {
      const e2 = err as ApiError;
      setErrors(e2.errors as Record<string, string>);
      toast(e2.code === "out_of_stock" ? `${e2.message} Update your cart and try again.` : e2.message, "bad");
      if (e2.code !== "network") key.current = crypto.randomUUID();
    } finally { setBusy(false); }
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form onSubmit={submit} noValidate className="mx-auto grid max-w-6xl gap-8 px-4 pt-8 sm:px-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-8">
        <h1 className="font-display text-4xl font-semibold">Checkout</h1>
        <section className="shadow-soft rounded-3xl bg-panel p-6">
          <h2 className="text-lg font-bold">Delivery address</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Recipient" error={errors.recipient}><input value={f.recipient} onChange={set("recipient")} autoComplete="name" className={inputCls(errors.recipient)} /></Field>
            <Field label="Mobile number" error={errors.phone}><input value={f.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" placeholder="0812…" className={inputCls(errors.phone)} /></Field>
            <div className="sm:col-span-2"><Field label="Address" error={errors.address}><textarea value={f.address} onChange={set("address")} rows={2} autoComplete="street-address" placeholder="Street, number, RT/RW, district" className={`${inputCls(errors.address)} h-auto py-3`} /></Field></div>
            <Field label="City" error={errors.city}><input value={f.city} onChange={set("city")} autoComplete="address-level2" className={inputCls(errors.city)} /></Field>
            <Field label="Postal code" error={errors.postalCode}><input value={f.postalCode} onChange={set("postalCode")} inputMode="numeric" autoComplete="postal-code" maxLength={5} className={inputCls(errors.postalCode)} /></Field>
          </div>
        </section>

        {needsRx && (
          <section className="shadow-soft rounded-3xl bg-panel p-6" aria-labelledby="rx-h">
            <h2 id="rx-h" className="flex items-center gap-2 text-lg font-bold"><ClassMark cls="KERAS" /> Prescription</h2>
            <p className="mt-1 text-sm text-muted">Your order includes prescription medicine. Upload a clear photo or PDF of the doctor's prescription. A pharmacist checks it before you pay.</p>
            {rx ? (
              <div className="mt-5 flex items-center gap-4 rounded-2xl border border-mint/40 bg-mint-soft p-4" data-testid="rx-uploaded">
                {rxPreview ? <img src={rxPreview} alt="Your prescription" className="size-20 rounded-xl object-cover" /> : <span className="grid size-20 place-items-center rounded-xl bg-white text-brand"><FileText size={30} /></span>}
                <div className="flex-1 text-sm"><p className="font-bold">Prescription uploaded</p><p className="text-muted">{(rx.sizeBytes / 1024).toFixed(0)} KB · only you and our pharmacists can see it</p></div>
                <button type="button" onClick={() => { setRx(null); setRxPreview(null); }} aria-label="Remove prescription" className="grid size-9 place-items-center rounded-full hover:bg-white"><X size={18} /></button>
              </div>
            ) : (
              <>
                <div className="mt-5"><Field label="Doctor's name (optional)"><input value={doctor} onChange={(e) => setDoctor(e.target.value)} className={inputCls()} /></Field></div>
                <button type="button" onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); const file = e.dataTransfer.files[0]; if (file) upload(file); }}
                  className={`mt-4 flex w-full flex-col items-center rounded-3xl border-2 border-dashed px-6 py-10 text-center transition ${drag ? "border-brand bg-brand-soft" : "border-line hover:border-brand/50"}`}>
                  {uploading ? <Spinner className="text-brand" /> : <UploadCloud size={34} className="text-brand" />}
                  <span className="mt-3 font-bold">Drop the prescription here, or choose a file</span>
                  <span className="mt-1 text-xs text-muted">JPEG, PNG or PDF, up to 5 MB</span>
                </button>
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" aria-label="Prescription file" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); e.target.value = ""; }} />
              </>
            )}
          </section>
        )}
      </div>

      <aside className="shadow-soft h-fit rounded-3xl bg-panel p-6 lg:sticky lg:top-24">
        <h2 className="text-lg font-bold">Order summary</h2>
        <ul className="mt-4 space-y-3">
          {cart.map((l) => (
            <li key={l.productId} className="flex gap-3 text-sm">
              <img src={l.image} alt="" className="size-12 rounded-xl object-cover" />
              <span className="flex-1"><span className="flex items-center gap-1 font-semibold"><ClassMark cls={l.drugClass} size={12} labelled />{l.name}</span><span className="text-muted">{l.qty} × {rp(l.price)}</span></span>
              <span className="tnum font-semibold">{rp(l.qty * l.price)}</span>
            </li>
          ))}
        </ul>
        {Object.entries(errors).filter(([k]) => k.startsWith("items")).map(([k, v]) => <p key={k} className="mt-3 text-sm font-semibold text-bad">{String(v)}</p>)}
        <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tnum">{rp(subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tnum">{shipping ? rp(shipping) : "Free"}</dd></div>
          <div className="flex justify-between pt-2 text-lg font-extrabold"><dt>Total</dt><dd className="tnum" data-testid="total">{rp(subtotal + shipping)}</dd></div>
        </dl>
        <Button type="submit" size="lg" className="mt-6 w-full" disabled={busy || (needsRx && !rx)}>{busy ? <Spinner /> : needsRx ? "Send to pharmacist" : "Place order"}</Button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted"><Lock size={12} /> {needsRx ? "You pay after the pharmacist approves." : "You'll pay on the next screen."}</p>
      </aside>
    </form>
  );
}
