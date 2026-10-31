import { useEffect, useState } from "react";

export interface Loc { path: string[]; params: URLSearchParams; }

function read(): Loc {
  const [p, q = ""] = location.hash.replace(/^#\/?/, "").split("?");
  return { path: p.split("/").filter(Boolean).map(decodeURIComponent), params: new URLSearchParams(q) };
}

export function useLoc() {
  const [loc, set] = useState(read);
  useEffect(() => {
    const on = () => { set(read()); };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return loc;
}

export const go = (path: string) => { location.hash = path.startsWith("#") ? path : `#${path}`; };
export const link = (path: string, params?: Record<string, string | number | undefined>) => {
  const q = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString() : "";
  return `#${path}${q ? `?${q}` : ""}`;
};
