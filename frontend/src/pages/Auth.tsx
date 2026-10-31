import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { go } from "../lib/router";
import { useStore } from "../lib/store";
import { Button, Field, inputCls } from "../components/ui";

export default function Auth({ mode, next }: { mode: "login" | "register"; next: string }) {
  const { setMe } = useStore();
  const [f, setF] = useState({ email: "", password: "", name: "", phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErrors({}); setMessage("");
    try {
      const me = mode === "login" ? await api.login(f.email, f.password) : await api.register({ email: f.email, password: f.password, name: f.name, phone: f.phone || undefined });
      setMe(me);
      go(me.role === "PHARMACIST" && next === "/" ? "/admin" : next);
    } catch (err) {
      const e2 = err as ApiError;
      setErrors(e2.errors as Record<string, string>);
      setMessage(e2.code === "invalid" ? "" : e2.message);
    } finally { setBusy(false); }
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2">
      <div className="hidden overflow-hidden rounded-[2.5rem] lg:block"><img src="/img/store-shelves.jpg" alt="" className="size-full object-cover" /></div>
      <form onSubmit={submit} className="self-center" noValidate>
        <h1 className="font-display text-4xl font-semibold">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="mt-2 text-muted">{mode === "login" ? "Sign in to check out and follow your orders." : "You'll need an account to order and to upload prescriptions."}</p>
        <div className="mt-8 space-y-4">
          {mode === "register" && <Field label="Full name" error={errors.name}><input autoComplete="name" value={f.name} onChange={set("name")} className={inputCls(errors.name)} /></Field>}
          <Field label="Email" error={errors.email}><input type="email" autoComplete="email" value={f.email} onChange={set("email")} className={inputCls(errors.email)} /></Field>
          <Field label="Password" error={errors.password} hint={mode === "register" ? "At least 8 characters." : undefined}><input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={f.password} onChange={set("password")} className={inputCls(errors.password)} /></Field>
          {mode === "register" && <Field label="Mobile number (optional)" error={errors.phone}><input inputMode="tel" autoComplete="tel" value={f.phone} onChange={set("phone")} placeholder="0812…" className={inputCls(errors.phone)} /></Field>}
        </div>
        {message && <p className="mt-4 rounded-2xl bg-bad-soft px-4 py-3 text-sm font-semibold text-bad" role="alert">{message}</p>}
        <Button type="submit" size="lg" className="mt-6 w-full" disabled={busy}>{mode === "login" ? "Sign in" : "Create account"}</Button>
        <p className="mt-4 text-center text-sm text-muted">
          {mode === "login" ? <>New here? <a className="font-bold text-brand" href={`#/register?next=${encodeURIComponent(next)}`}>Create an account</a></> : <>Have an account? <a className="font-bold text-brand" href={`#/login?next=${encodeURIComponent(next)}`}>Sign in</a></>}
        </p>
        {mode === "login" && <p className="mt-6 rounded-2xl bg-panel-2 px-4 py-3 text-[13px] text-muted">Demo: customer <b>sari@example.com</b> / <b>demo1234</b>, pharmacist <b>apoteker@teduh.example</b> / <b>apoteker123</b>.</p>}
      </form>
    </div>
  );
}
