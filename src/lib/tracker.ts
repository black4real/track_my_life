export type EventKind = "purchase" | "service" | "use";

export type ItemEvent = {
  id: string;
  kind: EventKind;
  date?: string;
  amount?: number;
  currency?: string;
  quantity?: number;
  variant?: string;
  note?: string;
  feeling?: "loved" | "okay" | "regret";
  createdAt: string;
};

export type TrackedItem = {
  id: string;
  name: string;
  category?: string;
  note?: string;
  productUrl?: string;
  productPhoto?: string;
  listedPriceOverride?: { amount: number; currency: string };
  currentProduct?: {
    title?: string;
    imageUrl?: string;
    amount?: number;
    currency?: string;
    fetchedAt?: string;
  };
  variants?: ProductVariant[];
  createdAt: string;
  events: ItemEvent[];
};

export type ProductVariant = {
  id: string;
  name: string;
  amount?: number;
  currency?: string;
};

export type BackupFile = {
  format: "kept-backup";
  version: 1;
  exportedAt: string;
  items: TrackedItem[];
};

export const STORAGE_KEY = "kept-tracker-v1";
export const CATEGORIES = ["Clothes", "Accessories", "Tech", "Skincare", "Home", "Vehicle", "Other"];

function isSafeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

export function validItems(value: unknown): value is TrackedItem[] {
  if (!Array.isArray(value)) return false;
  return value.every((item) =>
    item && typeof item === "object" &&
    typeof item.id === "string" && typeof item.name === "string" &&
    typeof item.createdAt === "string" && Array.isArray(item.events) &&
    (item.productUrl === undefined || (typeof item.productUrl === "string" && item.productUrl.length <= 2048 && isSafeHttpsUrl(item.productUrl))) &&
    (item.productPhoto === undefined || (typeof item.productPhoto === "string" && item.productPhoto.length <= 1_500_000 && /^data:image\/(?:jpeg|webp|png);base64,/i.test(item.productPhoto))) &&
    (item.listedPriceOverride === undefined || (
      item.listedPriceOverride && typeof item.listedPriceOverride === "object" &&
      typeof item.listedPriceOverride.amount === "number" && Number.isFinite(item.listedPriceOverride.amount) && item.listedPriceOverride.amount >= 0 &&
      typeof item.listedPriceOverride.currency === "string" && /^[A-Z]{3}$/.test(item.listedPriceOverride.currency)
    )) &&
    (item.currentProduct === undefined || (
      item.currentProduct && typeof item.currentProduct === "object" &&
      (item.currentProduct.title === undefined || (typeof item.currentProduct.title === "string" && item.currentProduct.title.length <= 240)) &&
      (item.currentProduct.imageUrl === undefined || (typeof item.currentProduct.imageUrl === "string" && item.currentProduct.imageUrl.length <= 2048 && isSafeHttpsUrl(item.currentProduct.imageUrl))) &&
      (item.currentProduct.amount === undefined || (typeof item.currentProduct.amount === "number" && Number.isFinite(item.currentProduct.amount))) &&
      (item.currentProduct.currency === undefined || (typeof item.currentProduct.currency === "string" && /^[A-Z]{3}$/.test(item.currentProduct.currency))) &&
      (item.currentProduct.fetchedAt === undefined || typeof item.currentProduct.fetchedAt === "string")
    )) &&
    (item.variants === undefined || (Array.isArray(item.variants) && item.variants.every((variant: unknown) => {
      if (!variant || typeof variant !== "object") return false;
      const candidate = variant as Record<string, unknown>;
      return typeof candidate.id === "string" && typeof candidate.name === "string" && candidate.name.length <= 120 &&
        (candidate.amount === undefined || (typeof candidate.amount === "number" && Number.isFinite(candidate.amount))) &&
        (candidate.currency === undefined || (typeof candidate.currency === "string" && /^[A-Z]{3}$/.test(candidate.currency)));
    }))) &&
    item.events.every((event: unknown) => {
      if (!event || typeof event !== "object") return false;
      const candidate = event as Record<string, unknown>;
      return typeof candidate.id === "string" &&
        ["purchase", "service", "use"].includes(String(candidate.kind)) &&
        typeof candidate.createdAt === "string" &&
        (candidate.date === undefined || typeof candidate.date === "string") &&
        (candidate.amount === undefined || (typeof candidate.amount === "number" && Number.isFinite(candidate.amount))) &&
        (candidate.quantity === undefined || (Number.isInteger(candidate.quantity) && Number(candidate.quantity) > 0 && Number(candidate.quantity) <= 10000)) &&
        (candidate.variant === undefined || (typeof candidate.variant === "string" && candidate.variant.length <= 120)) &&
        (candidate.currency === undefined || (typeof candidate.currency === "string" && /^[A-Z]{3}$/.test(candidate.currency)));
    }),
  );
}

export function sortedEvents(item: TrackedItem) {
  return [...item.events].sort((a, b) => {
    const aDate = a.date || a.createdAt.slice(0, 10);
    const bDate = b.date || b.createdAt.slice(0, 10);
    return bDate.localeCompare(aDate);
  });
}

export function purchases(item: TrackedItem) {
  return item.events.filter((event) => event.kind === "purchase");
}

export function ageLabel(date?: string) {
  if (!date) return "Date not added";
  const start = new Date(`${date}T12:00:00`);
  if (Number.isNaN(start.getTime()) || start.getTime() > Date.now()) return "Date not added";
  const months = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.4375));
  if (months < 1) return "Less than a month";
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  if (years && remainder) return `${years}y ${remainder}m`;
  if (years) return `${years} ${years === 1 ? "year" : "years"}`;
  return `${months} ${months === 1 ? "month" : "months"}`;
}

export function formatDate(date?: string) {
  if (!date) return "Date not added";
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? "Date not added" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

export function formatMoney(amount?: number, currency = "INR") {
  if (amount === undefined || !Number.isFinite(amount)) return undefined;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function lastOfKind(item: TrackedItem, kind: EventKind) {
  return sortedEvents(item).find((event) => event.kind === kind);
}

export function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
