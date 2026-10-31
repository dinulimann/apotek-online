const idr = new Intl.NumberFormat("id-ID");
export const rp = (n: number) => `Rp ${idr.format(n)}`;
const tz = { timeZone: "Asia/Jakarta" } as const;
export const date = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00+07:00` : iso).toLocaleDateString("en-GB", { ...tz, day: "numeric", month: "short", year: "numeric" });
export const dateTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { ...tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const STATUS_LABEL: Record<string, string> = {
  AWAITING_REVIEW: "Pharmacist checking", AWAITING_PAYMENT: "Waiting for payment", PAID: "Paid, being packed",
  SHIPPED: "On the way", DELIVERED: "Delivered", REJECTED: "Prescription not accepted", CANCELLED: "Cancelled",
};
export const STATUS_TONE: Record<string, "info" | "warn" | "good" | "bad" | "neutral" | "brand"> = {
  AWAITING_REVIEW: "info", AWAITING_PAYMENT: "warn", PAID: "brand", SHIPPED: "brand", DELIVERED: "good", REJECTED: "bad", CANCELLED: "neutral",
};
