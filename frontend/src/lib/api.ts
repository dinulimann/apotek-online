// Client for the Spring Boot API. Writes carry the CSRF token from the XSRF-TOKEN cookie.

export type DrugClass = "BEBAS" | "BEBAS_TERBATAS" | "KERAS" | "ALKES";
export interface Product {
  id: number; slug: string; name: string; genericName: string; form: string; strength: string; pack: string;
  categorySlug: string; categoryName: string; drugClass: DrugClass; price: number; maxPerOrder: number | null; image: string;
  description: string; dosage: string; warnings: string; active: boolean; available: number; needsPrescription: boolean;
}
export interface Category { slug: string; name: string; products: number; }
export interface Page<T> { items: T[]; page: number; size: number; total: number; }
export interface Me { id: number; email: string; name: string; role: "CUSTOMER" | "PHARMACIST"; }
export type OrderStatus = "AWAITING_REVIEW" | "AWAITING_PAYMENT" | "PAID" | "SHIPPED" | "DELIVERED" | "REJECTED" | "CANCELLED";
export interface Order {
  id: number; number: string; status: OrderStatus; customerName: string; customerEmail: string;
  recipient: string; phone: string; address: string; city: string; postalCode: string;
  subtotal: number; shippingFee: number; total: number; prescriptionId: number | null; needsPrescription: boolean;
  reviewNote: string; reviewedBy: string | null; reviewedAt: string | null; trackingNo: string;
  createdAt: string; paymentDueAt: string | null; paidAt: string | null;
  items: { productId: number; slug: string; name: string; drugClass: DrugClass; image: string; unitPrice: number; qty: number; lineTotal: number; batches: { batchNo: string; expiryDate: string; qty: number }[] }[];
  events: { at: string; type: string; note: string; actor: string | null }[];
}
export interface Prescription { id: number; contentType: string; sizeBytes: number; doctorName: string; uploadedAt: string; }
export interface StockRow { productId: number; name: string; drugClass: DrugClass; image: string; onHand: number; sellable: number; expiredOnHand: number; nextExpiry: string | null; low: boolean; }
export interface Batch { id: number; productId: number; batchNo: string; expiryDate: string; qtyReceived: number; qtyAvailable: number; status: "SELLABLE" | "NOT_FOR_SALE" | "EXPIRED"; }
export interface ExpiringRow { batchId: number; productId: number; product: string; batchNo: string; expiryDate: string; qtyAvailable: number; daysLeft: number; }

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public errors: Record<string, unknown> = {}) { super(message); }
}

const xsrf = () => document.cookie.split("; ").find((c) => c.startsWith("XSRF-TOKEN="))?.slice(11) ?? "";

async function ensureToken() {
  if (!xsrf()) await fetch("/api/auth/csrf", { credentials: "same-origin" });
}

async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, retried = false): Promise<T> {
  const write = method !== "GET";
  if (write) await ensureToken();
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(path, {
      method, credentials: "same-origin",
      headers: { ...(isForm || body === undefined ? {} : { "Content-Type": "application/json" }), ...(write ? { "X-XSRF-TOKEN": decodeURIComponent(xsrf()) } : {}), ...headers },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network", "Cannot reach the pharmacy right now. Check your connection.");
  }
  // The token rotates at sign-in and sign-out; fetch a fresh one and try once more.
  if (res.status === 403 && write && !retried && !path.startsWith("/api/admin")) {
    await fetch("/api/auth/csrf", { credentials: "same-origin" });
    return request(method, path, body, headers, true);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.code ?? "error", data?.detail ?? `Request failed (${res.status}).`, data?.errors ?? {});
  return data as T;
}

const qs = (p: Record<string, string | number | boolean | undefined | null>) => new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])).toString();

export const api = {
  categories: () => request<Category[]>("GET", "/api/categories"),
  products: (p: { q?: string; category?: string; drugClass?: string; inStock?: boolean; sort?: string; page?: number; size?: number }) => request<Page<Product>>("GET", `/api/products?${qs(p)}`),
  product: (slug: string) => request<Product>("GET", `/api/products/${encodeURIComponent(slug)}`),
  me: () => request<Me>("GET", "/api/auth/me"),
  login: (email: string, password: string) => request<Me>("POST", "/api/auth/login", { email, password }),
  register: (b: { email: string; password: string; name: string; phone?: string }) => request<Me>("POST", "/api/auth/register", b),
  logout: () => request<void>("POST", "/api/auth/logout"),
  uploadPrescription: (file: File, doctorName: string) => { const f = new FormData(); f.append("file", file); f.append("doctorName", doctorName); return request<Prescription>("POST", "/api/prescriptions", f); },
  placeOrder: (body: unknown, key: string) => request<Order>("POST", "/api/orders", body, { "Idempotency-Key": key }),
  myOrders: () => request<Order[]>("GET", "/api/orders"),
  myOrder: (n: string) => request<Order>("GET", `/api/orders/${n}`),
  pay: (n: string) => request<Order>("POST", `/api/orders/${n}/pay`),
  cancel: (n: string) => request<Order>("POST", `/api/orders/${n}/cancel`),
  admin: {
    counts: () => request<Record<OrderStatus, number>>("GET", "/api/admin/orders/counts"),
    orders: (status = "") => request<Order[]>("GET", `/api/admin/orders?${qs({ status })}`),
    order: (n: string) => request<Order>("GET", `/api/admin/orders/${n}`),
    review: (n: string, approve: boolean, note: string) => request<Order>("POST", `/api/admin/orders/${n}/review`, { approve, note }),
    ship: (n: string, trackingNo: string) => request<Order>("POST", `/api/admin/orders/${n}/ship`, { trackingNo }),
    deliver: (n: string) => request<Order>("POST", `/api/admin/orders/${n}/deliver`),
    inventory: () => request<StockRow[]>("GET", "/api/admin/inventory"),
    batches: (productId: number) => request<Batch[]>("GET", `/api/admin/inventory/${productId}/batches`),
    receive: (productId: number, b: { batchNo: string; expiryDate: string; qty: number }) => request<Batch>("POST", `/api/admin/inventory/${productId}/batches`, b),
    expiring: (days = 90) => request<ExpiringRow[]>("GET", `/api/admin/inventory/expiring?days=${days}`),
    writeOff: (batchId: number) => request<Batch>("POST", `/api/admin/batches/${batchId}/write-off`),
  },
};
