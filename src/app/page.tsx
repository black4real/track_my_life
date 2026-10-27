"use client";

/* Product photos come from the linked shop and intentionally bypass Next image optimization. */
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ageLabel, BackupFile, CATEGORIES, detailFields, EventKind, formatDate, formatMoney, ITEM_TYPES, ItemEvent,
  fallbackItemImage, lastOfKind, makeId, ProductVariant, purchases, sortedEvents, STORAGE_KEY, TrackedItem, validItems,
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
type ProductLookup = { title?: string; imageUrl?: string; amount?: number; currency?: string; fetchedAt?: string; storeName?: string; source?: "flipkart-api" | "product-page"; productId?: string; variant?: string; mrp?: number; availability?: string };
type AddProductPreview = ProductLookup;

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

function normalizedGroup(value?: string) {
  return value?.trim().toLocaleLowerCase() ?? "";
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [deliveryPin, setDeliveryPin] = useState("");
  const [addMode, setAddMode] = useState<"new" | "repeat">("new");
  const [repeatItemId, setRepeatItemId] = useState("");
  const [repeatSearch, setRepeatSearch] = useState("");
  const [addName, setAddName] = useState("");
  const [addCategory, setAddCategory] = useState("");
  const [addItemType, setAddItemType] = useState("");
  const [addBrand, setAddBrand] = useState("");
  const [addRelatedGroup, setAddRelatedGroup] = useState("");
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
  const [addPhotoFile, setAddPhotoFile] = useState<File | null>(null);
  const [addPhotoUrl, setAddPhotoUrl] = useState("");
  const [addPhotoData, setAddPhotoData] = useState("");
  const [addPhotoZoom, setAddPhotoZoom] = useState(1);
  const [addPhotoOffsetX, setAddPhotoOffsetX] = useState(0);
  const [addPhotoOffsetY, setAddPhotoOffsetY] = useState(0);
  const [productFetch, setProductFetch] = useState<{ itemId: string; status: "loading" | "error"; message?: string } | null>(null);
  const [productRefreshToken, setProductRefreshToken] = useState(0);
  const [editingProductLinkId, setEditingProductLinkId] = useState<string | null>(null);
  const [productLinkError, setProductLinkError] = useState("");
  const [photoDraftFile, setPhotoDraftFile] = useState<File | null>(null);
  const [photoDraftUrl, setPhotoDraftUrl] = useState("");
  const [photoDraftItemId, setPhotoDraftItemId] = useState<string | null>(null);
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoOffsetX, setPhotoOffsetX] = useState(0);
  const [photoOffsetY, setPhotoOffsetY] = useState(0);
  const nameInput = useRef<HTMLInputElement>(null);
  const formCloseButton = useRef<HTMLButtonElement>(null);
  const profileCloseButton = useRef<HTMLButtonElement>(null);
  const formReturnFocus = useRef<HTMLElement | null>(null);
  const profileReturnFocus = useRef<HTMLElement | null>(null);
  const profileMenu = useRef<HTMLDivElement>(null);
  const moreMenu = useRef<HTMLDivElement>(null);
  const libraryScroll = useRef(0);
  const returnFilters = useRef<{ search: string; category: string } | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const productPhotoInput = useRef<HTMLInputElement>(null);
  const addProductPhotoInput = useRef<HTMLInputElement>(null);
  const lastSyncedItems = useRef<TrackedItem[]>([]);
  const syncQueue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px), (pointer: coarse) and (max-width: 920px)");
    const update = () => setIsMobileLayout(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const updateHeight = () => document.documentElement.style.setProperty("--visual-height", `${viewport.height}px`);
    updateHeight();
    viewport.addEventListener("resize", updateHeight);
    viewport.addEventListener("scroll", updateHeight);
    return () => {
      viewport.removeEventListener("resize", updateHeight);
      viewport.removeEventListener("scroll", updateHeight);
      document.documentElement.style.removeProperty("--visual-height");
    };
  }, []);

  useEffect(() => {
    const shouldBlockPage = Boolean(modal) || (profileOpen && isMobileLayout);
    if (shouldBlockPage) {
      document.body.classList.add("overlay-open");
      const scrollY = window.scrollY;
      if (isMobileLayout) {
        document.body.style.position = "fixed";
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = "100%";
      }
      return () => {
        document.body.classList.remove("overlay-open");
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        if (isMobileLayout) window.scrollTo({ top: scrollY, behavior: "instant" });
      };
    }
    document.body.classList.remove("overlay-open");
  }, [modal, profileOpen, isMobileLayout]);

  useEffect(() => {
    if (!modal) {
      formReturnFocus.current?.focus({ preventScroll: true });
      formReturnFocus.current = null;
      return;
    }
    requestAnimationFrame(() => formCloseButton.current?.focus({ preventScroll: true }));
    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = document.querySelector<HTMLElement>(".inline-form-card[role='dialog']");
      if (!dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setModal(null);
        setFormError("");
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href]")].filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [modal]);

  useEffect(() => {
    if (!profileOpen && !moreOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (profileOpen && !profileMenu.current?.contains(target)) setProfileOpen(false);
      if (moreOpen && !moreMenu.current?.contains(target)) setMoreOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setProfileOpen(false);
      setMoreOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [profileOpen, moreOpen]);

  useEffect(() => {
    if (!profileOpen) {
      profileReturnFocus.current?.focus({ preventScroll: true });
      profileReturnFocus.current = null;
      return;
    }
    profileReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestAnimationFrame(() => profileCloseButton.current?.focus({ preventScroll: true }));
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setProfileOpen(false); return; }
      if (event.key !== "Tab") return;
      const dialog = profileMenu.current?.querySelector<HTMLElement>(".profile-popover");
      if (!dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]")].filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    };
    document.addEventListener("keydown", trapFocus);
    return () => document.removeEventListener("keydown", trapFocus);
  }, [profileOpen]);

  useEffect(() => {
    if (!isMobileLayout || view !== "library" || selectedId) return;
    requestAnimationFrame(() => window.scrollTo({ top: libraryScroll.current, behavior: "instant" }));
  }, [isMobileLayout, selectedId, view]);

  useEffect(() => {
    if (!isMobileLayout || view !== "library" || !selectedId) return;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [isMobileLayout, selectedId, view]);

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
    .filter((item) => `${item.name} ${item.brand ?? ""} ${item.relatedGroup ?? ""} ${item.category ?? ""} ${item.itemType ?? ""} ${item.note ?? ""}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [items, category, search]);
  const selectedItem = visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;
  const selectedItemImage = selectedItem ? selectedItem.productPhoto || selectedItem.currentProduct?.imageUrl || fallbackItemImage(selectedItem) : undefined;
  const addAttributeFields = detailFields(addCategory, addItemType);
  const addPreviewImage = addPhotoData || addPhotoUrl || addImageUrl || fallbackItemImage({ name: addName, category: addCategory, itemType: addItemType });
  const repeatItem = items.find((item) => item.id === repeatItemId) ?? null;
  const repeatCandidates = items.filter((item) => `${item.name} ${item.brand ?? ""} ${item.category ?? ""} ${item.itemType ?? ""}`.toLowerCase().includes(repeatSearch.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const relatedGroupSuggestions = [...new Set(items.map((item) => item.relatedGroup?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));
  const selectedPurchaseFields = selectedItem ? detailFields(selectedItem.category, selectedItem.itemType).purchase : [];
  const selectedPurchases = selectedItem ? purchases(selectedItem).sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt)) : [];
  const relatedItems = selectedItem?.relatedGroup ? items.filter((item) => item.id !== selectedItem.id && normalizedGroup(item.relatedGroup) === normalizedGroup(selectedItem.relatedGroup)) : [];
  const relatedPurchases = selectedItem?.relatedGroup ? items.filter((item) => normalizedGroup(item.relatedGroup) === normalizedGroup(selectedItem.relatedGroup)).flatMap((item) => purchases(item).map((event) => ({ item, event })))
    .sort((a, b) => (b.event.date || b.event.createdAt).localeCompare(a.event.date || a.event.createdAt)) : [];

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
      const result = await response.json() as ProductLookup & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not read that product page.");
      setItems((current) => current.map((item) => item.id === itemId && item.productUrl === productUrl
        ? { ...item, storeName: item.storeName || result.storeName, currentProduct: { ...item.currentProduct, title: result.title || item.currentProduct?.title, imageUrl: result.imageUrl || item.currentProduct?.imageUrl, fetchedAt: result.fetchedAt, source: result.source, productId: result.productId, variant: result.variant, availability: result.availability } }
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

  useEffect(() => {
    if (!addPhotoUrl) return;
    return () => URL.revokeObjectURL(addPhotoUrl);
  }, [addPhotoUrl]);

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
    formReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAddMode("new"); setRepeatItemId(""); setRepeatSearch("");
    setAddCategory(""); setAddItemType(""); setAddSpecifications({}); setAddCustomFields([]); setAddPurchaseAttributes({});
    setAddName(""); setAddNameTouched(false); setAddBrand(""); setAddRelatedGroup(""); setAddProductUrl(""); setAddStoreName(""); setAddStoreEdited(false);
    setAddPreview(null); setAddPreviewStatus("idle"); setAddImageUrl("");
    setAddPhotoFile(null); setAddPhotoUrl(""); setAddPhotoData(""); setAddPhotoZoom(1); setAddPhotoOffsetX(0); setAddPhotoOffsetY(0);
    setFormError(""); setModal("item");
  }

  function openItemOnMobile(id: string) {
    if (isMobileLayout) libraryScroll.current = window.scrollY;
    setSelectedId(id);
  }

  function closeMobileItem() {
    setSelectedId(null);
    if (returnFilters.current) {
      setSearch(returnFilters.current.search);
      setCategory(returnFilters.current.category);
      returnFilters.current = null;
    }
  }

  function openCalendarItem(id: string) {
    if (isMobileLayout) {
      libraryScroll.current = 0;
      if (!visibleItems.some((item) => item.id === id)) returnFilters.current = { search, category };
    }
    setSelectedId(id);
    setCategory("All things");
    setSearch("");
    setView("library");
  }

  function openEventForm(kind: EventKind) {
    formReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openEvent(kind);
  }

  function openVariantForm(variantId?: string) {
    formReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openVariant(variantId);
  }

  function changeAddProductUrl(value: string) {
    setAddProductUrl(value);
    setAddPreview(null); setAddPreviewStatus("idle"); setAddImageUrl("");
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
      if (!addPhotoData) setAddImageUrl(result.imageUrl ?? "");
      if (!addNameTouched && result.title) setAddName(result.title.slice(0, 80));
      if (!addStoreEdited && result.storeName) setAddStoreName(result.storeName);
      setAddPreviewStatus("idle");
    } catch {
      setAddPreviewStatus("error");
    }
  }

  function chooseAddPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setFormError("Choose an image file for the product photo."); return; }
    if (file.size > 15 * 1024 * 1024) { setFormError("Choose an image under 15 MB."); return; }
    setAddPhotoUrl(URL.createObjectURL(file));
    setAddPhotoFile(file);
    setAddPhotoData("");
    setAddPhotoZoom(1); setAddPhotoOffsetX(0); setAddPhotoOffsetY(0);
    setFormError("");
  }

  async function cropAddPhoto() {
    if (!addPhotoFile) return;
    try {
      const image = await createImageBitmap(addPhotoFile);
      const targetWidth = 640;
      const targetHeight = 800;
      const targetRatio = targetWidth / targetHeight;
      let cropWidth = image.width;
      let cropHeight = image.height;
      if (cropWidth / cropHeight > targetRatio) cropWidth = cropHeight * targetRatio;
      else cropHeight = cropWidth / targetRatio;
      cropWidth /= addPhotoZoom;
      cropHeight /= addPhotoZoom;
      const availableX = image.width - cropWidth;
      const availableY = image.height - cropHeight;
      const sourceX = Math.min(availableX, Math.max(0, availableX / 2 + (addPhotoOffsetX / 100) * availableX / 2));
      const sourceY = Math.min(availableY, Math.max(0, availableY / 2 + (addPhotoOffsetY / 100) * availableY / 2));
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth; canvas.height = targetHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image editor unavailable");
      context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight);
      image.close();
      setAddPhotoData(canvas.toDataURL("image/jpeg", 0.78));
      setFormError("");
    } catch {
      setFormError("That photo could not be prepared. Try another image.");
    }
  }

  function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (addMode === "repeat") {
      if (!repeatItem) {
        setFormError("Choose the product you bought again.");
        return;
      }
      const date = String(data.get("date") ?? "");
      const amountValue = String(data.get("amount") ?? "").trim();
      const amount = amountValue ? Number(amountValue) : undefined;
      if (amountValue && (!Number.isFinite(amount) || (amount ?? -1) < 0)) {
        setFormError("Enter a valid amount paid, or leave it blank.");
        return;
      }
      const quantityValue = String(data.get("repeat_quantity") ?? "1").trim();
      const parsedQuantity = Number(quantityValue || 1);
      if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 10000) {
        setFormError("Enter a quantity from 1 to 10,000.");
        return;
      }
      const quantity = repeatItem.category === "Clothes" ? 1 : parsedQuantity;
      const attributes = Object.fromEntries(detailFields(repeatItem.category, repeatItem.itemType).purchase
        .map((field) => [field.key, String(data.get(`repeat-attribute-${field.key}`) ?? "").trim()] as const)
        .filter(([, value]) => Boolean(value)));
      const variant = String(data.get("repeat_variant") ?? "").trim();
      const note = String(data.get("note") ?? "").trim();
      const now = new Date().toISOString();
      const log: ItemEvent = {
        id: makeId(), kind: "purchase", date: date || undefined, amount,
        currency: amount !== undefined ? String(data.get("currency") || "INR") : undefined,
        quantity: quantity !== 1 ? quantity : undefined, variant: variant || undefined,
        attributes: Object.keys(attributes).length ? attributes : undefined, note: note || undefined, createdAt: now,
      };
      setItems((current) => current.map((item) => item.id === repeatItem.id ? { ...item, events: [...item.events, log] } : item));
      setSelectedId(repeatItem.id);
      setCategory("All things"); setSearch(""); setModal(null); setFormError("");
      announce(`Purchase added to ${repeatItem.name}.`);
      return;
    }
    const name = addName.trim() || String(data.get("name") ?? "").trim();
    if (!name) {
      setFormError("Please add a name before saving.");
      nameInput.current?.focus();
      return;
    }
    if (addPhotoFile && !addPhotoData) {
      setFormError("Use the photo crop before saving, or choose another photo.");
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
    const firstQuantityValue = String(data.get("quantity") ?? "1").trim();
    const firstQuantity = Number(firstQuantityValue || 1);
    if (amountString && (!Number.isFinite(amount) || (amount ?? -1) < 0)) {
      setFormError("Enter a valid amount paid, or leave it blank.");
      return;
    }
    if (categoryValue !== "Clothes" && (!Number.isInteger(firstQuantity) || firstQuantity < 1 || firstQuantity > 10000)) {
      setFormError("Enter a quantity from 1 to 10,000.");
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
      brand: addBrand.trim() || undefined, relatedGroup: addRelatedGroup.trim() || undefined,
      specifications: Object.keys(specifications).length ? specifications : undefined,
      note: note || undefined, productUrl: productUrl || undefined,
      productPhoto: addPhotoData || undefined,
      storeName: addStoreName.trim() || detectRetailer(productUrl)?.name || undefined,
      currentProduct: addPreview ? { title: addPreview.title || addName.trim() || name, imageUrl: addImageUrl || undefined, fetchedAt: addPreview.fetchedAt, source: addPreview.source, productId: addPreview.productId, variant: addPreview.variant, availability: addPreview.availability } : (addImageUrl ? { title: addName.trim() || name, imageUrl: addImageUrl || undefined } : undefined),
      createdAt: now,
      events: date || amount !== undefined || firstQuantity > 1 || Object.values(purchaseAttributes).some(Boolean) ? [{ id: makeId(), kind: "purchase", date: date || undefined, amount, currency: amount !== undefined ? currency : undefined, quantity: categoryValue !== "Clothes" && firstQuantity > 1 ? firstQuantity : undefined, attributes: Object.keys(purchaseAttributes).length ? purchaseAttributes : undefined, createdAt: now }] : [],
    };
    setItems((current) => [...current, item]);
    setSelectedId(item.id);
    setCategory("All things");
    setSearch("");
    setModal(null);
    setFormError("");
    setAddName(""); setAddNameTouched(false); setAddCategory(""); setAddItemType(""); setAddBrand(""); setAddRelatedGroup(""); setAddSpecifications({}); setAddCustomFields([]); setAddPurchaseAttributes({}); setAddProductUrl(""); setAddStoreName(""); setAddStoreEdited(false); setAddPreview(null); setAddPreviewStatus("idle"); setAddImageUrl(""); setAddPhotoFile(null); setAddPhotoData(""); setAddPhotoUrl("");
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
    if (amountString && (!Number.isFinite(amount) || (amount ?? -1) < 0)) {
      setFormError("Enter a valid amount paid, or leave it blank.");
      return;
    }
    const parsedQuantity = Number(quantityValue || 1);
    if (eventKind === "purchase" && selectedItem.category !== "Clothes" && (!Number.isInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 10000)) {
      setFormError("Enter a quantity from 1 to 10,000.");
      return;
    }
    const quantity = eventKind === "purchase" ? selectedItem.category === "Clothes" ? 1 : parsedQuantity : undefined;
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
    const existingVariant = selectedItem.variants?.find((entry) => entry.id === editingVariantId);
    const variant: ProductVariant = { id: editingVariantId ?? makeId(), name, amount: existingVariant?.amount, currency: existingVariant?.currency };
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

  async function saveDeliveryPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const postalCode = deliveryPin.trim();
    if (postalCode && !/^\d{6}$/.test(postalCode)) {
      announce("Enter a 6-digit Indian PIN code, or leave it blank.");
      return;
    }
    if (!user) return;
    setProfileBusy(true);
    const { data, error } = await createClient().auth.updateUser({ data: { kept_delivery_pin: postalCode || null } });
    if (error) announce(`Could not save your delivery PIN: ${error.message}`);
    else {
      if (data.user) setUser(data.user);
      announce(postalCode ? "Delivery PIN saved." : "Delivery PIN removed.");
    }
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

  const itemForm = modal === "item" ? <section className="inline-form-card" role="dialog" aria-modal={isMobileLayout} aria-labelledby="add-title">
    <div className="dialog-top"><div><p className="eyebrow">YOUR PERSONAL LEDGER</p><h2 id="add-title">Add a thing<span className="period">.</span></h2></div><button ref={formCloseButton} className="icon-button" onClick={() => { setModal(null); setFormError(""); }} aria-label="Close add item form"><Icon name="close" /></button></div>
    <div className="add-mode-switch" role="group" aria-label="What would you like to add?"><button type="button" className={addMode === "new" ? "active" : ""} aria-pressed={addMode === "new"} onClick={() => { setAddMode("new"); setFormError(""); }}>New product</button><button type="button" className={addMode === "repeat" ? "active" : ""} aria-pressed={addMode === "repeat"} onClick={() => { setAddMode("repeat"); setFormError(""); }}>Bought again</button></div>
    {formError ? <p className="form-error" id="item-form-error" role="alert">{formError}</p> : null}
    <form onSubmit={saveItem} className="entry-form add-item-form" autoComplete="off" noValidate>
      {addMode === "new" ? <>
        <label className="field"><span>Product name <b>REQUIRED</b></span><input ref={nameInput} name="name" value={addName} maxLength={80} autoFocus={!isMobileLayout} autoCorrect="off" autoCapitalize="sentences" placeholder="e.g. Salicylic face wash" aria-required="true" aria-invalid={formError === "Please add a name before saving."} aria-describedby={formError === "Please add a name before saving." ? "item-form-error" : undefined} onChange={(event) => { setAddName(event.target.value); setAddNameTouched(true); setFormError(""); }} /></label>
        <div className="field-pair"><label className="field"><span>Category</span><select name="category" value={addCategory} onChange={(event) => { setAddCategory(event.target.value); setAddSpecifications({}); setAddPurchaseAttributes({}); }}><option value="">Choose if useful</option>{CATEGORIES.map((option) => <option key={option}>{option}</option>)}</select></label><label className="field"><span>Product type <b>OPTIONAL</b></span><input value={addItemType} onChange={(event) => setAddItemType(event.target.value)} list="item-type-options" maxLength={100} placeholder="e.g. sunscreen" /><datalist id="item-type-options">{Array.from(new Set(ITEM_TYPES[addCategory] ?? Object.values(ITEM_TYPES).flat())).map((type) => <option key={type} value={type} />)}</datalist></label></div>
        <div className="field-pair"><label className="field"><span>Brand <b>OPTIONAL</b></span><input value={addBrand} onChange={(event) => setAddBrand(event.target.value)} maxLength={100} placeholder="e.g. Minimalist" /></label><label className="field"><span>Related products <b>OPTIONAL</b></span><input value={addRelatedGroup} onChange={(event) => setAddRelatedGroup(event.target.value)} list="related-group-options" maxLength={100} placeholder="e.g. Sunscreen" /><datalist id="related-group-options">{relatedGroupSuggestions.map((group) => <option key={group} value={group} />)}</datalist></label></div>
        {addAttributeFields.item.length ? <div className="attribute-fields" aria-label="Suggested product details">{addAttributeFields.item.map((field) => <label className="field" key={field.key}><span>{field.label} <b>OPTIONAL</b></span><input maxLength={160} value={addSpecifications[field.key] ?? ""} placeholder={field.placeholder} onChange={(event) => setAddSpecifications((current) => ({ ...current, [field.key]: event.target.value }))} /></label>)}</div> : null}
        <details className="more-item-details"><summary>Extra details <span>Anything that does not fit above</span></summary><div className="custom-fields-block">{addCustomFields.map((field) => <div className="custom-attribute-row" key={field.id}><label className="field"><span>Detail name</span><input maxLength={60} value={field.label} placeholder="e.g. Fabric" onChange={(event) => setAddCustomFields((current) => current.map((entry) => entry.id === field.id ? { ...entry, label: event.target.value } : entry))} /></label><label className="field"><span>Value</span><input maxLength={160} value={field.value} placeholder="Add a detail" onChange={(event) => setAddCustomFields((current) => current.map((entry) => entry.id === field.id ? { ...entry, value: event.target.value } : entry))} /></label><button className="text-button remove-custom-field" type="button" onClick={() => setAddCustomFields((current) => current.filter((entry) => entry.id !== field.id))} aria-label="Remove custom detail">Remove</button></div>)}<button className="text-button add-custom-field" type="button" disabled={addCustomFields.length >= 20} onClick={() => setAddCustomFields((current) => [...current, { id: makeId(), label: "", value: "" }])}>＋ Add a detail</button></div></details>
        <section className="add-photo-editor" aria-label="Product photo">
          <div className="add-photo-editor-heading"><strong>Product photo</strong><span>{addPhotoData ? "Ready to save" : addPhotoFile ? "Adjust the crop" : "Optional"}</span></div>
          <div className="add-photo-editor-content">{addPreviewImage ? <img src={addPreviewImage} alt={`${addName || "Product"} photo preview`} style={addPhotoFile && !addPhotoData ? { objectPosition: `${50 + addPhotoOffsetX / 2}% ${50 + addPhotoOffsetY / 2}%`, transform: `scale(${addPhotoZoom})` } : undefined} referrerPolicy="no-referrer" /> : <div className="add-preview-placeholder" aria-hidden="true">{addName.trim().charAt(0).toUpperCase() || "＋"}</div>}<div><button className="button button-outline" type="button" onClick={() => addProductPhotoInput.current?.click()}><Icon name="upload" size={15} />{addPhotoFile || addPhotoData ? "Choose another photo" : "Upload a photo"}</button><input ref={addProductPhotoInput} className="visually-hidden" type="file" accept="image/*" onChange={chooseAddPhoto} aria-label="Upload a product photo" />{addPhotoFile ? <><label className="crop-control"><span>Zoom</span><input type="range" min="1" max="2.8" step="0.01" value={addPhotoZoom} onChange={(event) => setAddPhotoZoom(Number(event.target.value))} /></label><label className="crop-control"><span>Horizontal</span><input type="range" min="-100" max="100" step="1" value={addPhotoOffsetX} onChange={(event) => setAddPhotoOffsetX(Number(event.target.value))} /></label><label className="crop-control"><span>Vertical</span><input type="range" min="-100" max="100" step="1" value={addPhotoOffsetY} onChange={(event) => setAddPhotoOffsetY(Number(event.target.value))} /></label><button className="text-button" type="button" onClick={cropAddPhoto}>{addPhotoData ? "Update crop" : "Use this crop"}</button></> : null}</div></div>
        </section>
        <details className="more-item-details"><summary>Product link <span>Find a title or photo from a shop page</span></summary><div className="shop-link-block">
          <label className="field"><span>Product link <b>OPTIONAL</b></span><input name="productUrl" type="url" value={addProductUrl} maxLength={2048} placeholder="Paste a product page link" aria-invalid={formError.startsWith("Add a full product link")} onChange={(event) => { changeAddProductUrl(event.target.value); setFormError(""); }} /><small className="field-hint">Some shops block automatic reads. You can still save your own photo.</small></label>
          <label className="field"><span>Shop</span><input value={addStoreName} onChange={(event) => { setAddStoreName(event.target.value); setAddStoreEdited(true); }} list="retailer-options" placeholder="Shop name" /><datalist id="retailer-options">{RETAILERS.map((retailer) => <option key={retailer.name} value={retailer.name}>{retailer.group}</option>)}</datalist></label>
          <button className="button button-outline preview-product-button" type="button" onClick={previewAddProduct} disabled={!addProductUrl || addPreviewStatus === "loading"}><Icon name="refresh" size={15} />{addPreviewStatus === "loading" ? "Checking product…" : "Find product details"}</button>
          {addPreviewStatus === "error" ? <p className="product-status product-error" role="status">This page couldn’t be read. Add the name and photo yourself.</p> : null}
          {addPreview ? <p className="product-status" role="status">{addPreview.title ? `Found: ${addPreview.title}` : "Product page checked."} You can edit the details above.</p> : null}
          <label className="field"><span>Photo link <b>OPTIONAL</b></span><input type="url" value={addImageUrl} onChange={(event) => setAddImageUrl(event.target.value)} placeholder="https://…" /></label>
        </div></details>
        <div className="form-subheading"><span>FIRST PURCHASE</span><span>OPTIONAL</span></div>
        <div className="field-pair"><label className="field"><span>Date</span><input type="date" name="date" max={new Date().toISOString().slice(0, 10)} /></label><label className="field"><span>Total you paid</span><div className="price-input"><input name="amount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="—" /><select name="currency" aria-label="Currency" defaultValue="INR">{CURRENCIES.map((value) => <option key={value}>{value}</option>)}</select></div></label></div>
        {addCategory !== "Clothes" ? <label className="field"><span>Quantity</span><input name="quantity" type="number" min="1" max="10000" step="1" inputMode="numeric" defaultValue="1" /></label> : null}
        {addAttributeFields.purchase.length ? <div className="attribute-fields purchase-attribute-fields">{addAttributeFields.purchase.map((field) => <label className="field" key={field.key}><span>{field.label} <b>OPTIONAL</b></span><input maxLength={120} value={addPurchaseAttributes[field.key] ?? ""} placeholder={field.placeholder} onChange={(event) => setAddPurchaseAttributes((current) => ({ ...current, [field.key]: event.target.value }))} /></label>)}</div> : null}
        <label className="field"><span>Note <b>OPTIONAL</b></span><textarea name="note" rows={2} maxLength={240} placeholder="Anything useful to remember…" /></label>
      </> : <>
        <p className="dialog-intro">Choose the same product to continue its history and reuse its photo.</p>
        <label className="field"><span>Find a product</span><input value={repeatSearch} onChange={(event) => { setRepeatSearch(event.target.value); setRepeatItemId(""); }} placeholder="Search name or brand" autoComplete="off" /></label>
        {repeatItem ? <div className="repeat-selected-card">{repeatItem.productPhoto || repeatItem.currentProduct?.imageUrl || fallbackItemImage(repeatItem) ? <img src={repeatItem.productPhoto || repeatItem.currentProduct?.imageUrl || fallbackItemImage(repeatItem)} alt="" referrerPolicy="no-referrer" /> : <span className="add-preview-placeholder" aria-hidden="true">{repeatItem.name.charAt(0).toUpperCase()}</span>}<span><strong>{repeatItem.name}</strong><small>{[repeatItem.brand, repeatItem.itemType, repeatItem.relatedGroup].filter(Boolean).join(" · ")}</small>{lastOfKind(repeatItem, "purchase") ? <small>Last: {formatDate(lastOfKind(repeatItem, "purchase")?.date)}{lastOfKind(repeatItem, "purchase")?.amount !== undefined ? ` · ${formatMoney(lastOfKind(repeatItem, "purchase")?.amount, lastOfKind(repeatItem, "purchase")?.currency)}` : ""}</small> : <small>No purchase recorded yet</small>}</span><button type="button" className="text-button" onClick={() => { setRepeatItemId(""); setRepeatSearch(""); }}>Change</button></div> : <div className="repeat-item-picker" role="listbox" aria-label="Saved products">{repeatCandidates.map((item) => { const photo = item.productPhoto || item.currentProduct?.imageUrl || fallbackItemImage(item); const last = lastOfKind(item, "purchase"); return <button type="button" role="option" aria-selected={repeatItemId === item.id} className="repeat-item-option" key={item.id} onClick={() => { setRepeatItemId(item.id); setRepeatSearch(item.name); setFormError(""); }}><span className="repeat-item-photo">{photo ? <img src={photo} alt="" referrerPolicy="no-referrer" /> : <i>{item.name.charAt(0).toUpperCase()}</i>}</span><span><strong>{item.name}</strong><small>{[item.brand, item.itemType].filter(Boolean).join(" · ") || item.category || "Product"}</small><small>{last?.amount !== undefined ? `Last paid ${formatMoney(last.amount, last.currency)}${(last.quantity ?? 1) > 1 ? ` for ${last.quantity} units` : ""}` : "No purchase recorded yet"}</small></span><span aria-hidden="true">→</span></button>; })}{repeatCandidates.length === 0 ? <p className="repeat-empty">No saved product matches. Choose New product to add a different brand or formula.</p> : null}</div>}
        {repeatItem ? <><div className="form-subheading"><span>THIS PURCHASE</span><span>PAID BY YOU</span></div><div className="field-pair"><label className="field"><span>Date</span><input type="date" name="date" max={new Date().toISOString().slice(0, 10)} /></label><label className="field"><span>Total you paid</span><div className="price-input"><input name="amount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="—" /><select name="currency" aria-label="Currency" defaultValue="INR">{CURRENCIES.map((value) => <option key={value}>{value}</option>)}</select></div></label></div>
          {repeatItem.category !== "Clothes" ? <label className="field"><span>Quantity</span><input name="repeat_quantity" type="number" min="1" max="10000" step="1" inputMode="numeric" defaultValue="1" /></label> : <small className="field-hint">For clothes, add one piece at a time so its size and color stay with it.</small>}
          {detailFields(repeatItem.category, repeatItem.itemType).purchase.map((field) => <label className="field" key={field.key}><span>{field.label} <b>OPTIONAL</b></span><input name={`repeat-attribute-${field.key}`} maxLength={120} placeholder={field.placeholder} /></label>)}
          {repeatItem.category !== "Clothes" ? <label className="field"><span>Size, flavor, or option <b>OPTIONAL</b></span><input name="repeat_variant" maxLength={120} placeholder="e.g. 100 ml bottle, oats formula" /></label> : null}
          <label className="field"><span>Coupon, bundle, or note <b>OPTIONAL</b></span><textarea name="note" rows={2} maxLength={400} placeholder="What changed this time?" /></label>
        </> : null}
      </>}
      <div className="dialog-footer"><span>{addMode === "repeat" ? "Your saved product photo stays linked." : user ? "Saved to your account." : "Saved in this browser."}</span><button className="button button-primary" type="submit" disabled={addMode === "repeat" && !repeatItem}>{addMode === "repeat" ? "Add this purchase" : "Save product"} <Icon name="arrow" size={16} /></button></div>
    </form>
  </section> : null;

  const eventForm = modal === "event" && selectedItem ? <section className="inline-form-card detail-inline-form" role="dialog" aria-modal={isMobileLayout} aria-labelledby="event-title">
    <div className="dialog-top"><div><p className="eyebrow">{selectedItem.name} / ADD TO THE STORY</p><h2 id="event-title">{eventKind === "purchase" ? "A purchase" : eventKind === "service" ? "Some upkeep" : "A use note"}<span className="period">.</span></h2></div><button ref={formCloseButton} className="icon-button" onClick={() => setModal(null)} aria-label="Close history form"><Icon name="close" /></button></div>
    <p className="dialog-intro">Write down what you remember. You can leave any field blank.</p>
    <form onSubmit={saveEvent} className="entry-form" autoComplete="off" noValidate>
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

  const variantForm = modal === "variant" && selectedItem ? <section className="inline-form-card detail-inline-form" role="dialog" aria-modal={isMobileLayout} aria-labelledby="variant-title">
    <div className="dialog-top"><div><p className="eyebrow">{selectedItem.name} / OPTIONS</p><h2 id="variant-title">{editingVariantId ? "Edit a variant" : "Add a variant"}<span className="period">.</span></h2></div><button ref={formCloseButton} className="icon-button" onClick={() => { setModal(null); setEditingVariantId(null); }} aria-label="Close variant form"><Icon name="close" /></button></div>
    <p className="dialog-intro">Save a size, color, or other option.</p>
    {formError ? <p className="form-error" id="variant-form-error" role="alert">{formError}</p> : null}
    <form onSubmit={saveVariant} className="entry-form" autoComplete="off" noValidate>
      <label className="field"><span>Variant name <b>REQUIRED</b></span><input ref={nameInput} name="name" maxLength={120} autoFocus={!isMobileLayout} autoCorrect="off" autoCapitalize="sentences" defaultValue={selectedItem.variants?.find((variant) => variant.id === editingVariantId)?.name ?? ""} placeholder="e.g. 100g tube" aria-required="true" aria-invalid={Boolean(formError)} aria-describedby={formError ? "variant-form-error" : undefined} onChange={() => setFormError("")} /></label>
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
          <div className="more-menu-wrap" ref={moreMenu}>
            <button className="quiet-button more-menu-trigger" aria-expanded={moreOpen} aria-haspopup="menu" onClick={() => setMoreOpen((open) => !open)}>More <span aria-hidden="true">⌄</span></button>
            {moreOpen ? <div className="more-menu" role="menu" aria-label="More actions">
              <button role="menuitem" onClick={() => { exportBackup(); setMoreOpen(false); }} disabled={!items.length}><Icon name="download" size={16} /> Back up</button>
              <button role="menuitem" onClick={() => { importInput.current?.click(); setMoreOpen(false); }}><Icon name="upload" size={16} /> Restore</button>
            </div> : null}
          </div>
          {user ? <div className="profile-menu-wrap" ref={profileMenu}>
            <button className="profile-trigger" onClick={() => { setDeliveryPin(String(user.user_metadata?.kept_delivery_pin ?? "")); setProfileOpen((open) => !open); }} aria-expanded={profileOpen} aria-haspopup="dialog" aria-label="Open profile settings">
              <span className={`profile-avatar mascot-${profileMascot}`}><MascotMark name={profileMascot} /></span><span className="profile-trigger-label">Profile</span>
            </button>
            {profileOpen ? <section className="profile-popover" role="dialog" aria-modal={isMobileLayout} aria-label="Profile settings">
              <div className="profile-popover-heading"><div><p className="eyebrow">YOUR ACCOUNT</p><strong>Profile picture</strong></div><button ref={profileCloseButton} className="icon-button" onClick={() => setProfileOpen(false)} aria-label="Close profile settings"><Icon name="close" size={16} /></button></div>
              <p className="profile-email">{user.email}</p>
              <p className="profile-prompt">Choose a little mascot for your account.</p>
              <div className="mascot-grid" aria-label="Profile picture options">
                {PROFILE_MASCOTS.map((mascot) => <button key={mascot} type="button" className={`mascot-option mascot-${mascot}${profileMascot === mascot ? " selected" : ""}`} onClick={() => saveProfileMascot(mascot)} disabled={profileBusy} aria-pressed={profileMascot === mascot} aria-label={`${mascot} profile picture`} title={mascot}>
                  <MascotMark name={mascot} /><span>{mascot}</span>
                </button>)}
              </div>
              <form className="delivery-pin-form" onSubmit={saveDeliveryPin}>
                <label className="field"><span>Delivery PIN <b>OPTIONAL</b></span><input inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{6}" maxLength={6} value={deliveryPin} onChange={(event) => setDeliveryPin(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit PIN code" aria-describedby="delivery-pin-help" /></label>
                <small id="delivery-pin-help">Saved to your account. Current product lookups do not share it with shops.</small>
                <button className="profile-signout delivery-pin-save" type="submit" disabled={profileBusy}>Save delivery PIN</button>
              </form>
              <button className="profile-signout" onClick={signOut}>Sign out</button>
            </section> : null}
          </div> : null}
          <input ref={importInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={importBackup} aria-label="Choose a Kept backup file" />
        </div>
      </header>

      <nav className="view-switch" aria-label="Main views">
        <button type="button" className={view === "library" ? "active" : ""} aria-current={view === "library" ? "page" : undefined} onClick={() => { setView("library"); setSelectedId(null); }}>Library</button>
        <button type="button" className={view === "calendar" ? "active" : ""} aria-current={view === "calendar" ? "page" : undefined} onClick={() => { setView("calendar"); setSelectedId(null); }}>Calendar</button>
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

      <section className={`workspace${selectedItem ? "" : " workspace-empty"}${isMobileLayout && selectedId ? " mobile-detail-open" : ""}`} id="library" aria-labelledby="library-title">
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
              return <button className={`item-row ${isActive ? "selected" : ""}`} key={item.id} onClick={() => openItemOnMobile(item.id)} aria-pressed={isActive}>
                <span className={`item-number ${index % 3 === 1 ? "number-soft" : ""}`}>{String(index + 1).padStart(2, "0")}</span>
                {item.productPhoto || item.currentProduct?.imageUrl || fallbackItemImage(item) ? <img className="item-thumbnail" src={item.productPhoto || item.currentProduct?.imageUrl || fallbackItemImage(item)} alt="" referrerPolicy="no-referrer" /> : <span className={`item-seal seal-${(item.category || "other").toLowerCase().replace(/[^a-z]/g, "")}`} aria-hidden="true"><span>{item.name.trim().charAt(0).toUpperCase()}</span></span>}
                <span className="item-main"><strong>{item.name}</strong><small>{[item.brand, item.category || "Unsorted", item.itemType].filter(Boolean).join(" · ")}{totalUnits > 1 ? <span> · {totalUnits} units</span> : buys.length > 1 ? <span> · {buys.length} buys</span> : null}</small></span>
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
            <div className="detail-topline"><button className="mobile-back-button" onClick={closeMobileItem}><span aria-hidden="true">←</span> Library</button><span className="eyebrow">OBJECT RECORD <span>/ {String(items.findIndex((item) => item.id === selectedItem.id) + 1).padStart(2, "0")}</span></span><button className="icon-button remove-item" onClick={() => removeItem(selectedItem)} aria-label={`Remove ${selectedItem.name}`} title="Remove this thing"><Icon name="trash" size={17} /></button></div>
            <div className="detail-heading"><span className={`detail-seal seal-${(selectedItem.category || "other").toLowerCase().replace(/[^a-z]/g, "")}`} aria-hidden="true">{selectedItem.name.trim().charAt(0).toUpperCase()}</span><div><span className="detail-category">{[selectedItem.brand, selectedItem.category || "UNCATEGORIZED", selectedItem.itemType].filter(Boolean).join(" · ")}</span><h3>{selectedItem.name}</h3></div></div>
            {selectedItem.note || selectedItem.specifications && Object.values(selectedItem.specifications).some(Boolean) ? <details className="more-item-details detail-extra-details"><summary>More about this item <span>Notes and saved details</span></summary>{selectedItem.note ? <p className="item-note">{selectedItem.note}</p> : null}{selectedItem.specifications && Object.entries(selectedItem.specifications).some(([, value]) => value) ? <dl className="item-specifications">{Object.entries(selectedItem.specifications).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt>{attributeLabel(key)}</dt><dd>{value}</dd></div>)}</dl> : null}</details> : null}
            <section className={`product-card purchase-ledger-card ${selectedItemImage ? "has-product-image" : "no-product-image"}`} aria-label="Product and purchase history">
              <div className="product-card-heading"><span className="eyebrow">{selectedItem.brand || selectedItem.storeName || "YOUR PRODUCT"}</span>{selectedItem.productUrl ? <button className="product-refresh" onClick={() => setProductRefreshToken((value) => value + 1)} aria-label="Refresh product name and photo" title="Refresh product details"><Icon name="refresh" size={17} /></button> : null}</div>
              <div className="purchase-ledger-product">{selectedItemImage ? <img className="product-image" src={selectedItemImage} alt={selectedItem.currentProduct?.title || selectedItem.name} referrerPolicy="no-referrer" /> : <div className="product-image-placeholder" aria-hidden="true">{selectedItem.name.trim().charAt(0).toUpperCase()}</div>}<div className="purchase-ledger-copy"><strong className="product-title">{selectedItem.name}</strong>{selectedItem.currentProduct?.title && selectedItem.currentProduct.title !== selectedItem.name ? <span className="product-subtitle">{selectedItem.currentProduct.title}</span> : null}<span className="product-subtitle">{[selectedItem.brand, selectedItem.itemType, selectedItem.relatedGroup].filter(Boolean).join(" · ") || selectedItem.category || "Your product"}</span></div></div>
              <section className="purchase-comparison" aria-label="Recent amounts paid"><h4>What you paid</h4>{selectedPurchases.length ? <div className="purchase-comparison-grid">{selectedPurchases.slice(0, 2).map((purchase, index) => { const quantity = purchase.quantity ?? 1; return <article className="purchase-comparison-card" key={purchase.id}><span>{index === 0 ? "LATEST" : "PREVIOUS"}</span><strong>{formatMoney(purchase.amount, purchase.currency) || "Amount not added"}</strong><small>{quantity} {quantity === 1 ? "item" : "items"} · {formatDate(purchase.date)}</small>{purchase.amount !== undefined ? <small>{formatMoney(purchase.amount / quantity, purchase.currency)} each</small> : null}</article>; })}</div> : <p className="purchase-empty">No purchase logged yet.</p>}</section>
              {selectedItem.productUrl ? <a className="product-link" href={selectedItem.productUrl} target="_blank" rel="noreferrer noopener">Open product page <Icon name="arrow" size={15} /></a> : null}
              {productFetch?.itemId === selectedItem.id && productFetch.status === "loading" ? <p className="product-status" aria-live="polite">Checking product details…</p> : null}
              {productFetch?.itemId === selectedItem.id && productFetch.status === "error" ? <p className="product-status product-error" role="status">Product details couldn’t be refreshed. Your saved photo and history are safe. <button onClick={() => setProductRefreshToken((value) => value + 1)}>Try again</button></p> : null}
              <details className="more-product-details"><summary>More product details <span>Photo, shop link, and options</span></summary><div className="more-product-content">
                <div className="product-controls"><button className="text-button" onClick={() => { setEditingProductLinkId((value) => value === selectedItem.id ? null : selectedItem.id); setProductLinkError(""); }}>{selectedItem.productUrl ? "Change product link" : "Add product link"}</button><button className="text-button" onClick={() => productPhotoInput.current?.click()}>{selectedItem.productPhoto ? "Change photo" : "Add your photo"}</button><input ref={productPhotoInput} className="visually-hidden" type="file" accept="image/*" onChange={chooseProductPhoto} aria-label="Choose a product photo" />{selectedItem.productPhoto ? <button className="text-button" onClick={removeProductPhoto}>Remove photo</button> : null}</div>
                {editingProductLinkId === selectedItem.id ? <form className="product-link-form" onSubmit={saveProductLink}><label className="field"><span>Product link</span><input name="productUrl" type="url" maxLength={2048} defaultValue={selectedItem.productUrl ?? ""} placeholder="https://shop.example.com/product" aria-invalid={Boolean(productLinkError)} /></label>{productLinkError ? <p className="form-error" role="alert">{productLinkError}</p> : null}<div className="product-form-actions"><button className="button button-primary" type="submit">Save link</button><button className="text-button" type="button" onClick={() => { setEditingProductLinkId(null); setProductLinkError(""); }}>Cancel</button></div></form> : null}
                {photoDraftItemId === selectedItem.id && photoDraftFile && photoDraftUrl ? <div className="photo-editor"><div className="photo-crop-window"><img src={photoDraftUrl} alt="Crop preview" style={{ objectPosition: `${50 + photoOffsetX / 2}% ${50 + photoOffsetY / 2}%`, transform: `scale(${photoZoom})` }} /></div><label className="crop-control"><span>Zoom</span><input type="range" min="1" max="2.8" step="0.01" value={photoZoom} onChange={(event) => setPhotoZoom(Number(event.target.value))} /></label><label className="crop-control"><span>Horizontal</span><input type="range" min="-100" max="100" step="1" value={photoOffsetX} onChange={(event) => setPhotoOffsetX(Number(event.target.value))} /></label><label className="crop-control"><span>Vertical</span><input type="range" min="-100" max="100" step="1" value={photoOffsetY} onChange={(event) => setPhotoOffsetY(Number(event.target.value))} /></label><div className="product-form-actions"><button className="button button-primary" onClick={saveProductPhoto}>Crop & save</button><button className="text-button" onClick={() => { setPhotoDraftFile(null); setPhotoDraftUrl(""); setPhotoDraftItemId(null); }}>Cancel</button></div></div> : null}
              </div></details>
            </section>
            {selectedItem.relatedGroup ? <section className="related-purchases" aria-label={`Other products in ${selectedItem.relatedGroup}`}><div className="related-purchases-heading"><div><p className="eyebrow">SAME ROUTINE OR NEED</p><h4>{selectedItem.relatedGroup}</h4></div><span>{relatedItems.length + 1} products</span></div>{relatedItems.length ? <><p className="related-purchases-intro">Different products, together for comparison.</p><div className="related-purchase-list">{relatedPurchases.map(({ item, event }) => { const photo = item.productPhoto || item.currentProduct?.imageUrl || fallbackItemImage(item); const quantity = event.quantity ?? 1; return <button type="button" className="related-purchase-row" key={`${item.id}-${event.id}`} onClick={() => { setSelectedId(item.id); setSearch(""); setCategory("All things"); }}><span className="related-purchase-photo">{photo ? <img src={photo} alt="" referrerPolicy="no-referrer" /> : <i>{item.name.charAt(0).toUpperCase()}</i>}</span><span className="related-purchase-name"><strong>{item.name}</strong><small>{[item.brand, formatDate(event.date)].filter(Boolean).join(" · ")}</small></span><span className="related-purchase-amount">{formatMoney(event.amount, event.currency) || "—"}<small>{quantity} {quantity === 1 ? "item" : "items"}{event.amount !== undefined ? ` · ${formatMoney(event.amount / quantity, event.currency)} each` : ""}</small></span></button>; })}</div></> : <p className="related-purchases-intro">Add another product to compare purchases across brands or formulas.</p>}</section> : null}
            {(selectedItem.variants?.length || selectedItem.productUrl) ? <section className="variants-panel" aria-label="Product variants">
              <div className="variants-heading"><div><p className="eyebrow">OPTIONS</p><h4>Sizes & options</h4></div><button className="button button-outline" onClick={() => openVariantForm()}><Icon name="plus" size={15} /> Add option</button></div>
              {selectedItem.variants?.length ? <ul className="variant-list">{selectedItem.variants.map((variant) => <li key={variant.id}>
                <span><strong>{variant.name}</strong></span>
                <span className="variant-actions"><button className="text-button" onClick={() => openVariantForm(variant.id)}>Edit</button><button className="text-button" onClick={() => removeVariant(variant)}>Remove</button></span>
              </li>)}</ul> : <p className="variant-hint">Add an option to keep a size, color, or version easy to choose.</p>}
            </section> : <div className="variants-invite"><button className="text-button" onClick={() => openVariantForm()}>Add a size or variant</button></div>}
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
            <div className="detail-actions"><button className="button button-outline" onClick={() => openEventForm("purchase")}><Icon name="plus" size={16} /> Add purchase</button><button className="button button-outline" onClick={() => openEventForm("service")}><Icon name="plus" size={16} /> Log upkeep</button><button className="button button-outline" onClick={() => openEventForm("use")}><Icon name="plus" size={16} /> Add a note</button></div>
            {eventForm}
          </div>
        </aside> : null}
      </section>
      </> : null}
      <div className="calendar-keep-alive" hidden={view !== "calendar"}><CalendarView items={items} onOpenItem={openCalendarItem} isMobileLayout={isMobileLayout} /></div>
      </div>

      <nav className="mobile-tabbar" aria-label="Primary navigation">
        <button type="button" className={view === "library" ? "active" : ""} aria-current={view === "library" ? "page" : undefined} onClick={() => { setView("library"); setSelectedId(null); }}><span aria-hidden="true">▤</span>Library</button>
        <button type="button" className={view === "calendar" ? "active" : ""} aria-current={view === "calendar" ? "page" : undefined} onClick={() => { setView("calendar"); setSelectedId(null); }}><span aria-hidden="true">▦</span>Calendar</button>
      </nav>

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
