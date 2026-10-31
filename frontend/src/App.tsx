import { useEffect } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useLoc } from "./lib/router";
import { StoreProvider, useStore } from "./lib/store";
import { Footer, Header } from "./components/Layout";
import Home from "./pages/Home";
import Shop from "./pages/Shop";
import ProductPage from "./pages/ProductPage";
import Auth from "./pages/Auth";
import Checkout from "./pages/Checkout";
import { OrderDetail, OrderList } from "./pages/Orders";
import Admin from "./pages/admin/Admin";

function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.p key={t.id} layout initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}
            className={`rounded-full px-5 py-3 text-sm font-bold shadow-xl ${t.tone === "bad" ? "bg-bad text-white" : "bg-fg text-white"}`}>{t.text}</motion.p>
        ))}
      </AnimatePresence>
    </div>
  );
}

function Routes() {
  const { path, params } = useLoc();
  useEffect(() => { scrollTo({ top: 0 }); }, [path.join("/")]);
  const [a, b] = path;
  const next = params.get("next") ?? "/";
  let page;
  if (!a) page = <Home />;
  else if (a === "shop") page = <Shop params={params} />;
  else if (a === "p" && b) page = <ProductPage slug={b} />;
  else if (a === "login") page = <Auth mode="login" next={next} />;
  else if (a === "register") page = <Auth mode="register" next={next} />;
  else if (a === "checkout") page = <Checkout />;
  else if (a === "orders" && b) page = <OrderDetail number={b} placed={params.get("placed") === "1"} />;
  else if (a === "orders") page = <OrderList />;
  else if (a === "admin") page = <Admin path={path} params={params} />;
  else page = <div className="py-32 text-center"><p className="font-display text-3xl">Page not found</p><a href="#/" className="mt-4 inline-block font-bold text-brand underline">Go home</a></div>;
  return <>{page}</>;
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <StoreProvider>
        <Header />
        <Routes />
        <Footer />
        <Toasts />
      </StoreProvider>
    </MotionConfig>
  );
}
