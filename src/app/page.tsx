"use client";

/* Product photos come from the linked shop and intentionally bypass Next image optimization. */
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ageLabel, BackupFile, CATEGORIES, detailFields, EventKind, formatDate, formatMoney, ITEM_TYPES,
  lastOfKind, makeId, ProductVariant, purchases, sortedEvents, STORAGE_KEY, TrackedItem, validItems,
} from "@/lib/tracker";
import { AuthPanel } from "@/app/auth-panel";
import { CalendarView } from "@/app/calendar-view";
import { detectRetailer, RETAILERS } from "@/lib/retailers";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { importTrackerItems, loadTrackerItems, makeCloudCompatibleItems, syncTrackerItems } from "@/lib/supabase/tracker";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AUD", "CAD", "SGD"];
const THEME_STORAGE_KEY = "kept-theme-v1";
const PROFILE_MASCOTS = ["sprout", "moth", "cat", "moon", "finch", "pebble"] as const;
type ProfileMascot = typeof PROFILE_MASCOTS[number];
type AddProductPreview = { title?: string; imageUrl?: string; amount?: number; currency?: string; fetchedAt?: string; storeName?: string };

function validMascot(value: unknown): value is ProfileMascot {
  return typeof value === "string" && PROFILE_MASCOTS.includes(value as ProfileMascot);
}

function Icon({ name, size = 18 }: { name: "plus" | "search" | "download" | "upload" | "close" | "arrow" | "trash" | "spark" | "refresh" | "moon" | "sun"; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<typeof name, React.ReactNode> = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4 4" /></>,
    download: <><path d="M12 3v12m-4-4 4 4 4-4" /><path d="M5 17v3h14v-3" /></>,
    upload: <><path d="M12 16V4m-4 4 4-4 4 4" /><path d="M5 16v4h14v-4" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    trash: <><path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3" /></>,
    spark: <><path d="m12 3 1.6 6.4L20 11l-6.4 1.6L12 19l-1.6-6.4L4 11l6.4-1.6L12 3Z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></>,
    moon: <><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.6 8.6 0 1 0 20.5 14.2Z" /><path d="M16 3v3m-1.5-1.5h3" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function labelForKind(kind: EventKind) {
  return kind === "purchase" ? "Bought" : kind === "service" ? "Serviced" : "Use note";
}

function attributeLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAgeFromEvent(item: TrackedItem) {
  const dates = purchases(item).map((event) => event.date).filter((date): date is string => Boolean(date)).sort();
  return ageLabel(dates[0]);
}

export default function Home() {
  const [items, setItems] = useState<TrackedItem[]>([]);
  const supabaseConfigured = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [ready, setReady] = useState(!supabaseConfigured);
  const [cloudReady, setCloudReady] = useState(false);
  const [migrationItems, setMigrationItems] = useState<TrackedItem[] | null>(null);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All things");
  const [view, setView] = useState<"library" | "calendar">("library");
  const [modal, setModal] = useState<"item" | "event" | "variant" | null>(null);
  const [formError, setFormError] = useState("");
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [eventKind, setEventKind] = useState<EventKind>("purchase");
  const [eventCustomFields, setEventCustomFields] = useState<Array<{ id: string; label: string; value: string }>>([]);
  const [notice, setNotice] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [addName, setAddName] = useState("");
  const [addCategory, setAddCategory] = useState("");
  const [addItemType, setAddItemType] = useState("");
  const [addSpecifications, setAddSpecifications] = useState<Record<string, string>>({});
  const [addCustomFields, setAddCustomFields] = useState<Array<{ id: string; label: string; value: string }>>([]);
  const [addPurchaseAttributes, setAddPurchaseAttributes] = useState<Record<string, string>>({});
  const [addNameTouched, setAddNameTouched] = useState(false);
  const [addProductUrl, setAddProductUrl] = useState("");
  const [addStoreName, setAddStoreName] = useState("");
  const [addStoreEdited, setAddStoreEdited] = useState(false);
  const [addPreview, setAddPreview] = useState<AddProductPreview | null>(null);
  const [addPreviewStatus, setAddPreviewStatus] = useState<"idle" | "loading" | "error">("idle");
  const [addImageUrl, setAddImageUrl] = useState("");
  const [addListedPrice, setAddListedPrice] = useState("");
  const [addListedCurrency, setAddListedCurrency] = useState("INR");
  const [addPriceEdited, setAddPriceEdited] = useState(false);
  const [productFetch, setProductFetch] = useState<{ itemId: string; status: "loading" | "error"; message?: string } | null>(null);
  const [productRefreshToken, setProductRefreshToken] = useState(0);
  const [editingProductLinkId, setEditingProductLinkId] = useState<string | null>(null);
  const [editingListedPriceId, setEditingListedPriceId] = useState<string | null>(null);
  const [listedPriceError, setListedPriceError] = useState("");
  const [productLinkError, setProductLinkError] = useState("");
  const [photoDraftFile, setPhotoDraftFile] = useState<File | null>(null);
  const [photoDraftUrl, setPhotoDraftUrl] = useState("");
  const [photoDraftItemId, setPhotoDraftItemId] = useState<string | null>(null);
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoOffsetX, setPhotoOffsetX] = useState(0);
  const [photoOffsetY, setPhotoOffsetY] = useState(0);
  const nameInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const productPhotoInput = useRef<HTMLInputElement>(null);
  const lastSyncedItems = useRef<TrackedItem[]>([]);
  const syncQueue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (supabaseConfigured) {
      const supabase = createClient();
      let active = true;
      let loadedUserId: string | null = null;
      const loadUser = async (nextUser: User | null) => {
        if (!active) return;
        const userId = nextUser?.id ?? null;
        setUser(nextUser);
        setAuthReady(true);
        if (!userId) {
          loadedUserId = null;
          setItems([]);
          setCloudReady(false);
          setReady(true);
          return;
        }
        if (loadedUserId === userId) return;
        loadedUserId = userId;
        setCloudReady(false); setReady(false);
        try {
          const cloudItems = await loadTrackerItems(supabase, userId);
          if (!active) return;
          lastSyncedItems.current = cloudItems;
          setItems(cloudItems);
          setCloudReady(true);
          const decisionKey = `kept-import-asked-${userId}`;
          const saved = localStorage.getItem(STORAGE_KEY);
          const localItems: unknown = saved ? JSON.parse(saved) : [];
          if (!localStorage.getItem(decisionKey) && validItems(localItems) && localItems.length) setMigrationItems(localItems);
          setReady(true);
        } catch (error) {
          if (active) { setNotice(error instanceof Error ? error.message : "Could not load your saved records."); setReady(true); }
        }
      };
      supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => loadUser(data.user));
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
        queueMicrotask(() => loadUser(session?.user ?? null));
      });
      return () => { active = false; subscription.unsubscribe(); };
    }
    const timeout = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (validItems(parsed)) setItems(parsed);
        }
      } catch {
        setNotice("Your saved record could not be read. You can restore a backup to continue.");
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [supabaseConfigured]);

  useEffect(() => {
    let savedTheme: string | null = null;
    try { savedTheme = localStorage.getItem(THEME_STORAGE_KEY); } catch { /* The app still follows the system appearance. */ }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const initialTheme = savedTheme === "dark" || savedTheme === "light" ? savedTheme : media.matches ? "dark" : "light";
    const applyTheme = (nextTheme: "light" | "dark") => {
      document.documentElement.dataset.theme = nextTheme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", nextTheme === "dark" ? "#101713" : "#f4f5ef");
      setTheme(nextTheme);
    };
    queueMicrotask(() => applyTheme(initialTheme));
    const followSystem = (event: MediaQueryListEvent) => {
      try {
        const preference = localStorage.getItem(THEME_STORAGE_KEY);
        if (preference === "dark" || preference === "light") return;
      } catch { /* Fall back to following the system preference. */ }
      applyTheme(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", followSystem);
    return () => media.removeEventListener("change", followSystem);
  }, []);

  const savedMascot: unknown = user?.user_metadata?.kept_mascot;
  const profileMascot: ProfileMascot = validMascot(savedMascot) ? savedMascot : "sprout";

  useEffect(() => {
    if (!ready) return;
    if (!supabaseConfigured) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      return;
    }
    if (!user || !cloudReady) return;
    if (JSON.stringify(lastSyncedItems.current) === JSON.stringify(items)) return;
    const previous = lastSyncedItems.current;
    const next = items;
    lastSyncedItems.current = next;
    const supabase = createClient();
    syncQueue.current = syncQueue.current.then(async () => {
      const photoPaths = await syncTrackerItems(supabase, user.id, previous, next);
      lastSyncedItems.current = next.map((item) => photoPaths.has(item.id) ? { ...item, productPhotoPath: photoPaths.get(item.id) } : item);
      setItems((current) => current.map((item) => photoPaths.has(item.id) ? { ...item, productPhotoPath: photoPaths.get(item.id) } : item));
    }).catch((error: unknown) => {
      lastSyncedItems.current = previous;
      setNotice(error instanceof Error ? `Could not save to your account: ${error.message}` : "Could not save to your account. Try again.");
    });
  }, [items, ready, user, cloudReady, supabaseConfigured]);

  const categories = useMemo(() => [...new Set(items.map((item) => item.category).filter((value): value is string => Boolean(value)))], [items]);
  const visibleItems = useMemo(() => items
    .filter((item) => category === "All things" || item.category === category)
    .filter((item) => `${item.name} ${item.category ?? ""} ${item.itemType ?? ""} ${item.note ?? ""}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [items, category, search]);
  const selectedItem = visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;
  const addAttributeFields = detailFields(addCategory, addItemType);
  const selectedPurchaseFields = selectedItem ? detailFields(selectedItem.category, selectedItem.itemType).purchase : [];

  useEffect(() => {
    if (!ready || !selectedItem?.productUrl) return;
    const itemId = selectedItem.id;
    const productUrl = selectedItem.productUrl;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setProductFetch({ itemId, status: "loading" });
    });
    fetch("/api/product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: productUrl }),
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const result = await response.json() as { title?: string; imageUrl?: string; amount?: number; currency?: string; fetchedAt?: string; storeName?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not read that product page.");
      setItems((current) => current.map((item) => item.id === itemId && item.productUrl === productUrl
        ? { ...item, storeName: item.storeName || result.storeName, currentProduct: { title: result.title, imageUrl: result.imageUrl, amount: result.amount, currency: result.currency, fetchedAt: result.fetchedAt } }
        : item));
      setProductFetch(null);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setProductFetch({ itemId, status: "error", message: error instanceof Error ? error.message : "Could not read that product page." });
    });
    return () => controller.abort();
  }, [ready, selectedItem?.id, selectedItem?.productUrl, productRefreshToken]);

  useEffect(() => {
    if (!photoDraftUrl) return;
    return () => URL.revokeObjectURL(photoDraftUrl);
  }, [photoDraftUrl]);

  const stats = useMemo(() => {
    const buyEvents = items.flatMap((item) => purchases(item));
    const totals = new Map<string, number>();
    items.flatMap((item) => item.events).forEach((event) => {
      if (event.amount !== undefined) {
        const currency = event.currency || "INR";
        totals.set(currency, (totals.get(currency) ?? 0) + event.amount);
      }
    });
    return { repeated: Math.max(0, buyEvents.length - items.filter((item) => purchases(item).length > 0).length), totals: [...totals.entries()] };
  }, [items]);

  function announce(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4500);
  }

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", nextTheme === "dark" ? "#101713" : "#f4f5ef");
    setTheme(nextTheme);
    try { localStorage.setItem(THEME_STORAGE_KEY, nextTheme); } catch { announce("This browser could not save your theme choice."); }
  }

  function openAddItem() {
    setAddCategory(""); setAddItemType(""); setAddSpecifications({}); setAddCustomFields([]); setAddPurchaseAttributes({});
    setAddName(""); setAddNameTouched(false); setAddProductUrl(""); setAddStoreName(""); setAddStoreEdited(false);
    setAddPreview(null); setAddPreviewStatus("idle"); setAddImageUrl(""); setAddListedPrice(""); setAddListedCurrency("INR"); setAddPriceEdited(false);
    setFormError(""); setModal("item");
  }

  function changeAddProductUrl(value: string) {
    setAddProductUrl(value);
    setAddPreview(null); setAddPreviewStatus("idle"); setAddImageUrl(""); setAddListedPrice(""); setAddPriceEdited(false);
    setAddStoreEdited(false);
    const retailer = detectRetailer(value);
    if (retailer) setAddStoreName(retailer.name);
    else {
      try { setAddStoreName(new URL(value).hostname.replace(/^www\./i, "")); }
      catch { setAddStoreName(""); }
    }
  }

  async function previewAddProduct() {
    let url: URL;
    try {
      url = new URL(addProductUrl);
      if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) throw new Error("invalid URL");
    } catch {
      setFormError("Add a full product link starting with https:// before previewing it.");
      return;
    }
    setFormError(""); setAddPreviewStatus("loading"); setAddPreview(null);
    try {
      const response = await fetch("/api/product", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.toString() }), cache: "no-store" });
      const result = await response.json() as AddProductPreview & { error?: string };
      if (!response.ok) throw new Error(result.error || "This store could not be read right now.");
      setAddPreview(result);
      setAddImageUrl(result.imageUrl ?? "");
      if (!addPriceEdited) {
        setAddListedPrice(result.amount === undefined ? "" : String(result.amount));
        setAddListedCurrency(result.currency || "INR");
      }
      if (!addNameTouched && result.title) setAddName(result.title.slice(0, 80));
      if (!addStoreEdited && result.storeName) setAddStoreName(result.storeName);
      setAddPreviewStatus("idle");
    } catch {
      setAddPreviewStatus("error");
    }
  }

  function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = addName.trim() || String(data.get("name") ?? "").trim();
    if (!name) {
      setFormError("Please add a name before saving.");
      nameInput.current?.focus();
      return;
    }
    const categoryValue = String(data.get("category") ?? "").trim();
    const itemTypeValue = addItemType.trim();
    const note = String(data.get("note") ?? "").trim();
    const productUrl = String(data.get("productUrl") ?? "").trim();
    if (productUrl) {
      try {
        const url = new URL(productUrl);
        if (url.protocol !== "https:" || url.username || url.password) throw new Error("invalid URL");
      } catch {
        setFormError("Add a full product link starting with https://.");
        return;
      }
    }
    const date = String(data.get("date") ?? "");
    const amountString = String(data.get("amount") ?? "").trim();
    const amount = amountString ? Number(amountString) : undefined;
    const currency = String(data.get("currency") || "INR");
    const listedValue = addListedPrice.trim();
    const listedAmount = listedValue ? Number(listedValue) : undefined;
    if (listedValue && (!Number.isFinite(listedAmount) || (listedAmount ?? -1) < 0)) {
      setFormError("Enter a valid listed price, or leave it blank.");
      return;
    }
    if (addImageUrl) {
      try { const imageUrl = new URL(addImageUrl); if (imageUrl.protocol !== "https:") throw new Error("invalid image"); }
      catch { setFormError("Use an image link starting with https://."); return; }
    }
    const now = new Date().toISOString();
    const specifications = Object.fromEntries([
      ...Object.entries(addSpecifications),
      ...addCustomFields.map((field) => [field.label.trim(), field.value.trim()] as const),
    ].filter(([key, value]) => key.trim() && value.trim()));
    const purchaseAttributes = Object.fromEntries([
      ...Object.entries(addPurchaseAttributes),
    ].filter(([key, value]) => key.trim() && value.trim()));
    const item: TrackedItem = {
      id: makeId(), name, category: categoryValue || undefined, itemType: itemTypeValue || undefined,
      specifications: Object.keys(specifications).length ? specifications : undefined,
      note: note || undefined, productUrl: productUrl || undefined,
      storeName: addStoreName.trim() || detectRetailer(productUrl)?.name || undefined,
      currentProduct: addPreview ? { title: addName.trim() || addPreview.title || name, imageUrl: addImageUrl || undefined, amount: addPreview.amount, currency: addPreview.currency, fetchedAt: addPreview.fetchedAt } : (addImageUrl || listedAmount !== undefined ? { title: addName.trim() || name, imageUrl: addImageUrl || undefined } : undefined),
      listedPriceOverride: addPriceEdited && listedAmount !== undefined ? { amount: listedAmount, currency: addListedCurrency } : undefined,
      createdAt: now,
      events: date || amount !== undefined || Object.values(purchaseAttributes).some(Boolean) ? [{ id: makeId(), kind: "purchase", date: date || undefined, amount, currency: amount !== undefined ? currency : undefined, attributes: Object.keys(purchaseAttributes).length ? purchaseAttributes : undefined, createdAt: now }] : [],
    };
    setItems((current) => [...current, item]);
    setSelectedId(item.id);
    setCategory("All things");
    setSearch("");
    setModal(null);
    setFormError("");
    setAddName(""); setAddNameTouched(false); setAddCategory(""); setAddItemType(""); setAddSpecifications({}); setAddCustomFields([]); setAddPurchaseAttributes({}); setAddProductUrl(""); setAddStoreName(""); setAddStoreEdited(false); setAddPreview(null); setAddPreviewStatus("idle"); setAddImageUrl(""); setAddListedPrice(""); setAddPriceEdited(false);
    event.currentTarget.reset();
    announce(`${name} added to your things.`);
  }

  function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItem) return;
    const data = new FormData(event.currentTarget);
    const date = String(data.get("date") ?? "");
    const amountString = String(data.get("amount") ?? "").trim();
    const amount = amountString ? Number(amountString) : undefined;
    const note = String(data.get("note") ?? "").trim();
    const feeling = String(data.get("feeling") ?? "");
    const quantityValue = String(data.get("quantity") ?? "").trim();
    const quantity = eventKind === "purchase" ? selectedItem.category === "Clothes" ? 1 : Math.max(1, Math.floor(Number(quantityValue) || 1)) : undefined;
    const variant = eventKind === "purchase" ? String(data.get("variant") ?? "").trim() : "";
    const attributes = eventKind === "purchase" ? Object.fromEntries([
      ...selectedPurchaseFields.map((field) => [field.key, String(data.get(`purchase-attribute-${field.key}`) ?? "").trim()] as const),
      ...eventCustomFields.map((field) => [field.label.trim(), field.value.trim()] as const),
    ].filter(([key, value]) => key.trim() && value.trim())) : {};
    const now = new Date().toISOString();
    const log = {
      id: makeId(), kind: eventKind, date: date || undefined, amount,
      currency: amount !== undefined ? String(data.get("currency") || "INR") : undefined,
      quantity: quantity !== 1 ? quantity : undefined,
      variant: variant || undefined,
      attributes: Object.keys(attributes).length ? attributes : undefined,
      note: note || undefined,
      feeling: eventKind === "use" && feeling ? feeling as "loved" | "okay" | "regret" : undefined,
      createdAt: now,
    } as const;
    setItems((current) => current.map((item) => item.id === selectedItem.id ? { ...item, events: [...item.events, log] } : item));
    setModal(null);
    event.currentTarget.reset();
    announce(`${labelForKind(eventKind)} update added.`);
  }

  function openVariant(variantId?: string) {
    setFormError("");
    setEditingVariantId(variantId ?? null);
    setModal("variant");
  }

  function saveVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItem) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (!name) {
      setFormError("Please add a name for this variant.");
      nameInput.current?.focus();
      return;
    }
    const amountValue = String(data.get("amount") ?? "").trim();
    const amount = amountValue ? Number(amountValue) : undefined;
    const currency = amount !== undefined ? String(data.get("currency") || "INR") : undefined;
    const variant: ProductVariant = { id: editingVariantId ?? makeId(), name, amount, currency };
    setItems((current) => current.map((item) => item.id !== selectedItem.id ? item : {
      ...item,
      variants: editingVariantId
        ? (item.variants ?? []).map((entry) => entry.id === editingVariantId ? variant : entry)
        : [...(item.variants ?? []), variant],
    }));
    setModal(null);
    setFormError("");
    setEditingVariantId(null);
    event.currentTarget.reset();
    announce(`${name} variant saved.`);
  }

  function removeVariant(variant: ProductVariant) {
    if (!selectedItem || !window.confirm(`Remove the ${variant.name} variant?`)) return;
    setItems((current) => current.map((item) => item.id === selectedItem.id
      ? { ...item, variants: (item.variants ?? []).filter((entry) => entry.id !== variant.id) }
      : item));
    announce(`${variant.name} variant removed.`);
  }

  function openEvent(kind: EventKind) {
    setFormError("");
    setEventKind(kind);
    setEventCustomFields([]);
    setModal("event");
  }

  function saveProductLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItem) return;
    const form = new FormData(event.currentTarget);
    const value = String(form.get("productUrl") ?? "").trim();
    if (value) {
      try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) throw new Error("invalid URL");
      } catch {
        setProductLinkError("Use a full product link starting with https://.");
        return;
      }
    }
    setItems((current) => current.map((item) => item.id === selectedItem.id
      ? { ...item, productUrl: value || undefined, storeName: value ? detectRetailer(value)?.name || (() => { try { return new URL(value).hostname.replace(/^www\./i, ""); } catch { return undefined; } })() : undefined, currentProduct: value === item.productUrl ? item.currentProduct : undefined }
      : item));
    setProductLinkError("");
    setEditingProductLinkId(null);
    announce(value ? "Product link updated." : "Product link removed.");
  }

  function saveListedPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItem) return;
    const form = new FormData(event.currentTarget);
    const value = String(form.get("listedAmount") ?? "").trim();
    const amount = value ? Number(value) : undefined;
    if (value && (!Number.isFinite(amount) || (amount ?? -1) < 0)) {
      setListedPriceError("Enter a valid price, or leave it blank to use the shop price.");
      return;
    }
    const currency = String(form.get("listedCurrency") || "INR");
    setItems((current) => current.map((item) => item.id === selectedItem.id
      ? { ...item, listedPriceOverride: amount === undefined ? undefined : { amount, currency } }
      : item));
    setListedPriceError("");
    setEditingListedPriceId(null);
    announce(amount === undefined ? "Using the shop price again." : "Listed price saved.");
  }

  function chooseProductPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedItem) return;
    if (!file.type.startsWith("image/")) { announce("Choose an image file."); return; }
    if (file.size > 15 * 1024 * 1024) { announce("Choose an image under 15 MB."); return; }
    setPhotoDraftUrl(URL.createObjectURL(file));
    setPhotoDraftFile(file);
    setPhotoDraftItemId(selectedItem.id);
    setPhotoZoom(1);
    setPhotoOffsetX(0);
    setPhotoOffsetY(0);
  }

  async function saveProductPhoto() {
    if (!selectedItem || !photoDraftFile || photoDraftItemId !== selectedItem.id) return;
    try {
      const image = await createImageBitmap(photoDraftFile);
      const targetWidth = 640;
      const targetHeight = 800;
      const targetRatio = targetWidth / targetHeight;
      let cropWidth = image.width;
      let cropHeight = image.height;
      if (cropWidth / cropHeight > targetRatio) cropWidth = cropHeight * targetRatio;
      else cropHeight = cropWidth / targetRatio;
      cropWidth /= photoZoom;
      cropHeight /= photoZoom;
      const availableX = image.width - cropWidth;
      const availableY = image.height - cropHeight;
      const sourceX = Math.min(availableX, Math.max(0, availableX / 2 + (photoOffsetX / 100) * availableX / 2));
      const sourceY = Math.min(availableY, Math.max(0, availableY / 2 + (photoOffsetY / 100) * availableY / 2));
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image editor unavailable");
      context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight);
      image.close();
      const productPhoto = canvas.toDataURL("image/jpeg", 0.78);
      setItems((current) => current.map((item) => item.id === selectedItem.id ? { ...item, productPhoto, productPhotoPath: undefined } : item));
      setPhotoDraftFile(null);
      setPhotoDraftUrl("");
      setPhotoDraftItemId(null);
      announce("Product photo saved.");
    } catch {
      announce("That photo could not be prepared. Try another image.");
    }
  }

  function removeProductPhoto() {
    if (!selectedItem) return;
    setItems((current) => current.map((item) => item.id === selectedItem.id ? { ...item, productPhoto: undefined, productPhotoPath: undefined } : item));
    setPhotoDraftFile(null);
    setPhotoDraftUrl("");
    setPhotoDraftItemId(null);
    announce("Custom photo removed.");
  }

  function removeItem(item: TrackedItem) {
    if (!window.confirm(`Remove “${item.name}” and its history? This cannot be undone.`)) return;
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    if (selectedId === item.id) setSelectedId(null);
    announce(`${item.name} removed.`);
  }

  function removeEvent(id: string) {
    if (!selectedItem || !window.confirm("Remove this timeline entry?")) return;
    setItems((current) => current.map((item) => item.id === selectedItem.id ? { ...item, events: item.events.filter((entry) => entry.id !== id) } : item));
    announce("Timeline entry removed.");
  }

  async function exportBackup() {
    const backupItems = await Promise.all(items.map(async (item) => {
      if (!item.productPhoto || item.productPhoto.startsWith("data:image/")) return item;
      try {
        const response = await fetch(item.productPhoto);
        if (!response.ok) return { ...item, productPhoto: undefined };
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
        });
        return { ...item, productPhoto: dataUrl };
      } catch { return { ...item, productPhoto: undefined }; }
    }));
    const backup: BackupFile = { format: "kept-backup", version: 1, exportedAt: new Date().toISOString(), items: backupItems };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `kept-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce("Your backup has been downloaded.");
  }

  async function importLocalRecords() {
    if (!user || !migrationItems || migrationBusy) return;
    setMigrationBusy(true);
    try {
      const existingIds = new Set(items.map((item) => item.id));
      const toImport = makeCloudCompatibleItems(migrationItems.filter((item) => !existingIds.has(item.id)));
      const photoPaths = await importTrackerItems(createClient(), user.id, toImport);
      const merged = [...items, ...toImport.map((item) => ({ ...item, productPhotoPath: photoPaths.get(item.id) }))];
      lastSyncedItems.current = merged;
      setItems(merged);
      localStorage.setItem(`kept-import-asked-${user.id}`, "done");
      setMigrationItems(null);
      setSelectedId(toImport[0]?.id ?? items[0]?.id ?? null);
      announce(toImport.length ? `${toImport.length} local record${toImport.length === 1 ? "" : "s"} added to your account.` : "Those records are already in your account.");
    } catch (error) {
      announce(error instanceof Error ? `Import stopped. Your browser copy is safe. ${error.message}` : "Import stopped. Your browser copy is safe; try again.");
    } finally { setMigrationBusy(false); }
  }

  function deferLocalImport() {
    if (user) localStorage.setItem(`kept-import-asked-${user.id}`, "done");
    setMigrationItems(null);
  }

  async function signOut() {
    const { error } = await createClient().auth.signOut();
    if (error) announce(error.message);
  }

  async function saveProfileMascot(mascot: ProfileMascot) {
    setProfileBusy(true);
    const { data, error } = await createClient().auth.updateUser({ data: { kept_mascot: mascot } });
    if (error) announce(`Could not save your profile picture: ${error.message}`);
    else { if (data.user) setUser(data.user); announce("Profile picture saved."); }
    setProfileBusy(false);
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<BackupFile>;
      if (parsed.format !== "kept-backup" || parsed.version !== 1 || !validItems(parsed.items)) throw new Error("invalid backup");
      if (!window.confirm(`Restore ${parsed.items.length} item${parsed.items.length === 1 ? "" : "s"}? This replaces the records ${user ? "in your account" : "in this browser"}.`)) return;
      const restored = user ? makeCloudCompatibleItems(parsed.items) : parsed.items;
      setItems(restored);
      setSelectedId(restored[0]?.id ?? null);
      setSearch("");
      setCategory("All things");
      announce("Backup restored.");
    } catch {
      announce("That file could not be read as a Kept backup.");
    } finally {
      event.target.value = "";
    }
  }

  const itemForm = modal === "item" ? <section className="inline-form-card" aria-labelledby="add-title">
    <div className="dialog-top"><div><p className="eyebrow">NEW OBJECT RECORD</p><h2 id="add-title">Add a thing<span className="period">.</span></h2></div><button className="icon-button" onClick={() => { setModal(null); setFormError(""); }} aria-label="Close add item form"><Icon name="close" /></button></div>
    <p className="dialog-intro">Only the name is needed. Fill in anything else you remember.</p>
    {formError ? <p className="form-error" id="item-form-error" role="alert">{formError}</p> : null}
    <form onSubmit={saveItem} className="entry-form" noValidate>
      <label className="field"><span>Thing name <b>REQUIRED</b></span><input ref={nameInput} name="name" value={addName} maxLength={80} autoFocus placeholder="e.g. Everyday watch" aria-required="true" aria-invalid={formError === "Please add a name before saving."} aria-describedby={formError === "Please add a name before saving." ? "item-form-error" : undefined} onChange={(event) => { setAddName(event.target.value); setAddNameTouched(true); setFormError(""); }} /></label>
      <div className="field-pair">
        <label className="field"><span>Category <b>OPTIONAL</b></span><select name="category" value={addCategory} onChange={(event) => setAddCategory(event.target.value)}><option value="">Choose if useful</option>{CATEGORIES.map((option) => <option key={option}>{option}</option>)}</select></label>
        <label className="field"><span>Item type <b>OPTIONAL</b></span><input value={addItemType} onChange={(event) => setAddItemType(event.target.value)} list="item-type-options" maxLength={100} placeholder="e.g. hoodie" /><datalist id="item-type-options">{Array.from(new Set(ITEM_TYPES[addCategory] ?? Object.values(ITEM_TYPES).flat())).map((type) => <option key={type} value={type} />)}</datalist></label>
      </div>
      {addAttributeFields.item.length ? <div className="attribute-fields" aria-label="Suggested item details">
        {addAttributeFields.item.map((field) => <label className="field" key={field.key}><span>{field.label} <b>OPTIONAL</b></span><input maxLength={160} value={addSpecifications[field.key] ?? ""} placeholder={field.placeholder} onChange={(event) => setAddSpecifications((current) => ({ ...current, [field.key]: event.target.value }))} /></label>)}
      </div> : null}
      <div className="custom-fields-block">
        {addCustomFields.map((field) => <div className="custom-attribute-row" key={field.id}><label className="field"><span>Detail name</span><input maxLength={60} value={field.label} placeholder="e.g. Fabric" onChange={(event) => setAddCustomFields((current) => current.map((entry) => entry.id === field.id ? { ...entry, label: event.target.value } : entry))} /></label><label className="field"><span>Value</span><input maxLength={160} value={field.value} placeholder="Add a detail" onChange={(event) => setAddCustomFields((current) => current.map((entry) => entry.id === field.id ? { ...entry, value: event.target.value } : entry))} /></label><button className="text-button remove-custom-field" type="button" onClick={() => setAddCustomFields((current) => current.filter((entry) => entry.id !== field.id))} aria-label="Remove custom detail">Remove</button></div>)}
        <button className="text-button add-custom-field" type="button" disabled={addCustomFields.length >= 20} onClick={() => setAddCustomFields((current) => [...current, { id: makeId(), label: "", value: "" }])}>＋ Add custom detail</button>
      </div>
      <div className="shop-link-block">
        <label className="field"><span>Product link <b>OPTIONAL</b></span><input name="productUrl" type="url" value={addProductUrl} maxLength={2048} placeholder="Paste a product page link" aria-invalid={formError.startsWith("Add a full product link")} onChange={(event) => { changeAddProductUrl(event.target.value); setFormError(""); }} /><small className="field-hint">Paste a link from a shop. We’ll try to find its product details.</small></label>
        <label className="field"><span>Shop <b>SEARCH OR TYPE</b></span><input value={addStoreName} onChange={(event) => { setAddStoreName(event.target.value); setAddStoreEdited(true); }} list="retailer-options" placeholder="Choose or type a shop name" /><datalist id="retailer-options">{RETAILERS.map((retailer) => <option key={retailer.name} value={retailer.name}>{retailer.group}</option>)}</datalist></label>
        <button className="button button-outline preview-product-button" type="button" onClick={previewAddProduct} disabled={!addProductUrl || addPreviewStatus === "loading"}><Icon name="refresh" size={15} />{addPreviewStatus === "loading" ? "Checking product…" : "Find product details"}</button>
        {addPreviewStatus === "error" ? <p className="product-status product-error" role="status">Couldn’t read this shop page. You can still add the name, photo link, and price yourself.</p> : null}
        {(addPreview || addImageUrl || addListedPrice || (addProductUrl && addPreviewStatus !== "loading")) ? <section className="add-product-preview" aria-label="Product details preview">
          <div className="add-preview-heading"><span className="eyebrow">PRODUCT PREVIEW</span><span>{addPreview ? "Review and edit before saving" : "Manual details"}</span></div>
          <div className="add-preview-content">{addImageUrl ? <img src={addImageUrl} alt="Product preview" referrerPolicy="no-referrer" /> : <div className="add-preview-placeholder" aria-hidden="true">{addName.trim().charAt(0).toUpperCase() || "＋"}</div>}
            <div className="add-preview-fields">
              <label className="field"><span>Product photo URL</span><input value={addImageUrl} onChange={(event) => setAddImageUrl(event.target.value)} type="url" placeholder="https://…" /></label>
              <label className="field"><span>Current listed price</span><div className="price-input"><input type="number" min="0" step="0.01" inputMode="decimal" value={addListedPrice} placeholder="Not available" onChange={(event) => { setAddListedPrice(event.target.value); setAddPriceEdited(true); }} /><select aria-label="Listed price currency" value={addListedCurrency} onChange={(event) => { setAddListedCurrency(event.target.value); setAddPriceEdited(true); }}>{CURRENCIES.map((value) => <option key={value}>{value}</option>)}</select></div></label>
            </div>
          </div>
          {addPreview?.amount !== undefined ? <small className="field-hint">Listed price found on the shop page. Enter what you actually paid below.</small> : null}
        </section> : null}
      </div>
      <div className="form-subheading"><span>{addCategory === "Clothes" ? "FIRST PIECE" : "FIRST PURCHASE"}</span><span>ALL OPTIONAL</span></div>
      {addAttributeFields.purchase.length ? <div className="attribute-fields purchase-attribute-fields">
        {addAttributeFields.purchase.map((field) => <label className="field" key={field.key}><span>{field.label} <b>OPTIONAL</b></span><input maxLength={120} value={addPurchaseAttributes[field.key] ?? ""} placeholder={field.placeholder} onChange={(event) => setAddPurchaseAttributes((current) => ({ ...current, [field.key]: event.target.value }))} /></label>)}
      </div> : null}
      <div className="field-pair"><label className="field"><span>Date</span><input type="date" name="date" max={new Date().toISOString().slice(0, 10)} /></label><label className="field"><span>{addCategory === "Clothes" ? "Paid for this piece" : "What you paid"}</span><div className="price-input"><input name="amount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="—" /><select name="currency" aria-label="Currency" defaultValue="INR">{CURRENCIES.map((value) => <option key={value}>{value}</option>)}</select></div>{addCategory === "Clothes" ? <small className="field-hint">Each garment gets its own purchase entry.</small> : null}</label></div>
      <label className="field"><span>A note <b>OPTIONAL</b></span><textarea name="note" rows={2} maxLength={240} placeholder="Anything else to remember…" /></label>
      <div className="dialog-footer"><span>{user ? "Saved to your account." : "Saved in this browser."}</span><button className="button button-primary" type="submit">Save this thing <Icon name="arrow" size={16} /></button></div>
    </form>
  </section> : null;

  const eventForm = modal === "event" && selectedItem ? <section className="inline-form-card detail-inline-form" aria-labelledby="event-title">
    <div className="dialog-top"><div><p className="eyebrow">{selectedItem.name} / ADD TO THE STORY</p><h2 id="event-title">{eventKind === "purchase" ? "A purchase" : eventKind === "service" ? "Some upkeep" : "A use note"}<span className="period">.</span></h2></div><button className="icon-button" onClick={() => setModal(null)} aria-label="Close history form"><Icon name="close" /></button></div>
    <p className="dialog-intro">Write down what you remember. You can leave any field blank.</p>
    <form onSubmit={saveEvent} className="entry-form" noValidate>
      <label className="field"><span>Date <b>OPTIONAL</b></span><input type="date" name="date" max={new Date().toISOString().slice(0, 10)} /></label>
      {eventKind !== "use" ? <label className="field"><span>{eventKind === "purchase" ? selectedItem.category === "Clothes" ? "Paid for this piece" : "Total you paid" : "Service cost"} <b>OPTIONAL</b></span><div className="price-input"><input name="amount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="—" /><select name="currency" aria-label="Currency" defaultValue="INR">{CURRENCIES.map((value) => <option key={value}>{value}</option>)}</select></div>{eventKind === "purchase" ? <small className="field-hint">{selectedItem.category === "Clothes" ? "Log one garment per entry, including its own price and size." : "Enter the total for these units after discounts, card offers, or bundles."}</small> : null}</label> : null}
      {eventKind === "purchase" && selectedPurchaseFields.length ? <div className="attribute-fields purchase-attribute-fields">{selectedPurchaseFields.map((field) => <label className="field" key={field.key}><span>{field.label} <b>OPTIONAL</b></span><input name={`purchase-attribute-${field.key}`} maxLength={120} placeholder={field.placeholder} /></label>)}</div> : null}
      {eventKind === "purchase" && selectedItem.category !== "Clothes" ? <div className="field-pair"><label className="field"><span>Quantity</span><input name="quantity" type="number" min="1" max="10000" step="1" inputMode="numeric" defaultValue="1" /></label><label className="field"><span>Variant <b>OPTIONAL</b></span>{selectedItem.variants?.length ? <select name="variant" defaultValue=""><option value="">Choose if useful</option>{selectedItem.variants.map((variant) => <option key={variant.id}>{variant.name}</option>)}</select> : <input name="variant" maxLength={120} placeholder="e.g. 100g, medium, black" />}</label></div> : null}
      {eventKind === "purchase" ? <div className="custom-fields-block">
        {eventCustomFields.map((field) => <div className="custom-attribute-row" key={field.id}><label className="field"><span>Detail name</span><input maxLength={60} value={field.label} placeholder="e.g. Fabric" onChange={(event) => setEventCustomFields((current) => current.map((entry) => entry.id === field.id ? { ...entry, label: event.target.value } : entry))} /></label><label className="field"><span>Value</span><input maxLength={160} value={field.value} placeholder="Add a detail" onChange={(event) => setEventCustomFields((current) => current.map((entry) => entry.id === field.id ? { ...entry, value: event.target.value } : entry))} /></label><button className="text-button remove-custom-field" type="button" onClick={() => setEventCustomFields((current) => current.filter((entry) => entry.id !== field.id))} aria-label="Remove custom purchase detail">Remove</button></div>)}
        <button className="text-button add-custom-field" type="button" disabled={eventCustomFields.length >= 20} onClick={() => setEventCustomFields((current) => [...current, { id: makeId(), label: "", value: "" }])}>＋ Add another detail</button>
      </div> : null}
      {eventKind === "use" ? <label className="field"><span>How did it feel? <b>OPTIONAL</b></span><select name="feeling" defaultValue=""><option value="">Skip for now</option><option value="loved">I really liked it</option><option value="okay">It was okay</option><option value="regret">I didn’t like it much</option></select></label> : null}
      <label className="field"><span>A note <b>OPTIONAL</b></span><textarea name="note" rows={3} maxLength={400} placeholder={eventKind === "service" ? "What was done? Anything to remember for next time…" : eventKind === "use" ? "How often, what worked, what didn’t…" : "Coupon, card offer, bundle, or where you bought it…"} /></label>
      <div className="dialog-footer"><span>You can always add more later.</span><button className="button button-primary" type="submit">Add to timeline <Icon name="arrow" size={16} /></button></div>
    </form>
  </section> : null;

  const variantForm = modal === "variant" && selectedItem ? <section className="inline-form-card detail-inline-form" aria-labelledby="variant-title">
    <div className="dialog-top"><div><p className="eyebrow">{selectedItem.name} / OPTIONS</p><h2 id="variant-title">{editingVariantId ? "Edit a variant" : "Add a variant"}<span className="period">.</span></h2></div><button className="icon-button" onClick={() => { setModal(null); setEditingVariantId(null); }} aria-label="Close variant form"><Icon name="close" /></button></div>
    <p className="dialog-intro">Save a size, color, or other option with its current listed price.</p>
    {formError ? <p className="form-error" id="variant-form-error" role="alert">{formError}</p> : null}
    <form onSubmit={saveVariant} className="entry-form" noValidate>
      <label className="field"><span>Variant name <b>REQUIRED</b></span><input ref={nameInput} name="name" maxLength={120} autoFocus defaultValue={selectedItem.variants?.find((variant) => variant.id === editingVariantId)?.name ?? ""} placeholder="e.g. 100g tube" aria-required="true" aria-invalid={Boolean(formError)} aria-describedby={formError ? "variant-form-error" : undefined} onChange={() => setFormError("")} /></label>
      <label className="field"><span>Current listed price <b>OPTIONAL</b></span><div className="price-input"><input name="amount" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={selectedItem.variants?.find((variant) => variant.id === editingVariantId)?.amount ?? ""} placeholder="—" /><select name="currency" aria-label="Currency" defaultValue={selectedItem.variants?.find((variant) => variant.id === editingVariantId)?.currency ?? "INR"}>{CURRENCIES.map((value) => <option key={value}>{value}</option>)}</select></div></label>
      <div className="dialog-footer"><span>What you paid goes in each purchase entry.</span><button className="button button-primary" type="submit">Save variant <Icon name="arrow" size={16} /></button></div>
    </form>
  </section> : null;

  if (!ready) return <main className="loading-screen" aria-label="Loading your things"><span className="brand-mark">k.</span></main>;
  if (supabaseConfigured && authReady && !user) return <AuthPanel />;

  return (
    <main className="app-shell">
      <a className="skip-link" href="#main-content">Skip to page content</a>
      <header className="topbar">
        <Link className="wordmark" href="/" aria-label="Kept, home"><span className="brand-mark">k.</span><span>kept</span></Link>
        <div className="topbar-note"><span className="status-dot" /> A small record of what stays</div>
        <div className="top-actions">
          <button className="quiet-button theme-button" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={16} /><span>{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
          <button className="quiet-button backup-button" onClick={exportBackup} disabled={!items.length} title={!items.length ? "Add something before exporting a backup" : "Download a backup"}>
            <Icon name="download" size={16} /><span>Back up</span>
          </button>
          <button className="quiet-button restore-button" onClick={() => importInput.current?.click()}><Icon name="upload" size={16} /><span>Restore</span></button>
          {user ? <div className="profile-menu-wrap">
            <button className="profile-trigger" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} aria-haspopup="dialog" aria-label="Open profile settings">
              <span className={`profile-avatar mascot-${profileMascot}`}><MascotMark name={profileMascot} /></span><span className="profile-trigger-label">Profile</span>
            </button>
            {profileOpen ? <section className="profile-popover" role="dialog" aria-label="Profile settings">
              <div className="profile-popover-heading"><div><p className="eyebrow">YOUR ACCOUNT</p><strong>Profile picture</strong></div><button className="icon-button" onClick={() => setProfileOpen(false)} aria-label="Close profile settings"><Icon name="close" size={16} /></button></div>
              <p className="profile-email">{user.email}</p>
              <p className="profile-prompt">Choose a little mascot for your account.</p>
              <div className="mascot-grid" aria-label="Profile picture options">
                {PROFILE_MASCOTS.map((mascot) => <button key={mascot} type="button" className={`mascot-option mascot-${mascot}${profileMascot === mascot ? " selected" : ""}`} onClick={() => saveProfileMascot(mascot)} disabled={profileBusy} aria-pressed={profileMascot === mascot} aria-label={`${mascot} profile picture`} title={mascot}>
                  <MascotMark name={mascot} /><span>{mascot}</span>
                </button>)}
              </div>
              <button className="profile-signout" onClick={signOut}>Sign out</button>
            </section> : null}
          </div> : null}
          <input ref={importInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={importBackup} aria-label="Choose a Kept backup file" />
        </div>
      </header>

      <nav className="view-switch" aria-label="Main views">
        <button type="button" className={view === "library" ? "active" : ""} aria-current={view === "library" ? "page" : undefined} onClick={() => setView("library")}>Library</button>
        <button type="button" className={view === "calendar" ? "active" : ""} aria-current={view === "calendar" ? "page" : undefined} onClick={() => setView("calendar")}>Calendar</button>
      </nav>

      <div id="main-content">
      {view === "library" ? <>
      <section className="intro" aria-labelledby="page-title">
        <div className="intro-copy">
          <p className="eyebrow">A LITTLE MORE AWARE OF WHAT YOU OWN</p>
          <h1 id="page-title">Keep what <em>matters.</em></h1>
          <p className="intro-description">Remember what you bought, how it’s holding up, and when it needs care.</p>
        </div>
      </section>

      {!supabaseConfigured ? <p className="local-mode-note">Saved on this browser. Add Supabase details to enable account sign-in and cloud sync.</p> : null}

      {migrationItems ? <section className="migration-card" aria-labelledby="migration-title">
        <div><p className="eyebrow">YOUR BROWSER HAS SAVED RECORDS</p><h2 id="migration-title">Bring your list into this account?</h2><p>{migrationItems.length} item{migrationItems.length === 1 ? "" : "s"}{migrationItems.some((item) => item.productPhoto || item.productPhotoPath) ? `, including ${migrationItems.filter((item) => item.productPhoto || item.productPhotoPath).length} photo${migrationItems.filter((item) => item.productPhoto || item.productPhotoPath).length === 1 ? "" : "s"}` : ""}. Purchases, notes, and product links will be copied. Your browser copy stays here.</p></div>
        <div className="migration-actions"><button className="button button-primary" onClick={importLocalRecords} disabled={migrationBusy}>{migrationBusy ? "Importing…" : "Import records"}</button><button className="text-button" onClick={deferLocalImport} disabled={migrationBusy}>Not now</button></div>
      </section> : null}

      {(items.length > 0) && <section className="summary-strip" aria-label="Your tracker at a glance">
        <div className="summary-cell"><strong className="summary-value">{items.length}</strong><span className="summary-caption">{items.length === 1 ? "thing in your list" : "things in your list"}</span></div>
        {stats.repeated > 0 ? <div className="summary-cell"><strong className="summary-value">{stats.repeated}</strong><span className="summary-caption">repeat purchases</span></div> : null}
        {stats.totals.length ? <div className="summary-cell summary-spend">{stats.totals.map(([currency, total]) => <strong className="summary-money" key={currency}>{formatMoney(total, currency)} <small>{currency}</small></strong>)}<span className="summary-caption">recorded spend</span></div> : null}
      </section>}

      <section className={`workspace ${selectedItem ? "" : "workspace-empty"}`} id="library" aria-labelledby="library-title">
        <div className="library-column">
          <div className="section-heading">
            <div><p className="eyebrow section-eyebrow">YOUR LIBRARY</p><h2 id="library-title">Your things<span className="period">.</span></h2></div>
            {items.length ? <button className="button button-primary add-button" onClick={openAddItem}><Icon name="plus" size={17} /><span>Add a thing</span></button> : null}
          </div>
          {itemForm}
          {items.length ? <div className="library-tools">
            <label className="search-box"><Icon name="search" size={17} /><span className="visually-hidden">Search your things</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find something…" /></label>
            <div className="filter-list" role="group" aria-label="Filter by category">
              {["All things", ...categories].map((value) => <button className={`filter-chip ${category === value ? "active" : ""}`} key={value} onClick={() => setCategory(value)} aria-pressed={category === value}>{value}</button>)}
            </div>
          </div> : null}

          <div className="item-list" aria-live="polite">
            {visibleItems.length ? visibleItems.map((item, index) => {
              const buys = purchases(item);
              const totalUnits = buys.reduce((sum, event) => sum + (event.quantity ?? 1), 0);
              const lastPurchase = lastOfKind(item, "purchase");
              const lastService = lastOfKind(item, "service");
              const isActive = item.id === (selectedItem?.id ?? visibleItems[0]?.id);
              return <button className={`item-row ${isActive ? "selected" : ""}`} key={item.id} onClick={() => setSelectedId(item.id)} aria-pressed={isActive}>
                <span className={`item-number ${index % 3 === 1 ? "number-soft" : ""}`}>{String(index + 1).padStart(2, "0")}</span>
                {item.productPhoto || item.currentProduct?.imageUrl ? <img className="item-thumbnail" src={item.productPhoto || item.currentProduct?.imageUrl} alt="" referrerPolicy="no-referrer" /> : <span className={`item-seal seal-${(item.category || "other").toLowerCase().replace(/[^a-z]/g, "")}`} aria-hidden="true"><span>{item.name.trim().charAt(0).toUpperCase()}</span></span>}
                <span className="item-main"><strong>{item.name}</strong><small>{[item.category || "Unsorted", item.itemType].filter(Boolean).join(" · ")}{totalUnits > 1 ? <span> · {totalUnits} units</span> : buys.length > 1 ? <span> · {buys.length} buys</span> : null}</small></span>
                <span className="item-status">{lastService ? <><small>SERVICE</small><strong>{lastService.date ? ageLabel(lastService.date) + " ago" : "logged"}</strong></> : lastPurchase?.date ? <><small>OWNED</small><strong>{formatAgeFromEvent(item)}</strong></> : <><small>ADDED</small><strong>—</strong></>}</span>
                <span className="row-arrow" aria-hidden="true"><Icon name="arrow" size={17} /></span>
              </button>;
            }) : items.length ? <div className="no-results"><span className="empty-glyph">⌕</span><strong>No matches in this index.</strong><span>Try another word or category.</span><button className="text-button" onClick={() => { setSearch(""); setCategory("All things"); }}>Clear filters</button></div> : modal === "item" ? null : <div className="empty-state">
              <p className="eyebrow">YOUR LIST STARTS HERE</p><h3>Add the first thing you want to remember.</h3><p>A name is enough. Dates, prices, and notes can come later.</p><button className="button button-primary empty-add" onClick={openAddItem}><Icon name="plus" size={17} /> Add a thing</button>
            </div>}
          </div>
          {items.length ? <div className="list-footer"><span>ONE LINE AT A TIME</span><span>{visibleItems.length.toString().padStart(2, "0")} / {items.length.toString().padStart(2, "0")}</span></div> : null}
        </div>

        {selectedItem ? <aside className="detail-column" aria-label={`${selectedItem.name} details`}>
          <div className="detail-record" key={selectedItem.id}>
            <div className="detail-topline"><span className="eyebrow">OBJECT RECORD <span>/ {String(items.findIndex((item) => item.id === selectedItem.id) + 1).padStart(2, "0")}</span></span><button className="icon-button remove-item" onClick={() => removeItem(selectedItem)} aria-label={`Remove ${selectedItem.name}`} title="Remove this thing"><Icon name="trash" size={17} /></button></div>
            <div className="detail-heading"><span className={`detail-seal seal-${(selectedItem.category || "other").toLowerCase().replace(/[^a-z]/g, "")}`} aria-hidden="true">{selectedItem.name.trim().charAt(0).toUpperCase()}</span><div><span className="detail-category">{[selectedItem.category || "UNCATEGORIZED", selectedItem.itemType].filter(Boolean).join(" · ")}</span><h3>{selectedItem.name}</h3></div></div>
            {selectedItem.note ? <p className="item-note">{selectedItem.note}</p> : null}
            {selectedItem.specifications && Object.entries(selectedItem.specifications).some(([, value]) => value) ? <dl className="item-specifications">{Object.entries(selectedItem.specifications).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt>{attributeLabel(key)}</dt><dd>{value}</dd></div>)}</dl> : null}
            <section className={`product-card ${selectedItem.productPhoto || selectedItem.currentProduct?.imageUrl ? "has-product-image" : "no-product-image"}`} aria-label="Product details">
              <div className="product-card-heading"><span className="eyebrow">{selectedItem.storeName || "PRODUCT DETAILS"}</span>{selectedItem.productUrl ? <button className="product-refresh" onClick={() => setProductRefreshToken((value) => value + 1)} aria-label="Refresh current product details" title="Refresh product details"><Icon name="refresh" size={17} /></button> : null}</div>
              {(selectedItem.productPhoto || selectedItem.currentProduct?.imageUrl) ? <img className="product-image" src={selectedItem.productPhoto || selectedItem.currentProduct?.imageUrl} alt={selectedItem.currentProduct?.title || selectedItem.name} referrerPolicy="no-referrer" /> : <div className="product-image-placeholder" aria-hidden="true">{selectedItem.name.trim().charAt(0).toUpperCase()}</div>}
              <div className="product-card-content">
                <strong className="product-title">{selectedItem.currentProduct?.title || (selectedItem.productUrl ? "Product listing" : "Add a product link")}</strong>
                {selectedItem.listedPriceOverride ? <div className="product-price">{formatMoney(selectedItem.listedPriceOverride.amount, selectedItem.listedPriceOverride.currency)} <span>your listed price</span></div> : selectedItem.currentProduct?.amount !== undefined ? <div className="product-price">{selectedItem.currentProduct.currency ? formatMoney(selectedItem.currentProduct.amount, selectedItem.currentProduct.currency) : selectedItem.currentProduct.amount.toLocaleString()} <span>shop price</span></div> : selectedItem.productUrl ? <p className="product-price product-no-price">Price not available</p> : null}
                {selectedItem.currentProduct?.fetchedAt ? <span className="product-checked">Updated {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(selectedItem.currentProduct.fetchedAt))}</span> : null}
              </div>
              {selectedItem.productUrl ? <a className="product-link" href={selectedItem.productUrl} target="_blank" rel="noreferrer noopener">Open shop page <Icon name="arrow" size={15} /></a> : null}
              {productFetch?.itemId === selectedItem.id && productFetch.status === "loading" ? <p className="product-status" aria-live="polite">Checking shop…</p> : null}
              {productFetch?.itemId === selectedItem.id && productFetch.status === "error" ? <p className="product-status product-error" role="status">{productFetch.message} <button onClick={() => setProductRefreshToken((value) => value + 1)}>Try again</button></p> : null}
              <div className="product-controls">
                <button className="text-button" onClick={() => { setEditingProductLinkId((value) => value === selectedItem.id ? null : selectedItem.id); setProductLinkError(""); }}>{selectedItem.productUrl ? "Change product link" : "Add product link"}</button>
                <button className="text-button" onClick={() => productPhotoInput.current?.click()}>{selectedItem.productPhoto ? "Change photo" : "Add your photo"}</button>
                <button className="text-button" onClick={() => { setEditingListedPriceId((value) => value === selectedItem.id ? null : selectedItem.id); setListedPriceError(""); }}>{selectedItem.listedPriceOverride ? "Edit listed price" : "Set listed price"}</button>
                <input ref={productPhotoInput} className="visually-hidden" type="file" accept="image/*" onChange={chooseProductPhoto} aria-label="Choose a product photo" />
                {selectedItem.productPhoto ? <button className="text-button" onClick={removeProductPhoto}>Remove photo</button> : null}
                {selectedItem.listedPriceOverride ? <button className="text-button" onClick={() => { setItems((current) => current.map((item) => item.id === selectedItem.id ? { ...item, listedPriceOverride: undefined } : item)); setEditingListedPriceId(null); announce("Using the shop price again."); }}>Use shop price</button> : null}
              </div>
              {editingProductLinkId === selectedItem.id ? <form className="product-link-form" onSubmit={saveProductLink}>
                <label className="field"><span>Product link</span><input name="productUrl" type="url" maxLength={2048} defaultValue={selectedItem.productUrl ?? ""} placeholder="https://shop.example.com/product" aria-invalid={Boolean(productLinkError)} /></label>
                {productLinkError ? <p className="form-error" role="alert">{productLinkError}</p> : null}
                <div className="product-form-actions"><button className="button button-primary" type="submit">Save link</button><button className="text-button" type="button" onClick={() => { setEditingProductLinkId(null); setProductLinkError(""); }}>Cancel</button></div>
              </form> : null}
              {editingListedPriceId === selectedItem.id ? <form className="product-link-form" onSubmit={saveListedPrice}>
                <label className="field"><span>Current listed price</span><div className="price-input"><input name="listedAmount" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={selectedItem.listedPriceOverride?.amount ?? ""} placeholder="Price on the shop page" /><select name="listedCurrency" aria-label="Currency" defaultValue={selectedItem.listedPriceOverride?.currency ?? "INR"}>{CURRENCIES.map((value) => <option key={value}>{value}</option>)}</select></div></label>
                {listedPriceError ? <p className="form-error" role="alert">{listedPriceError}</p> : null}
                <div className="product-form-actions"><button className="button button-primary" type="submit">Save price</button><button className="text-button" type="button" onClick={() => { setEditingListedPriceId(null); setListedPriceError(""); }}>Cancel</button></div>
              </form> : null}
              {photoDraftItemId === selectedItem.id && photoDraftFile && photoDraftUrl ? <div className="photo-editor">
                <div className="photo-crop-window"><img src={photoDraftUrl} alt="Crop preview" style={{ objectPosition: `${50 + photoOffsetX / 2}% ${50 + photoOffsetY / 2}%`, transform: `scale(${photoZoom})` }} /></div>
                <label className="crop-control"><span>Zoom</span><input type="range" min="1" max="2.8" step="0.01" value={photoZoom} onChange={(event) => setPhotoZoom(Number(event.target.value))} /></label>
                <label className="crop-control"><span>Horizontal</span><input type="range" min="-100" max="100" step="1" value={photoOffsetX} onChange={(event) => setPhotoOffsetX(Number(event.target.value))} /></label>
                <label className="crop-control"><span>Vertical</span><input type="range" min="-100" max="100" step="1" value={photoOffsetY} onChange={(event) => setPhotoOffsetY(Number(event.target.value))} /></label>
                <div className="product-form-actions"><button className="button button-primary" onClick={saveProductPhoto}>Crop & save</button><button className="text-button" onClick={() => { setPhotoDraftFile(null); setPhotoDraftUrl(""); setPhotoDraftItemId(null); }}>Cancel</button></div>
              </div> : null}
              {selectedItem.productUrl ? <p className="product-help">Some shops block automatic price reads. You can add a photo and price yourself.</p> : null}
            </section>
            {(selectedItem.variants?.length || selectedItem.productUrl) ? <section className="variants-panel" aria-label="Product variants">
              <div className="variants-heading"><div><p className="eyebrow">OPTIONS</p><h4>Sizes & options</h4></div><button className="button button-outline" onClick={() => openVariant()}><Icon name="plus" size={15} /> Add option</button></div>
              {selectedItem.variants?.length ? <ul className="variant-list">{selectedItem.variants.map((variant) => <li key={variant.id}>
                <span><strong>{variant.name}</strong>{variant.amount !== undefined ? <small>{formatMoney(variant.amount, variant.currency)}</small> : <small>Price not added</small>}</span>
                <span className="variant-actions"><button className="text-button" onClick={() => openVariant(variant.id)}>Edit</button><button className="text-button" onClick={() => removeVariant(variant)}>Remove</button></span>
              </li>)}</ul> : <p className="variant-hint">Add a size or option and its price.</p>}
            </section> : <div className="variants-invite"><button className="text-button" onClick={() => openVariant()}>Add a size or variant</button></div>}
            {variantForm}
            <div className="detail-facts">
              <div><span>OWNED</span><strong>{formatAgeFromEvent(selectedItem)}</strong></div>
              <div><span>BOUGHT</span><strong>{purchases(selectedItem).reduce((sum, entry) => sum + (entry.quantity ?? 1), 0) || "—"}</strong></div>
              <div><span>SERVICE</span><strong>{lastOfKind(selectedItem, "service")?.date ? `${ageLabel(lastOfKind(selectedItem, "service")?.date)} ago` : "Not logged"}</strong></div>
            </div>
            <div className="history-heading"><div><p className="eyebrow">HISTORY</p><h4>Timeline<span className="period">.</span></h4></div></div>
            <div className="timeline">
            {sortedEvents(selectedItem).length ? sortedEvents(selectedItem).map((event, index) => <article className={`timeline-entry ${event.kind}`} key={event.id}>
                <span className="timeline-node" aria-hidden="true"><span /></span><div className="timeline-copy"><div className="event-label-row"><span className="event-label">{labelForKind(event.kind)}</span><span className="event-date">{formatDate(event.date)}</span></div>
                  {event.kind === "purchase" && (event.variant || (event.quantity ?? 1) > 1) ? <span className="event-variant">{[event.quantity && event.quantity > 1 ? `${event.quantity} units` : null, event.variant].filter(Boolean).join(" · ")}</span> : null}
                  {event.attributes && Object.entries(event.attributes).some(([, value]) => value) ? <span className="event-attributes">{Object.entries(event.attributes).filter(([, value]) => value).map(([key, value]) => `${attributeLabel(key)}: ${value}`).join(" · ")}</span> : null}
                  {event.amount !== undefined ? <strong className="event-amount">{formatMoney(event.amount, event.currency)}{event.kind === "purchase" && (event.quantity ?? 1) > 1 ? <small> total · {formatMoney(event.amount / (event.quantity ?? 1), event.currency)} each</small> : null}</strong> : null}
                  {event.note ? <p>{event.note}</p> : null}
                  {event.feeling ? <span className={`feeling-tag ${event.feeling}`}>{event.feeling === "loved" ? "♥ Loved it" : event.feeling === "regret" ? "↗ Would skip" : "○ It was okay"}</span> : null}
                </div><button className="entry-remove" onClick={() => removeEvent(event.id)} aria-label={`Remove ${labelForKind(event.kind)} entry ${index + 1}`} title="Remove entry"><Icon name="close" size={14} /></button>
              </article>) : <div className="timeline-empty"><span className="timeline-empty-dot" /><p>No history yet.</p></div>}
            </div>
            <div className="detail-actions"><button className="button button-outline" onClick={() => openEvent("purchase")}><Icon name="plus" size={16} /> Add purchase</button><button className="button button-outline" onClick={() => openEvent("service")}><Icon name="plus" size={16} /> Log upkeep</button><button className="button button-outline" onClick={() => openEvent("use")}><Icon name="plus" size={16} /> Add a note</button></div>
            {eventForm}
          </div>
        </aside> : null}
      </section>
      </> : <CalendarView items={items} onOpenItem={(id) => { setSelectedId(id); setCategory("All things"); setSearch(""); setView("library"); }} />}
      </div>

      <footer className="page-footer"><Link className="footer-brand" href="/">kept<span>.</span></Link></footer>

      <div className="toast" role="status" aria-live="polite" data-visible={Boolean(notice)}>{notice}</div>
    </main>
  );
}

function MascotMark({ name }: { name: ProfileMascot }) {
  const base = { viewBox: "0 0 40 40", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const drawings: Record<ProfileMascot, React.ReactNode> = {
    sprout: <><path d="M20 31V19" /><path d="M20 23c-7 0-11-4-11-10 7 0 11 4 11 10Z" /><path d="M20 19c0-7 4-11 11-11 0 7-4 11-11 11Z" /><path d="M14 32h12" /></>,
    moth: <><path d="M20 17c-3-8-12-10-13-3-1 5 4 9 11 9-6 1-8 6-4 8 4 1 7-3 8-8" /><path d="M20 17c3-8 12-10 13-3 1 5-4 9-11 9 6 1 8 6 4 8-4 1-7-3-8-8" /><path d="M18 13l-3-4m7 4 3-4" /></>,
    cat: <><path d="m10 17 2-9 8 6 8-6 2 9v9c0 5-4 8-10 8s-10-3-10-8v-9Z" /><path d="M15 22h.1m9.8 0h.1M17 28c2 2 4 2 6 0" /><path d="m12 25-5 1m6 2-5 3m20-6 5 1m-6 2 5 3" /></>,
    moon: <><path d="M27 28c-9 0-15-7-13-16 1-3 2-5 4-7C10 7 5 14 6 22c1 9 9 15 18 13 5-1 9-5 11-10-2 2-5 3-8 3Z" /><path d="m27 9 .8 2.2L30 12l-2.2.8L27 15l-.8-2.2L24 12l2.2-.8L27 9Z" /></>,
    finch: <><path d="M8 26c0-9 5-16 13-16 7 0 11 6 11 13v8H8v-5Z" /><path d="m22 18 10 4-10 4" /><circle cx="19" cy="19" r="1" fill="currentColor" stroke="none" /><path d="M12 31v3m14-3v3" /></>,
    pebble: <><path d="M7 26c0-8 5-15 13-17 8-1 14 6 14 14 0 7-6 11-14 11S7 32 7 26Z" /><path d="M13 22c2-2 4-2 6 0m3 0c2-2 4-2 6 0M17 28c2 1 4 1 6 0" /></>,
  };
  return <svg {...base}>{drawings[name]}</svg>;
}
