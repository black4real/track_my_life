export type EventKind = "purchase" | "service" | "use" | "opened" | "finished";

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
  attributes?: Record<string, string>;
  createdAt: string;
};

export type ConsumableTracking = {
  /** Day tracking began. Purchases after this day contribute to stock calculations. */
  trackingStartedAt: string;
  /** Unopened containers already on hand when tracking began. */
  unopenedAtStart: number;
  /** ID of the opened event for the currently open container, if any. */
  currentOpenEventId?: string;
};

export type TrackedItem = {
  id: string;
  name: string;
  category?: string;
  itemType?: string;
  brand?: string;
  relatedGroup?: string;
  specifications?: Record<string, string>;
  note?: string;
  productUrl?: string;
  storeName?: string;
  productPhoto?: string;
  productPhotoPath?: string;
  listedPriceOverride?: { amount: number; currency: string };
  currentProduct?: {
    title?: string;
    imageUrl?: string;
    amount?: number;
    currency?: string;
    fetchedAt?: string;
    priceFetchedAt?: string;
    source?: "flipkart-api" | "product-page";
    productId?: string;
    variant?: string;
    mrp?: number;
    availability?: string;
  };
  priceHistory?: ProductPriceObservation[];
  variants?: ProductVariant[];
  archivedAt?: string;
  consumable?: ConsumableTracking;
  createdAt: string;
  events: ItemEvent[];
};

export function fallbackItemImage(item: Pick<TrackedItem, "name" | "category" | "itemType">) {
  const details = `${item.name} ${item.category ?? ""} ${item.itemType ?? ""}`.toLowerCase();
  if (item.category?.toLowerCase().includes("groom") || /hair\s*cut|haircut|barber|grooming/.test(details)) return "/images/grooming-mark.svg";
  return undefined;
}

export type ProductPriceObservation = {
  id: string;
  amount: number;
  currency: string;
  observedAt: string;
  source?: "flipkart-api" | "product-page" | "manual";
  variant?: string;
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
  routine?: RoutineData;
};

export type RoutineSlot = "morning" | "night";
export type RoutineProduct = {
  id: string;
  name: string;
  brand?: string;
  linkedItemId?: string;
  photo?: string;
  photoPath?: string;
};
export type RoutinePhase = {
  id: string;
  stepId: string;
  productId: string;
  slot: RoutineSlot;
  position: number;
  startDate?: string;
  endDate?: string;
  targetDuration?: number;
  targetUnit?: "weeks" | "months";
  createdAt: string;
};
export type RoutineConcern = {
  id: string;
  name: string;
  notes?: string;
  status: "current" | "resolved";
  createdAt: string;
  resolvedAt?: string;
};
export type RoutineData = { products: RoutineProduct[]; phases: RoutinePhase[]; concerns: RoutineConcern[] };

export const ROUTINE_STORAGE_KEY = "kept-routine-v1";
export const EMPTY_ROUTINE_DATA: RoutineData = { products: [], phases: [], concerns: [] };

export function validRoutineData(value: unknown): value is RoutineData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Partial<RoutineData>;
  const productsValid = Array.isArray(data.products) && data.products.every((product) => {
    if (!product || typeof product !== "object") return false;
    return typeof product.id === "string" && typeof product.name === "string" && product.name.length > 0 && product.name.length <= 160 &&
      (product.brand === undefined || (typeof product.brand === "string" && product.brand.length <= 100)) &&
      (product.linkedItemId === undefined || typeof product.linkedItemId === "string") &&
      (product.photo === undefined || (typeof product.photo === "string" && product.photo.length <= 1_500_000 && (/^data:image\/(?:jpeg|webp|png);base64,/i.test(product.photo) || /^https:\/\//i.test(product.photo)))) &&
      (product.photoPath === undefined || (typeof product.photoPath === "string" && product.photoPath.length <= 500 && !product.photoPath.startsWith("/") && !product.photoPath.includes("..")));
  });
  const phasesValid = Array.isArray(data.phases) && data.phases.every((phase) => {
    if (!phase || typeof phase !== "object") return false;
    return typeof phase.id === "string" && typeof phase.stepId === "string" && typeof phase.productId === "string" && ["morning", "night"].includes(phase.slot) && Number.isInteger(phase.position) && phase.position >= 0 &&
      (phase.startDate === undefined || typeof phase.startDate === "string") && (phase.endDate === undefined || typeof phase.endDate === "string") &&
      (phase.targetDuration === undefined || (Number.isInteger(phase.targetDuration) && phase.targetDuration >= 1 && phase.targetDuration <= 1200)) &&
      (phase.targetUnit === undefined || ["weeks", "months"].includes(phase.targetUnit)) && typeof phase.createdAt === "string";
  });
  const concernsValid = Array.isArray(data.concerns) && data.concerns.every((concern) => {
    if (!concern || typeof concern !== "object") return false;
    return typeof concern.id === "string" && typeof concern.name === "string" && concern.name.length > 0 && concern.name.length <= 160 &&
      (concern.notes === undefined || (typeof concern.notes === "string" && concern.notes.length <= 2000)) && ["current", "resolved"].includes(concern.status) && typeof concern.createdAt === "string" &&
      (concern.resolvedAt === undefined || typeof concern.resolvedAt === "string");
  });
  return productsValid && phasesValid && concernsValid;
}

export const STORAGE_KEY = "kept-tracker-v1";
export const CATEGORIES = ["Clothes", "Accessories", "Tech", "Grooming", "Fitness", "Health & supplements", "Skincare", "Home", "Vehicle", "Other"];

export type DetailField = { key: string; label: string; placeholder: string };

export const ITEM_TYPES: Record<string, string[]> = {
  Clothes: ["Hoodie", "Sweatshirt", "T-shirt", "Shirt", "Jeans", "Trousers", "Bottom wear", "Shorts", "Jacket"],
  Accessories: ["Running shoes", "Hiking shoes", "Training shoes", "Watch", "Glasses", "Sunglasses", "Perfume"],
  Tech: ["Phone", "Laptop", "Earphones", "IEMs", "Charger"],
  Grooming: ["Haircut", "Shampoo", "Hair styling"],
  Fitness: ["Protein powder", "Training gear"],
  "Health & supplements": ["Vitamin D3", "Magnesium", "Protein powder", "Supplement", "Powder"],
  Skincare: ["Cream", "Gel", "Lotion", "Serum", "Sunscreen", "Cleanser"],
};

export function categoryForItemType(itemType?: string): string | undefined {
  const normalized = itemType?.trim().toLocaleLowerCase();
  if (!normalized) return undefined;
  for (const [category, types] of Object.entries(ITEM_TYPES)) {
    if (types.some((type) => type.toLocaleLowerCase() === normalized)) return category;
  }
  if (/hair\s*cut|haircut|barber/.test(normalized)) return "Grooming";
  if (/bike\s*(service|maintenance)|vehicle\s*service/.test(normalized)) return "Vehicle";
  if (/service|maintenance|repair/.test(normalized)) return "Other";
  return undefined;
}

export function isServiceType(itemType?: string): boolean {
  return /hair\s*cut|haircut|barber|\bservice\b|\bmaintenance\b|\brepair\b/.test((itemType ?? "").toLocaleLowerCase());
}

export function isConsumableType(category?: string, itemType?: string): boolean {
  const text = `${category ?? ""} ${itemType ?? ""}`.toLocaleLowerCase();
  return /skin|supplement|vitamin|protein|powder|sunscreen|cleanser|shampoo|conditioner|serum|moisturi[sz]er|cream|gel|lotion|soap|toothpaste|deodorant|perfume|fragrance/.test(text);
}

export function detailFields(category?: string, itemType?: string): { item: DetailField[]; purchase: DetailField[] } {
  const type = (itemType ?? "").toLowerCase();
  const clothes = category === "Clothes" || /hoodie|sweatshirt|t-shirt|shirt|jeans|trouser|bottom wear|shorts|jacket|apparel/.test(type);
  const shoes = /shoe|sneaker|boot|footwear/.test(type);
  const watch = /watch/.test(type);
  const perfume = /perfume|fragrance|cologne/.test(type);
  const consumable = ["Skincare", "Health & supplements"].includes(category ?? "") || /cream|gel|lotion|serum|sunscreen|cleanser|vitamin|supplement|protein powder/.test(type);
  if (shoes) return { item: [{ key: "material", label: "Material", placeholder: "Optional" }], purchase: [{ key: "size", label: "Size", placeholder: "e.g. 8, 42" }, { key: "color", label: "Color", placeholder: "e.g. black" }] };
  if (clothes) return { item: [{ key: "fit", label: "Fit", placeholder: "e.g. loose fit" }, { key: "season", label: "Season", placeholder: "Choose one or more" }, { key: "material", label: "Material", placeholder: "Optional" }], purchase: [{ key: "size", label: "Size", placeholder: "e.g. XL or 32/34" }, { key: "color", label: "Color", placeholder: "e.g. charcoal" }] };
  if (watch) return { item: [{ key: "movement", label: "Movement", placeholder: "Automatic, quartz…" }, { key: "dial_color", label: "Dial color", placeholder: "Optional" }, { key: "band_color", label: "Band color", placeholder: "Optional" }], purchase: [] };
  if (perfume) return { item: [{ key: "concentration", label: "Concentration", placeholder: "EDP, EDT…" }, { key: "volume", label: "Volume", placeholder: "e.g. 50" }, { key: "unit", label: "Unit", placeholder: "ml" }], purchase: [] };
  if (consumable) return { item: [{ key: "form", label: "Form", placeholder: "Cream, gel, powder…" }, { key: "amount", label: "Amount", placeholder: "e.g. 100" }, { key: "unit", label: "Unit", placeholder: "g, mg, ml…" }], purchase: [] };
  return { item: [], purchase: [] };
}

function validStringMap(value: unknown) {
  return value === undefined || (!!value && typeof value === "object" && !Array.isArray(value) && Object.entries(value).length <= 30 && Object.entries(value).every(([key, entry]) => key.length <= 60 && typeof entry === "string" && entry.length <= 160));
}

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
    (item.archivedAt === undefined || typeof item.archivedAt === "string") &&
    (item.consumable === undefined || (!!item.consumable && typeof item.consumable === "object" &&
      typeof item.consumable.trackingStartedAt === "string" &&
      Number.isInteger(item.consumable.unopenedAtStart) && item.consumable.unopenedAtStart >= 0 && item.consumable.unopenedAtStart <= 10000 &&
      (item.consumable.currentOpenEventId === undefined || typeof item.consumable.currentOpenEventId === "string"))) &&
    (item.itemType === undefined || (typeof item.itemType === "string" && item.itemType.length <= 100)) &&
    (item.brand === undefined || (typeof item.brand === "string" && item.brand.length <= 100)) &&
    (item.relatedGroup === undefined || (typeof item.relatedGroup === "string" && item.relatedGroup.length <= 100)) &&
    validStringMap(item.specifications) &&
    (item.productUrl === undefined || (typeof item.productUrl === "string" && item.productUrl.length <= 2048 && isSafeHttpsUrl(item.productUrl))) &&
    (item.storeName === undefined || (typeof item.storeName === "string" && item.storeName.length <= 100)) &&
    (item.productPhoto === undefined || (typeof item.productPhoto === "string" && item.productPhoto.length <= 1_500_000 && /^data:image\/(?:jpeg|webp|png);base64,/i.test(item.productPhoto))) &&
    (item.productPhotoPath === undefined || (typeof item.productPhotoPath === "string" && item.productPhotoPath.length <= 500 && !item.productPhotoPath.startsWith("/") && !item.productPhotoPath.includes(".."))) &&
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
      (item.currentProduct.fetchedAt === undefined || typeof item.currentProduct.fetchedAt === "string") &&
      (item.currentProduct.priceFetchedAt === undefined || typeof item.currentProduct.priceFetchedAt === "string") &&
      (item.currentProduct.source === undefined || ["flipkart-api", "product-page"].includes(item.currentProduct.source)) &&
      (item.currentProduct.productId === undefined || (typeof item.currentProduct.productId === "string" && item.currentProduct.productId.length <= 120)) &&
      (item.currentProduct.variant === undefined || (typeof item.currentProduct.variant === "string" && item.currentProduct.variant.length <= 240)) &&
      (item.currentProduct.mrp === undefined || (typeof item.currentProduct.mrp === "number" && Number.isFinite(item.currentProduct.mrp) && item.currentProduct.mrp >= 0)) &&
      (item.currentProduct.availability === undefined || (typeof item.currentProduct.availability === "string" && item.currentProduct.availability.length <= 64))
    )) &&
    (item.priceHistory === undefined || (Array.isArray(item.priceHistory) && item.priceHistory.length <= 5000 && item.priceHistory.every((entry: unknown) => {
      if (!entry || typeof entry !== "object") return false;
      const candidate = entry as Record<string, unknown>;
      return typeof candidate.id === "string" && typeof candidate.amount === "number" && Number.isFinite(candidate.amount) && candidate.amount >= 0 &&
        typeof candidate.currency === "string" && /^[A-Z]{3}$/.test(candidate.currency) && typeof candidate.observedAt === "string" &&
        (candidate.source === undefined || ["flipkart-api", "product-page", "manual"].includes(String(candidate.source))) &&
        (candidate.variant === undefined || (typeof candidate.variant === "string" && candidate.variant.length <= 240));
    }))) &&
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
        ["purchase", "service", "use", "opened", "finished"].includes(String(candidate.kind)) &&
        typeof candidate.createdAt === "string" &&
        (candidate.date === undefined || typeof candidate.date === "string") &&
        (candidate.amount === undefined || (typeof candidate.amount === "number" && Number.isFinite(candidate.amount))) &&
        (candidate.quantity === undefined || (Number.isInteger(candidate.quantity) && Number(candidate.quantity) > 0 && Number(candidate.quantity) <= 10000)) &&
        (candidate.variant === undefined || (typeof candidate.variant === "string" && candidate.variant.length <= 120)) &&
        validStringMap(candidate.attributes) &&
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
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
