"use client";

/* Product photos come from the linked shop and intentionally bypass Next image optimization. */
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ageLabel, BackupFile, CATEGORIES, categoryForItemType, detailFields, EMPTY_ROUTINE_DATA, EventKind, formatDate, formatMoney, isConsumableType, isServiceType, ITEM_TYPES, ItemEvent,
  fallbackItemImage, lastOfKind, makeId, ProductVariant, purchases, ROUTINE_STORAGE_KEY, RoutineData, sortedEvents, STORAGE_KEY, TrackedItem, validItems, validRoutineData,
} from "@/lib/tracker";
import { AuthPanel } from "@/app/auth-panel";
import { CalendarView } from "@/app/calendar-view";
import { RoutineView } from "@/app/routine-view";
import { detectRetailer, RETAILERS } from "@/lib/retailers";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { importTrackerItems, loadTrackerItems, makeCloudCompatibleItems, syncTrackerItems } from "@/lib/supabase/tracker";
import { loadRoutineData, syncRoutineData } from "@/lib/supabase/routine";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AUD", "CAD", "SGD"];
const THEME_STORAGE_KEY = "kept-theme-v1";
const PROFILE_MASCOTS = ["sprout", "moth", "cat", "moon", "finch", "pebble"] as const;
type ProfileMascot = typeof PROFILE_MASCOTS[number];
type ProductLookup = { title?: string; imageUrl?: string; amount?: number; currency?: string; fetchedAt?: string; storeName?: string; source?: "flipkart-api" | "product-page"; productId?: string; variant?: string; mrp?: number; availability?: string };
type AddProductPreview = ProductLookup;

type PendingItemSnapshot = { items: TrackedItem[]; deletedIds: string[] };

function pendingItemsKey(userId: string) { return `kept-pending-items-v1-${userId}`; }

function mergePendingItems(cloudItems: TrackedItem[], pending: PendingItemSnapshot): TrackedItem[] {
  const deleted = new Set(pending.deletedIds);
  const localById = new Map(pending.items.map((item) => [item.id, item]));
  const merged = cloudItems.filter((item) => !deleted.has(item.id)).map((cloudItem) => {
    const localItem = localById.get(cloudItem.id);
    if (!localItem) return cloudItem;
    const events = new Map(cloudItem.events.map((entry) => [entry.id, entry]));
    localItem.events.forEach((entry) => events.set(entry.id, entry));
    localById.delete(cloudItem.id);
    return {
      ...cloudItem,
      ...localItem,
      productPhoto: localItem.productPhotoPath && localItem.productPhotoPath === cloudItem.productPhotoPath ? cloudItem.productPhoto : localItem.productPhoto,
      events: [...events.values()],
    };
  });
  for (const item of localById.values()) if (!deleted.has(item.id)) merged.push(item);
  return merged;
}

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function validMascot(value: unknown): value is ProfileMascot {
  return typeof value === "string" && PROFILE_MASCOTS.includes(value as ProfileMascot);
}
const MASCOT_BACKGROUNDS: Record<ProfileMascot, string> = {
  sprout: "dce8c7", moth: "eadfce", cat: "eadde1", moon: "dce3ed", finch: "e7e4cf", pebble: "dce4dc",
};

function mascotImageUrl(name: ProfileMascot) {
  const background = MASCOT_BACKGROUNDS[name];
  return `https://api.dicebear.com/10.x/thumbs/svg?seed=kept-${name}&backgroundColor=${background}&radius=50`;
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
  return kind === "purchase" ? "Bought" : kind === "service" ? "Serviced" : kind === "opened" ? "Container opened" : kind === "finished" ? "Container finished" : "Use note";
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

function ManageMenu({ label, children }: { label: string; children: ReactNode }) {
  return <details className="manage-menu" onClick={(event) => { if ((event.target as HTMLElement).closest("button")) event.currentTarget.open = false; }}>
    <summary aria-label={`Manage ${label}`} title={`Manage ${label}`}>•••</summary>
    <div className="manage-menu-panel" role="group" aria-label={`${label} actions`}>{children}</div>
  </details>;
}

function consumableSummary(item: TrackedItem) {
  if (!item.consumable) return null;
  const open = item.consumable.currentOpenEventId ? item.events.find((entry) => entry.id === item.consumable?.currentOpenEventId) : undefined;
  const laterPurchases = purchases(item).filter((entry) => entry.createdAt > item.consumable!.trackingStartedAt);
  const laterOpens = item.events.filter((entry) => entry.kind === "opened" && entry.createdAt > item.consumable!.trackingStartedAt && entry.attributes?.baseline !== "true");
  const unopened = Math.max(0, item.consumable.unopenedAtStart + laterPurchases.reduce((sum, entry) => sum + (entry.quantity ?? 1), 0) - laterOpens.length);
  const pairs = item.events.filter((entry) => entry.kind === "finished").flatMap((finished) => {
    const id = finished.attributes?.containerId;
    const started = item.events.find((entry) => entry.kind === "opened" && entry.attributes?.containerId === id);
    if (!started?.date || !finished.date) return [];
    const days = Math.round((new Date(`${finished.date}T12:00:00`).getTime() - new Date(`${started.date}T12:00:00`).getTime()) / 86_400_000);
    return days > 0 ? [days] : [];
  });
  const averageDays = pairs.length ? Math.round(pairs.reduce((sum, days) => sum + days, 0) / pairs.length) : null;
  const openedDays = open?.date ? Math.max(0, Math.floor((Date.now() - new Date(`${open.date}T12:00:00`).getTime()) / 86_400_000)) : null;
  const remainingDays = averageDays === null ? null : open ? unopened * averageDays + Math.max(0, averageDays - (openedDays ?? 0)) : unopened * averageDays;
  return { open, unopened, averageDays, openedDays, remainingDays };
}

function matchesActivityRange(item: TrackedItem, preset: string, kind: string, customFrom: string, customTo: string) {
  if (preset === "any") return true;
  const today = new Date(); today.setHours(23, 59, 59, 999);
  const from = preset === "custom" ? (customFrom ? new Date(`${customFrom}T00:00:00`) : null) : new Date(today);
  if (from && preset === "30") from.setDate(from.getDate() - 30);
  if (from && preset === "90") from.setMonth(from.getMonth() - 3);
  if (from && preset === "365") from.setFullYear(from.getFullYear() - 1);
  const to = preset === "custom" && customTo ? new Date(`${customTo}T23:59:59`) : today;
  return item.events.some((event) => {
    if (!event.date || (kind !== "any" && event.kind !== kind)) return false;
    if (event.kind !== "purchase" && event.kind !== "service") return false;
    const date = new Date(`${event.date}T12:00:00`);
    return (!from || date >= from) && date <= to;
  });
}

export default function Home() {
  const [items, setItems] = useState<TrackedItem[]>([]);
  const supabaseConfigured = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [ready, setReady] = useState(!supabaseConfigured);
  const [routineLoaded, setRoutineLoaded] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [migrationItems, setMigrationItems] = useState<TrackedItem[] | null>(null);
  const [migrationRoutineData, setMigrationRoutineData] = useState<RoutineData | null>(null);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All things");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [facetFilters, setFacetFilters] = useState<Record<string, string[]>>({});
  const [timeFilter, setTimeFilter] = useState("any");
  const [timeKindFilter, setTimeKindFilter] = useState("any");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [view, setView] = useState<"library" | "services" | "calendar" | "routine">("library");
  const [routineData, setRoutineData] = useState<RoutineData>(EMPTY_ROUTINE_DATA);
  const [modal, setModal] = useState<"item" | "edit-item" | "event" | "variant" | null>(null);
  const [formError, setFormError] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
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
  const [addTrackConsumables, setAddTrackConsumables] = useState(false);
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
  const addProductPhotoInput = useRef<HTMLInputElement>(null);
  const lastSyncedItems = useRef<TrackedItem[]>([]);
  const lastSyncedRoutine = useRef<RoutineData>(EMPTY_ROUTINE_DATA);
  const syncQueue = useRef<Promise<void>>(Promise.resolve());
  const routineSyncQueue = useRef<Promise<void>>(Promise.resolve());
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
    // Desktop forms are inline in the library column, so keep the page visible
    // and scrollable. Only phone-sized sheets should lock the page underneath.
    const shouldBlockPage = isMobileLayout && (Boolean(modal) || profileOpen);
    if (shouldBlockPage) {
      document.body.classList.add("overlay-open");
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      return () => {
        document.body.classList.remove("overlay-open");
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        window.scrollTo({ top: scrollY, behavior: "instant" });
      };
    }
    document.body.classList.remove("overlay-open");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
  }, [modal, profileOpen, isMobileLayout]);

  useEffect(() => {
    if (!modal) {
      formReturnFocus.current?.focus({ preventScroll: true });
      formReturnFocus.current = null;
      return;
    }
    requestAnimationFrame(() => {
      if (isMobileLayout) {
        formCloseButton.current?.focus({ preventScroll: true });
        return;
      }
      const dialog = document.querySelector<HTMLElement>(".inline-form-card[role='dialog']");
      const firstField = dialog?.querySelector<HTMLElement>(".entry-form input:not(:disabled), .entry-form select:not(:disabled), .entry-form textarea:not(:disabled)");
      (firstField ?? formCloseButton.current)?.focus({ preventScroll: true });
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = document.querySelector<HTMLElement>(".inline-form-card[role='dialog']");
      if (!dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setModal(null);
        setFormError("");
        return;
      }
      if (event.key !== "Tab" || !isMobileLayout) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href]")].filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [modal, isMobileLayout]);

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
    if (!isMobileLayout || (view !== "library" && view !== "services") || selectedId) return;
    requestAnimationFrame(() => window.scrollTo({ top: libraryScroll.current, behavior: "instant" }));
  }, [isMobileLayout, selectedId, view]);

  useEffect(() => {
    if (!isMobileLayout || (view !== "library" && view !== "services") || !selectedId) return;
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
          const [cloudItems, cloudRoutine] = await Promise.all([loadTrackerItems(supabase, userId), loadRoutineData(supabase, userId)]);
          if (!active) return;
          let initialItems = cloudItems;
          const pendingKey = pendingItemsKey(userId);
          try {
            const rawPending = localStorage.getItem(pendingKey);
            if (rawPending) {
              const parsedPending: unknown = JSON.parse(rawPending);
              if (parsedPending && typeof parsedPending === "object" && "items" in parsedPending && validItems(parsedPending.items) && Array.isArray(parsedPending.deletedIds) && parsedPending.deletedIds.every((id: unknown) => typeof id === "string")) {
                initialItems = mergePendingItems(cloudItems, parsedPending as PendingItemSnapshot);
              }
            }
          } catch { /* Use the cloud copy when no recoverable local save exists. */ }
          lastSyncedItems.current = cloudItems;
          lastSyncedRoutine.current = cloudRoutine;
          setItems(initialItems);
          setRoutineData(cloudRoutine);
          setRoutineLoaded(true);
          setCloudReady(true);
          const decisionKey = `kept-import-asked-${userId}`;
          const saved = localStorage.getItem(STORAGE_KEY);
          const localItems: unknown = saved ? JSON.parse(saved) : [];
          const savedRoutine = localStorage.getItem(ROUTINE_STORAGE_KEY);
          const localRoutine: unknown = savedRoutine ? JSON.parse(savedRoutine) : EMPTY_ROUTINE_DATA;
          if (!localStorage.getItem(decisionKey)) {
            if (validItems(localItems) && localItems.length) setMigrationItems(localItems);
            if (validRoutineData(localRoutine) && (localRoutine.products.length || localRoutine.phases.length || localRoutine.concerns.length)) setMigrationRoutineData(localRoutine);
          }
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
        const savedRoutine = localStorage.getItem(ROUTINE_STORAGE_KEY);
        if (savedRoutine) {
          const parsedRoutine: unknown = JSON.parse(savedRoutine);
          if (validRoutineData(parsedRoutine)) setRoutineData(parsedRoutine);
        }
      } catch {
        setNotice("Your saved record could not be read. You can restore a backup to continue.");
      }
      setRoutineLoaded(true);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [supabaseConfigured]);

  useEffect(() => {
    if (!ready || !routineLoaded) return;
    if (!supabaseConfigured) {
      try { localStorage.setItem(ROUTINE_STORAGE_KEY, JSON.stringify(routineData)); }
      catch { window.setTimeout(() => setNotice("Routine could not be saved in this browser. Export a backup to keep your changes."), 0); }
      return;
    }
    if (!user || !cloudReady) return;
    if (JSON.stringify(lastSyncedRoutine.current) === JSON.stringify(routineData)) return;
    const previous = lastSyncedRoutine.current;
    const next = routineData;
    lastSyncedRoutine.current = next;
    const supabase = createClient();
    routineSyncQueue.current = routineSyncQueue.current.then(async () => {
      const normalized = await syncRoutineData(supabase, user.id, next);
      lastSyncedRoutine.current = normalized;
      setRoutineData((current) => JSON.stringify(current) === JSON.stringify(next) ? normalized : current);
    }).catch((error: unknown) => {
      lastSyncedRoutine.current = previous;
      setNotice(error instanceof Error ? `Could not save your routine: ${error.message}` : "Could not save your routine. Try again.");
    });
  }, [routineData, ready, routineLoaded, user, cloudReady, supabaseConfigured]);

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
    const pendingKey = pendingItemsKey(user.id);
    let deletedIds = new Set<string>();
    try {
      const existingRaw = localStorage.getItem(pendingKey);
      const existing = existingRaw ? JSON.parse(existingRaw) as Partial<PendingItemSnapshot> : null;
      if (Array.isArray(existing?.deletedIds)) existing.deletedIds.forEach((id) => { if (typeof id === "string") deletedIds.add(id); });
    } catch { /* Start a fresh pending snapshot. */ }
    previous.filter((item) => !next.some((entry) => entry.id === item.id)).forEach((item) => deletedIds.add(item.id));
    next.forEach((item) => deletedIds.delete(item.id));
    const pendingSnapshot: PendingItemSnapshot = { items: next, deletedIds: [...deletedIds] };
    try { localStorage.setItem(pendingKey, JSON.stringify(pendingSnapshot)); }
    catch { setNotice("Your account save is still syncing. Keep this page open until it finishes."); }
    syncQueue.current = syncQueue.current.then(async () => {
      const photoPaths = await syncTrackerItems(supabase, user.id, previous, next);
      lastSyncedItems.current = next.map((item) => photoPaths.has(item.id) ? { ...item, productPhotoPath: photoPaths.get(item.id) } : item);
      setItems((current) => current.map((item) => photoPaths.has(item.id) ? { ...item, productPhotoPath: photoPaths.get(item.id) } : item));
      try {
        const currentPending = localStorage.getItem(pendingKey);
        if (currentPending) {
          const parsed = JSON.parse(currentPending) as Partial<PendingItemSnapshot>;
          if (JSON.stringify(parsed.items) === JSON.stringify(next)) localStorage.removeItem(pendingKey);
        }
      } catch { /* The cloud save succeeded; an old recovery copy can safely remain. */ }
    }).catch((error: unknown) => {
      lastSyncedItems.current = previous;
      setNotice(error instanceof Error ? `Could not save to your account: ${error.message}` : "Could not save to your account. Try again.");
    });
  }, [items, ready, user, cloudReady, supabaseConfigured]);

  const productItems = useMemo(() => items.filter((item) => !isServiceType(item.itemType)), [items]);
  const serviceItems = useMemo(() => items.filter((item) => isServiceType(item.itemType)), [items]);
  const isServicesView = view === "services";
  const categories = useMemo(() => [...new Set((isServicesView ? serviceItems : productItems).filter((item) => Boolean(item.archivedAt) === archiveOpen).map((item) => item.category).filter((value): value is string => Boolean(value)))], [isServicesView, archiveOpen, productItems, serviceItems]);
  const filterFacets = useMemo(() => {
    const facets: Array<{ key: string; label: string; values: string[] }> = [];
    const addFacet = (key: string, label: string, values: string[]) => {
      const unique = [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      if (unique.length) facets.push({ key, label, values: unique });
    };
    const scopeItems = (isServicesView ? serviceItems : productItems).filter((item) => Boolean(item.archivedAt) === archiveOpen);
    addFacet("type", isServicesView ? "Service type" : "Product type", scopeItems.map((item) => item.itemType ?? ""));
    addFacet("brand", "Brand", scopeItems.map((item) => item.brand ?? ""));
    const detailKeys = [...new Set(scopeItems.flatMap((item) => Object.keys(item.specifications ?? {})))].slice(0, 12);
    for (const key of detailKeys) addFacet(`detail:${key}`, attributeLabel(key), scopeItems.flatMap((item) => (item.specifications?.[key] ?? "").split(key === "season" ? "|" : "\u0000")));
    return facets;
  }, [isServicesView, archiveOpen, productItems, serviceItems]);
  const activeFilterCount = Object.values(facetFilters).reduce((count, values) => count + values.length, 0) + (timeFilter !== "any" ? 1 : 0) + (category !== "All things" ? 1 : 0);
  function clearLibraryFilters() { setCategory("All things"); setFacetFilters({}); setTimeFilter("any"); setTimeKindFilter("any"); setCustomDateFrom(""); setCustomDateTo(""); }
  const visibleItems = useMemo(() => items
    .filter((item) => isServicesView ? isServiceType(item.itemType) : !isServiceType(item.itemType))
    .filter((item) => Boolean(item.archivedAt) === archiveOpen)
    .filter((item) => category === "All things" || item.category === category)
    .filter((item) => `${item.name} ${item.brand ?? ""} ${item.relatedGroup ?? ""} ${item.category ?? ""} ${item.itemType ?? ""} ${item.note ?? ""}`.toLowerCase().includes(search.toLowerCase()))
    .filter((item) => Object.entries(facetFilters).every(([key, values]) => !values.length || (key === "category" ? values.includes(item.category ?? "") : key === "type" ? values.includes(item.itemType ?? "") : key === "brand" ? values.includes(item.brand ?? "") : (item.specifications?.[key.slice(7)] ?? "").split(key === "detail:season" ? "|" : "\u0000").some((value) => values.includes(value.trim())))))
    .filter((item) => matchesActivityRange(item, timeFilter, timeKindFilter, customDateFrom, customDateTo))
    .sort((a, b) => a.name.localeCompare(b.name)), [items, category, isServicesView, archiveOpen, search, facetFilters, timeFilter, timeKindFilter, customDateFrom, customDateTo]);
  const selectedItem = visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;
  const editingItem = editingItemId ? items.find((item) => item.id === editingItemId) ?? null : null;
  const selectedItemImage = selectedItem ? selectedItem.productPhoto || selectedItem.currentProduct?.imageUrl || fallbackItemImage(selectedItem) : undefined;
  const addAttributeFields = detailFields(addCategory, addItemType);
  const inferredAddCategory = categoryForItemType(addItemType);
  const addIsService = isServiceType(addItemType) || view === "services";
  const addPreviewImage = addPhotoData || addPhotoUrl || addImageUrl || fallbackItemImage({ name: addName, category: addCategory, itemType: addItemType });
  const repeatItem = items.find((item) => item.id === repeatItemId) ?? null;
  const repeatLastEvent = repeatItem ? lastOfKind(repeatItem, isServiceType(repeatItem.itemType) ? "service" : "purchase") : undefined;
  const repeatCandidates = items.filter((item) => `${item.name} ${item.brand ?? ""} ${item.category ?? ""} ${item.itemType ?? ""}`.toLowerCase().includes(repeatSearch.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const relatedGroupSuggestions = [...new Set(items.map((item) => item.relatedGroup?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));
  const selectedPurchaseFields = selectedItem ? detailFields(selectedItem.category, selectedItem.itemType).purchase : [];
  const selectedPurchases = selectedItem ? purchases(selectedItem).sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt)) : [];
  const selectedConsumable = selectedItem ? consumableSummary(selectedItem) : null;
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
    setEditingItemId(null);
    formReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAddMode("new"); setRepeatItemId(""); setRepeatSearch("");
    setAddCategory(view === "services" ? "Grooming" : ""); setAddItemType(view === "services" ? "Haircut" : ""); setAddTrackConsumables(false); setAddSpecifications({}); setAddCustomFields([]); setAddPurchaseAttributes({});
    setAddName(""); setAddNameTouched(false); setAddBrand(""); setAddRelatedGroup(""); setAddProductUrl(""); setAddStoreName(""); setAddStoreEdited(false);
    setAddPreview(null); setAddPreviewStatus("idle"); setAddImageUrl("");
    setAddPhotoFile(null); setAddPhotoUrl(""); setAddPhotoData(""); setAddPhotoZoom(1); setAddPhotoOffsetX(0); setAddPhotoOffsetY(0);
    setFormError(""); setModal("item");
  }

  function openEditItem(item: TrackedItem) {
    formReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditingItemId(item.id); setAddMode("new"); setRepeatItemId(""); setRepeatSearch("");
    setAddName(item.name); setAddNameTouched(true); setAddCategory(item.category ?? ""); setAddItemType(item.itemType ?? ""); setAddTrackConsumables(Boolean(item.consumable));
    setAddBrand(item.brand ?? ""); setAddRelatedGroup(item.relatedGroup ?? ""); setAddSpecifications(item.specifications ?? {}); setAddCustomFields([]); setAddPurchaseAttributes({});
    setAddProductUrl(item.productUrl ?? ""); setAddStoreName(item.storeName ?? ""); setAddStoreEdited(false); setAddPreview(null); setAddPreviewStatus("idle"); setAddImageUrl(item.currentProduct?.imageUrl ?? "");
    setAddPhotoFile(null); setAddPhotoData(item.productPhoto?.startsWith("data:image/") ? item.productPhoto : ""); setAddPhotoUrl(""); setAddPhotoZoom(1); setAddPhotoOffsetX(0); setAddPhotoOffsetY(0);
    setFormError(""); setModal("edit-item");
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
    setView(items.find((item) => item.id === id && isServiceType(item.itemType)) ? "services" : "library");
  }

  function openEventForm(kind: EventKind, entry?: ItemEvent) {
    formReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openEvent(kind, entry);
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
      const service = isServiceType(repeatItem.itemType);
      const date = String(data.get("date") ?? "") || (service ? localDateString() : "");
      const amountValue = String(data.get("amount") ?? "").trim();
      const amount = amountValue ? Number(amountValue) : undefined;
      if (amountValue && (!Number.isFinite(amount) || (amount ?? -1) < 0)) {
        setFormError("Enter a valid amount paid, or leave it blank.");
        return;
      }
      const quantityValue = String(data.get("repeat_quantity") ?? "1").trim();
      const parsedQuantity = Number(quantityValue || 1);
      if (!service && (!Number.isInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 10000)) {
        setFormError("Enter a quantity from 1 to 10,000.");
        return;
      }
      const quantity = service || repeatItem.category === "Clothes" ? 1 : parsedQuantity;
      const attributes = Object.fromEntries((service ? [] : detailFields(repeatItem.category, repeatItem.itemType).purchase)
        .map((field) => [field.key, String(data.get(`repeat-attribute-${field.key}`) ?? "").trim()] as const)
        .filter(([, value]) => Boolean(value)));
      const variant = service ? "" : String(data.get("repeat_variant") ?? "").trim();
      const note = String(data.get("note") ?? "").trim();
      const now = new Date().toISOString();
      const log: ItemEvent = {
        id: makeId(), kind: service ? "service" : "purchase", date: date || undefined, amount,
        currency: amount !== undefined ? String(data.get("currency") || "INR") : undefined,
        quantity: !service && quantity !== 1 ? quantity : undefined, variant: variant || undefined,
        attributes: Object.keys(attributes).length ? attributes : undefined, note: note || undefined, createdAt: now,
      };
      setItems((current) => current.map((item) => item.id === repeatItem.id ? { ...item, events: [...item.events, log] } : item));
      setSelectedId(repeatItem.id);
      setView(service ? "services" : "library");
      setCategory("All things"); setSearch(""); setModal(null); setFormError("");
      announce(`${service ? "Service logged for" : "Purchase added to"} ${repeatItem.name}.`);
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
    const itemTypeValue = addItemType.trim();
    const service = isServiceType(itemTypeValue);
    const categoryValue = String(data.get("category") ?? "").trim() || categoryForItemType(itemTypeValue) || "";
    const note = String(data.get("note") ?? "").trim();
    const productUrl = service ? "" : String(data.get("productUrl") ?? "").trim();
    if (productUrl) {
      try {
        const url = new URL(productUrl);
        if (url.protocol !== "https:" || url.username || url.password) throw new Error("invalid URL");
      } catch {
        setFormError("Add a full product link starting with https://.");
        return;
      }
    }
    const date = String(data.get("date") ?? "") || (service ? localDateString() : "");
    const amountString = String(data.get("amount") ?? "").trim();
    const amount = amountString ? Number(amountString) : undefined;
    const currency = String(data.get("currency") || "INR");
    const firstQuantityValue = String(data.get("quantity") ?? "1").trim();
    const firstQuantity = Number(firstQuantityValue || 1);
    if (amountString && (!Number.isFinite(amount) || (amount ?? -1) < 0)) {
      setFormError("Enter a valid amount paid, or leave it blank.");
      return;
    }
    if (!service && categoryValue !== "Clothes" && (!Number.isInteger(firstQuantity) || firstQuantity < 1 || firstQuantity > 10000)) {
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
      ...(service && String(data.get("repeatInterval") ?? "").trim() ? [["repeat_interval", String(data.get("repeatInterval")).trim()] as const] : []),
    ].filter(([key, value]) => key.trim() && value.trim()));
    const purchaseAttributes = Object.fromEntries([
      ...Object.entries(addPurchaseAttributes),
    ].filter(([key, value]) => key.trim() && value.trim()));
    const trackConsumables = !service && isConsumableType(categoryValue, itemTypeValue) && data.get("trackConsumables") === "on";
    let events: ItemEvent[] = editingItem?.events ?? (date || amount !== undefined || !service && firstQuantity > 1 || Object.values(purchaseAttributes).some(Boolean) ? [{ id: makeId(), kind: service ? "service" as const : "purchase" as const, date: date || undefined, amount, currency: amount !== undefined ? currency : undefined, quantity: !service && categoryValue !== "Clothes" && firstQuantity > 1 ? firstQuantity : undefined, attributes: !service && Object.keys(purchaseAttributes).length ? purchaseAttributes : undefined, note: service ? note || undefined : undefined, createdAt: now }] : []);
    let consumable = editingItem?.consumable;
    if (trackConsumables && !consumable) {
      const openedDate = String(data.get("openedDate") || date || now.slice(0, 10));
      const unopenedAtStart = Number(String(data.get("unopenedCount") || "0"));
      if (!Number.isInteger(unopenedAtStart) || unopenedAtStart < 0 || unopenedAtStart > 10000) {
        setFormError("Enter a valid number of unopened containers.");
        return;
      }
      const openedId = makeId();
      events = [...events, { id: openedId, kind: "opened", date: openedDate, attributes: { containerId: openedId, baseline: "true" }, createdAt: now }];
      consumable = { trackingStartedAt: now, unopenedAtStart, currentOpenEventId: openedId };
    } else if (!trackConsumables) consumable = undefined;
    const item: TrackedItem = {
      ...(editingItem ?? {}),
      id: editingItem?.id ?? makeId(), name, category: categoryValue || undefined, itemType: itemTypeValue || undefined,
      brand: addBrand.trim() || undefined, relatedGroup: addRelatedGroup.trim() || undefined,
      specifications: Object.keys(specifications).length ? specifications : undefined,
      note: note || undefined, productUrl: productUrl || undefined,
      productPhoto: addPhotoData || editingItem?.productPhoto || undefined,
      storeName: !service ? addStoreName.trim() || detectRetailer(productUrl)?.name || undefined : undefined,
      currentProduct: !service ? addPreview ? { ...editingItem?.currentProduct, title: addPreview.title || addName.trim() || name, imageUrl: addImageUrl || undefined, fetchedAt: addPreview.fetchedAt, source: addPreview.source, productId: addPreview.productId, variant: addPreview.variant, availability: addPreview.availability } : (addImageUrl ? { ...editingItem?.currentProduct, title: editingItem?.currentProduct?.title || name, imageUrl: addImageUrl } : editingItem?.currentProduct) : undefined,
      consumable, createdAt: now, events,
    };
    if (editingItem) setItems((current) => current.map((entry) => entry.id === editingItem.id ? { ...item, id: editingItem.id, createdAt: editingItem.createdAt, events, variants: editingItem.variants, priceHistory: editingItem.priceHistory, archivedAt: editingItem.archivedAt, productPhotoPath: editingItem.productPhotoPath } : entry));
    else setItems((current) => [...current, item]);
    setSelectedId(item.id);
    setCategory("All things");
    setView(service ? "services" : "library");
    setSearch("");
    setModal(null);
    setFormError("");
    setAddName(""); setAddNameTouched(false); setAddCategory(""); setAddItemType(""); setAddBrand(""); setAddRelatedGroup(""); setAddSpecifications({}); setAddCustomFields([]); setAddPurchaseAttributes({}); setAddProductUrl(""); setAddStoreName(""); setAddStoreEdited(false); setAddPreview(null); setAddPreviewStatus("idle"); setAddImageUrl(""); setAddPhotoFile(null); setAddPhotoData(""); setAddPhotoUrl("");
    event.currentTarget.reset();
    setEditingItemId(null);
    announce(editingItem ? `${name} details updated.` : `${name} added to your things.`);
  }

  function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItem) return;
    const data = new FormData(event.currentTarget);
    const date = String(data.get("date") ?? "") || (eventKind === "service" ? localDateString() : "");
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
    const oldEvent = editingEventId ? selectedItem.events.find((entry) => entry.id === editingEventId) : undefined;
    const attributes = eventKind === "purchase" || eventKind === "service" ? Object.fromEntries([
      ...(eventKind === "purchase" ? selectedPurchaseFields.map((field) => [field.key, String(data.get(`purchase-attribute-${field.key}`) ?? "").trim()] as const) : []),
      ...eventCustomFields.map((field) => [field.label.trim(), field.value.trim()] as const),
    ].filter(([key, value]) => key.trim() && value.trim())) : oldEvent?.attributes ?? {};
    const now = oldEvent?.createdAt ?? new Date().toISOString();
    const log = {
      id: editingEventId ?? makeId(), kind: eventKind, date: date || undefined, amount,
      currency: amount !== undefined ? String(data.get("currency") || "INR") : undefined,
      quantity: quantity !== 1 ? quantity : undefined,
      variant: variant || undefined,
      attributes: Object.keys(attributes).length ? attributes : undefined,
      note: note || undefined,
      feeling: eventKind === "use" && feeling ? feeling as "loved" | "okay" | "regret" : undefined,
      createdAt: now,
    } as const;
    setItems((current) => current.map((item) => item.id !== selectedItem.id ? item : { ...item, events: editingEventId ? item.events.map((entry) => entry.id === editingEventId ? log : entry) : [...item.events, log] }));
    setModal(null);
    setEditingEventId(null);
    event.currentTarget.reset();
    announce(editingEventId ? `${labelForKind(eventKind)} entry updated.` : `${labelForKind(eventKind)} update added.`);
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

  function openEvent(kind: EventKind, entry?: ItemEvent) {
    setFormError("");
    setEditingEventId(entry?.id ?? null);
    setEventKind(entry?.kind ?? kind);
    const builtIn = new Set(selectedItem ? detailFields(selectedItem.category, selectedItem.itemType).purchase.map((field) => field.key) : []);
    setEventCustomFields(entry ? Object.entries(entry.attributes ?? {}).filter(([key]) => !builtIn.has(key)).map(([label, value]) => ({ id: makeId(), label, value })) : []);
    setModal("event");
  }

  function removeItem(item: TrackedItem) {
    if (!window.confirm(`Remove “${item.name}” and its history? This cannot be undone.`)) return;
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    if (selectedId === item.id) setSelectedId(null);
    announce(`${item.name} removed.`);
  }

  function archiveItem(item: TrackedItem) {
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, archivedAt: new Date().toISOString() } : entry));
    setArchiveOpen(false);
    if (selectedId === item.id) setSelectedId(null);
    announce(item.name + " moved to Archive.");
  }

  function restoreItem(item: TrackedItem) {
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, archivedAt: undefined } : entry));
    setArchiveOpen(false);
    announce(item.name + " restored to your active list.");
  }

  function finishConsumable(item: TrackedItem) {
    const tracking = item.consumable;
    if (!tracking?.currentOpenEventId) return;
    const start = item.events.find((entry) => entry.id === tracking.currentOpenEventId);
    const containerId = start?.attributes?.containerId ?? tracking.currentOpenEventId;
    const now = new Date().toISOString();
    const finished: ItemEvent = { id: makeId(), kind: "finished", date: now.slice(0, 10), attributes: { containerId }, createdAt: now };
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, consumable: { ...tracking, currentOpenEventId: undefined }, events: [...entry.events, finished] } : entry));
    announce(item.name + " container marked finished.");
  }

  function openNextConsumable(item: TrackedItem) {
    const summary = consumableSummary(item);
    if (!item.consumable || item.consumable.currentOpenEventId || !summary || summary.unopened < 1) return;
    const now = new Date().toISOString();
    const id = makeId();
    const opened: ItemEvent = { id, kind: "opened", date: now.slice(0, 10), attributes: { containerId: id }, createdAt: now };
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, consumable: { ...item.consumable!, currentOpenEventId: id }, events: [...entry.events, opened] } : entry));
    announce("New " + item.name + " container opened.");
  }

  function removeEvent(id: string) {
    if (!selectedItem || !window.confirm("Remove this timeline entry?")) return;
    const target = selectedItem.events.find((entry) => entry.id === id);
    const containerId = target?.attributes?.containerId;
    const pairedOpen = target?.kind === "finished" ? selectedItem.events.find((entry) => entry.kind === "opened" && entry.attributes?.containerId === containerId) : undefined;
    const pairedFinish = target?.kind === "opened" ? selectedItem.events.find((entry) => entry.kind === "finished" && entry.attributes?.containerId === containerId) : undefined;
    setItems((current) => current.map((item) => {
      if (item.id !== selectedItem.id) return item;
      let consumable = item.consumable;
      if (target?.kind === "opened" && consumable?.currentOpenEventId === id) consumable = { ...consumable, currentOpenEventId: undefined };
      if (target?.kind === "finished" && pairedOpen && consumable) consumable = { ...consumable, currentOpenEventId: pairedOpen.id };
      return { ...item, consumable, events: item.events.filter((entry) => entry.id !== id && entry.id !== pairedFinish?.id) };
    }));
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
    const backupProducts = await Promise.all(routineData.products.map(async (product) => {
      if (!product.photo || product.photo.startsWith("data:image/")) return { ...product, photoPath: undefined };
      try {
        const response = await fetch(product.photo);
        if (!response.ok) return { ...product, photo: undefined, photoPath: undefined };
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
        return { ...product, photo: dataUrl, photoPath: undefined };
      } catch { return { ...product, photo: undefined, photoPath: undefined }; }
    }));
    const backup: BackupFile = { format: "kept-backup", version: 1, exportedAt: new Date().toISOString(), items: backupItems, routine: { ...routineData, products: backupProducts } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `kept-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce("Your backup has been downloaded.");
  }

  async function importLocalRecords() {
    if (!user || (!migrationItems && !migrationRoutineData) || migrationBusy) return;
    setMigrationBusy(true);
    try {
      const existingIds = new Set(items.map((item) => item.id));
      const localItems = migrationItems ?? [];
      const additions = localItems.filter((item) => !existingIds.has(item.id));
      const toImport = makeCloudCompatibleItems(additions);
      const idMap = new Map(additions.map((item, index) => [item.id, toImport[index]?.id ?? item.id]));
      const photoPaths = await importTrackerItems(createClient(), user.id, toImport);
      const merged = [...items, ...toImport.map((item) => ({ ...item, productPhotoPath: photoPaths.get(item.id) }))];
      const localRoutine = migrationRoutineData ?? EMPTY_ROUTINE_DATA;
      const mappedProducts = localRoutine.products.map((product) => ({ ...product, linkedItemId: product.linkedItemId ? idMap.get(product.linkedItemId) ?? product.linkedItemId : undefined }));
      const importedRoutine: RoutineData = {
        products: [...routineData.products, ...mappedProducts.filter((product) => !routineData.products.some((current) => current.id === product.id))],
        phases: [...routineData.phases, ...localRoutine.phases.filter((phase) => !routineData.phases.some((current) => current.id === phase.id))],
        concerns: [...routineData.concerns, ...localRoutine.concerns.filter((concern) => !routineData.concerns.some((current) => current.id === concern.id))],
      };
      const normalizedRoutine = await syncRoutineData(createClient(), user.id, importedRoutine);
      lastSyncedItems.current = merged;
      lastSyncedRoutine.current = normalizedRoutine;
      setItems(merged);
      setRoutineData(normalizedRoutine);
      localStorage.setItem(`kept-import-asked-${user.id}`, "done");
      setMigrationItems(null);
      setMigrationRoutineData(null);
      setSelectedId(toImport[0]?.id ?? items[0]?.id ?? null);
      announce(toImport.length ? `${toImport.length} local record${toImport.length === 1 ? "" : "s"} added to your account.` : "Those records are already in your account.");
    } catch (error) {
      announce(error instanceof Error ? `Import stopped. Your browser copy is safe. ${error.message}` : "Import stopped. Your browser copy is safe; try again.");
    } finally { setMigrationBusy(false); }
  }

  function deferLocalImport() {
    if (user) localStorage.setItem(`kept-import-asked-${user.id}`, "done");
    setMigrationItems(null);
    setMigrationRoutineData(null);
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
      if (parsed.format !== "kept-backup" || parsed.version !== 1 || !validItems(parsed.items) || (parsed.routine !== undefined && !validRoutineData(parsed.routine))) throw new Error("invalid backup");
      if (!window.confirm(`Restore ${parsed.items.length} item${parsed.items.length === 1 ? "" : "s"}? This replaces the records ${user ? "in your account" : "in this browser"}.`)) return;
      const restored = user ? makeCloudCompatibleItems(parsed.items) : parsed.items;
      const restoredIdMap = new Map(parsed.items.map((item, index) => [item.id, restored[index]?.id ?? item.id]));
      setItems(restored);
      const restoredRoutine = parsed.routine && validRoutineData(parsed.routine) ? parsed.routine : EMPTY_ROUTINE_DATA;
      setRoutineData(user ? { ...restoredRoutine, products: restoredRoutine.products.map((product) => ({ ...product, linkedItemId: product.linkedItemId ? restoredIdMap.get(product.linkedItemId) ?? product.linkedItemId : undefined })) } : restoredRoutine);
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

  const itemForm = modal === "item" || modal === "edit-item" ? <section className="inline-form-card" role="dialog" aria-modal={isMobileLayout} aria-labelledby="add-title">
    <div className="dialog-top"><div><p className="eyebrow">YOUR PERSONAL LEDGER</p><h2 id="add-title">{editingItem ? "Edit details" : "Add a thing"}<span className="period">.</span></h2></div><button ref={formCloseButton} className="icon-button" onClick={() => { setModal(null); setFormError(""); setEditingItemId(null); }} aria-label="Close add item form"><Icon name="close" /></button></div>
    <div className="add-mode-switch" role="group" aria-label="What would you like to add?"><button type="button" className={addMode === "new" ? "active" : ""} aria-pressed={addMode === "new"} onClick={() => { setAddMode("new"); setFormError(""); }}>New product or service</button><button type="button" className={addMode === "repeat" ? "active" : ""} aria-pressed={addMode === "repeat"} onClick={() => { setAddMode("repeat"); setFormError(""); }}>{repeatItem && isServiceType(repeatItem.itemType) ? "Log service again" : "Bought again"}</button></div>
    {formError ? <p className="form-error" id="item-form-error" role="alert">{formError}</p> : null}
    <form onSubmit={saveItem} className="entry-form add-item-form" autoComplete="off" noValidate>
      {addMode === "new" ? <>
        <label className="field"><span>{addIsService ? "Service name" : "Product name"} <b>REQUIRED</b></span><input ref={nameInput} name="name" value={addName} maxLength={80} autoFocus={!isMobileLayout} autoCorrect="off" autoCapitalize="sentences" placeholder={addIsService ? "e.g. Haircut" : "e.g. Salicylic face wash"} aria-required="true" aria-invalid={formError === "Please add a name before saving."} aria-describedby={formError === "Please add a name before saving." ? "item-form-error" : undefined} onChange={(event) => { setAddName(event.target.value); setAddNameTouched(true); setFormError(""); }} /></label>
        <label className="field"><span>{addIsService ? "Service type" : "Product type"} <b>OPTIONAL</b></span><input value={addItemType} onChange={(event) => { setAddItemType(event.target.value); setAddCategory(categoryForItemType(event.target.value) ?? ""); setAddTrackConsumables(isConsumableType(categoryForItemType(event.target.value), event.target.value)); }} list="item-type-options" maxLength={100} placeholder={addIsService ? "e.g. Haircut" : "e.g. Jeans, sunscreen"} /><datalist id="item-type-options">{[...new Set([...Object.values(ITEM_TYPES).flat(), "Haircut", "Bike service", "Vehicle service"])].map((type) => <option key={type} value={type} />)}</datalist>{inferredAddCategory ? <small className="field-hint">Suggested category: {inferredAddCategory}</small> : null}</label>
        {addAttributeFields.item.length ? <div className="attribute-fields" aria-label="Suggested product details">{addAttributeFields.item.map((field) => field.key === "season" ? <fieldset className="field season-field" key={field.key}><legend>{field.label} <b>OPTIONAL</b></legend><div className="season-options">{["All-season", "Summer", "Monsoon", "Winter"].map((season) => { const selected = (addSpecifications.season ?? "").split("|").filter(Boolean); return <label key={season}><input type="checkbox" checked={selected.includes(season)} onChange={(event) => setAddSpecifications((current) => { const previous = (current.season ?? "").split("|").filter(Boolean); const next = season === "All-season" ? event.target.checked ? [season] : [] : event.target.checked ? [...previous.filter((value) => value !== "All-season"), season] : previous.filter((value) => value !== season); return { ...current, season: next.join("|") }; })} /> {season}</label>; })}</div></fieldset> : <label className="field" key={field.key}><span>{field.label} <b>OPTIONAL</b></span><input maxLength={160} value={addSpecifications[field.key] ?? ""} placeholder={field.placeholder} onChange={(event) => setAddSpecifications((current) => ({ ...current, [field.key]: event.target.value }))} /></label>)}</div> : null}
        <details className="more-item-details"><summary>More details <span>{addIsService ? "Optional service notes" : "Category and optional information"}</span></summary><div className="more-item-content">{!addIsService ? <><label className="field"><span>Category</span><select name="category" value={addCategory} onChange={(event) => setAddCategory(event.target.value)}><option value="">Choose if useful</option>{CATEGORIES.map((option) => <option key={option}>{option}</option>)}</select></label><div className="field-pair"><label className="field"><span>Brand <b>OPTIONAL</b></span><input value={addBrand} onChange={(event) => setAddBrand(event.target.value)} maxLength={100} placeholder="e.g. Minimalist" /></label><label className="field"><span>Related products <b>OPTIONAL</b></span><input value={addRelatedGroup} onChange={(event) => setAddRelatedGroup(event.target.value)} list="related-group-options" maxLength={100} placeholder="e.g. Sunscreen" /><datalist id="related-group-options">{relatedGroupSuggestions.map((group) => <option key={group} value={group} />)}</datalist></label></div></> : null}{!addIsService && isConsumableType(addCategory, addItemType) ? <section className="consumable-setup"><label className="checkbox-row"><input type="checkbox" name="trackConsumables" checked={addTrackConsumables} onChange={(event) => setAddTrackConsumables(event.target.checked)} /><span>Track opened containers and restock timing</span></label>{addTrackConsumables ? editingItem?.consumable ? <p className="field-hint">Tracking is active. Manage opened and finished containers from the product details.</p> : <div className="field-pair"><label className="field"><span>Current container opened</span><input type="date" name="openedDate" defaultValue={new Date().toLocaleDateString("en-CA")} /></label><label className="field"><span>Unopened containers</span><input type="number" name="unopenedCount" min="0" max="10000" step="1" inputMode="numeric" defaultValue="0" /></label></div> : null}</section> : null}<div className="custom-fields-block">{addCustomFields.map((field) => <div className="custom-attribute-row" key={field.id}><label className="field"><span>Detail name</span><input maxLength={60} value={field.label} placeholder="e.g. Fabric" onChange={(event) => setAddCustomFields((current) => current.map((entry) => entry.id === field.id ? { ...entry, label: event.target.value } : entry))} /></label><label className="field"><span>Value</span><input maxLength={160} value={field.value} placeholder="Add a detail" onChange={(event) => setAddCustomFields((current) => current.map((entry) => entry.id === field.id ? { ...entry, value: event.target.value } : entry))} /></label><button className="text-button remove-custom-field" type="button" onClick={() => setAddCustomFields((current) => current.filter((entry) => entry.id !== field.id))} aria-label="Remove custom detail">Remove</button></div>)}<button className="text-button add-custom-field" type="button" disabled={addCustomFields.length >= 20} onClick={() => setAddCustomFields((current) => [...current, { id: makeId(), label: "", value: "" }])}>＋ Add a detail</button></div></div></details>
        {!addIsService ? <section className="add-photo-editor" aria-label="Product photo">
          <div className="add-photo-editor-heading"><strong>Product photo</strong><span>{addPhotoData ? "Ready to save" : addPhotoFile ? "Adjust the crop" : "Optional"}</span></div>
          <div className="add-photo-editor-content">{addPreviewImage ? <img src={addPreviewImage} alt={`${addName || "Product"} photo preview`} style={addPhotoFile && !addPhotoData ? { objectPosition: `${50 + addPhotoOffsetX / 2}% ${50 + addPhotoOffsetY / 2}%`, transform: `scale(${addPhotoZoom})` } : undefined} referrerPolicy="no-referrer" /> : <div className="add-preview-placeholder" aria-hidden="true">{addName.trim().charAt(0).toUpperCase() || "＋"}</div>}<div><button className="button button-outline" type="button" onClick={() => addProductPhotoInput.current?.click()}><Icon name="upload" size={15} />{addPhotoFile || addPhotoData ? "Choose another photo" : "Upload a photo"}</button><input ref={addProductPhotoInput} className="visually-hidden" type="file" accept="image/*" onChange={chooseAddPhoto} aria-label="Upload a product photo" />{addPhotoFile ? <><label className="crop-control"><span>Zoom</span><input type="range" min="1" max="2.8" step="0.01" value={addPhotoZoom} onChange={(event) => setAddPhotoZoom(Number(event.target.value))} /></label><label className="crop-control"><span>Horizontal</span><input type="range" min="-100" max="100" step="1" value={addPhotoOffsetX} onChange={(event) => setAddPhotoOffsetX(Number(event.target.value))} /></label><label className="crop-control"><span>Vertical</span><input type="range" min="-100" max="100" step="1" value={addPhotoOffsetY} onChange={(event) => setAddPhotoOffsetY(Number(event.target.value))} /></label><button className="text-button" type="button" onClick={cropAddPhoto}>{addPhotoData ? "Update crop" : "Use this crop"}</button></> : null}</div></div>
        </section> : null}
        {!addIsService ? <details className="more-item-details"><summary>Product link <span>Find a title or photo from a shop page</span></summary><div className="shop-link-block">
          <label className="field"><span>Product link <b>OPTIONAL</b></span><input name="productUrl" type="url" value={addProductUrl} maxLength={2048} placeholder="Paste a product page link" aria-invalid={formError.startsWith("Add a full product link")} onChange={(event) => { changeAddProductUrl(event.target.value); setFormError(""); }} /><small className="field-hint">Some shops block automatic reads. You can still save your own photo.</small></label>
          <label className="field"><span>Shop</span><input value={addStoreName} onChange={(event) => { setAddStoreName(event.target.value); setAddStoreEdited(true); }} list="retailer-options" placeholder="Shop name" /><datalist id="retailer-options">{RETAILERS.map((retailer) => <option key={retailer.name} value={retailer.name}>{retailer.group}</option>)}</datalist></label>
          <button className="button button-outline preview-product-button" type="button" onClick={previewAddProduct} disabled={!addProductUrl || addPreviewStatus === "loading"}><Icon name="refresh" size={15} />{addPreviewStatus === "loading" ? "Checking product…" : "Find product details"}</button>
          {addPreviewStatus === "error" ? <p className="product-status product-error" role="status">This page couldn’t be read. Add the name and photo yourself.</p> : null}
          {addPreview ? <p className="product-status" role="status">{addPreview.title ? `Found: ${addPreview.title}` : "Product page checked."} You can edit the details above.</p> : null}
          <label className="field"><span>Photo link <b>OPTIONAL</b></span><input type="url" value={addImageUrl} onChange={(event) => setAddImageUrl(event.target.value)} placeholder="https://…" /></label>
        </div></details> : null}
        {!editingItem ? <><div className="form-subheading"><span>{addIsService ? "FIRST SERVICE" : "FIRST PURCHASE"}</span><span>OPTIONAL</span></div>
        <div className="field-pair"><label className="field"><span>{addIsService ? "Date of service" : "Date"}</span><input type="date" name="date" max={localDateString()} defaultValue={addIsService ? localDateString() : ""} /></label><label className="field"><span>{addIsService ? "Service cost" : "Total you paid"}</span><div className="price-input"><input name="amount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="—" /><select name="currency" aria-label="Currency" defaultValue="INR">{CURRENCIES.map((value) => <option key={value}>{value}</option>)}</select></div></label></div>
        {addIsService ? <label className="field"><span>Repeat interval <b>OPTIONAL</b></span><input value={addSpecifications.repeat_interval ?? ""} onChange={(event) => setAddSpecifications((current) => ({ ...current, repeat_interval: event.target.value }))} maxLength={80} placeholder="e.g. every 8–10 weeks" /></label> : null}
        {!addIsService && addCategory !== "Clothes" ? <label className="field"><span>Quantity</span><input name="quantity" type="number" min="1" max="10000" step="1" inputMode="numeric" defaultValue="1" /></label> : null}
        {!addIsService && addAttributeFields.purchase.length ? <div className="attribute-fields purchase-attribute-fields">{addAttributeFields.purchase.map((field) => <label className="field" key={field.key}><span>{field.label} <b>OPTIONAL</b></span><input maxLength={120} value={addPurchaseAttributes[field.key] ?? ""} placeholder={field.placeholder} onChange={(event) => setAddPurchaseAttributes((current) => ({ ...current, [field.key]: event.target.value }))} /></label>)}</div> : null}</> : null}
        <label className="field"><span>{addIsService ? "Note about this service" : "Note"} <b>OPTIONAL</b></span><textarea name="note" rows={2} maxLength={240} defaultValue={editingItem?.note ?? ""} placeholder={addIsService ? "Anything to remember for next time…" : "Anything useful to remember…"} /></label>
      </> : <>
        <p className="dialog-intro">Choose the same product to continue its history and reuse its photo.</p>
        <label className="field"><span>{repeatItem && isServiceType(repeatItem.itemType) ? "Find a service" : "Find a product or service"}</span><input value={repeatSearch} onChange={(event) => { setRepeatSearch(event.target.value); setRepeatItemId(""); }} placeholder="Search name or brand" autoComplete="off" /></label>
        {repeatItem ? <div className="repeat-selected-card">{repeatItem.productPhoto || repeatItem.currentProduct?.imageUrl || fallbackItemImage(repeatItem) ? <img src={repeatItem.productPhoto || repeatItem.currentProduct?.imageUrl || fallbackItemImage(repeatItem)} alt="" referrerPolicy="no-referrer" /> : <span className="add-preview-placeholder" aria-hidden="true">{repeatItem.name.charAt(0).toUpperCase()}</span>}<span><strong>{repeatItem.name}</strong><small>{[repeatItem.brand, repeatItem.itemType, repeatItem.relatedGroup].filter(Boolean).join(" · ")}</small>{repeatLastEvent ? <small>Last {isServiceType(repeatItem.itemType) ? "service" : "paid"}: {formatDate(repeatLastEvent.date)}{repeatLastEvent.amount !== undefined ? ` · ${formatMoney(repeatLastEvent.amount, repeatLastEvent.currency)}` : ""}</small> : <small>{isServiceType(repeatItem.itemType) ? "No service recorded yet" : "No purchase recorded yet"}</small>}</span><button type="button" className="text-button" onClick={() => { setRepeatItemId(""); setRepeatSearch(""); }}>Change</button></div> : <div className="repeat-item-picker" role="listbox" aria-label="Saved products">{repeatCandidates.map((item) => { const photo = item.productPhoto || item.currentProduct?.imageUrl || fallbackItemImage(item); const service = isServiceType(item.itemType); const last = lastOfKind(item, service ? "service" : "purchase"); return <button type="button" role="option" aria-selected={repeatItemId === item.id} className="repeat-item-option" key={item.id} onClick={() => { setRepeatItemId(item.id); setRepeatSearch(item.name); setFormError(""); }}><span className="repeat-item-photo">{photo ? <img src={photo} alt="" referrerPolicy="no-referrer" /> : <i>{item.name.charAt(0).toUpperCase()}</i>}</span><span><strong>{item.name}</strong><small>{[item.brand, item.itemType].filter(Boolean).join(" · ") || item.category || (service ? "Service" : "Product")}</small><small>{last?.amount !== undefined ? `Last ${service ? "service cost" : "paid"} ${formatMoney(last.amount, last.currency)}${!service && (last.quantity ?? 1) > 1 ? ` for ${last.quantity} units` : ""}` : service ? "No service recorded yet" : "No purchase recorded yet"}</small></span><span aria-hidden="true">→</span></button>; })}{repeatCandidates.length === 0 ? <p className="repeat-empty">No saved product or service matches. Choose New product or service to add a different record.</p> : null}</div>}
        {repeatItem ? <><div className="form-subheading"><span>{isServiceType(repeatItem.itemType) ? "SERVICE AGAIN" : "THIS PURCHASE"}</span><span>OPTIONAL</span></div><div className="field-pair"><label className="field"><span>{isServiceType(repeatItem.itemType) ? "Date of service" : "Date"}</span><input type="date" name="date" max={localDateString()} defaultValue={isServiceType(repeatItem.itemType) ? localDateString() : ""} /></label><label className="field"><span>{isServiceType(repeatItem.itemType) ? "Service cost" : "Total you paid"}</span><div className="price-input"><input name="amount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="—" /><select name="currency" aria-label="Currency" defaultValue="INR">{CURRENCIES.map((value) => <option key={value}>{value}</option>)}</select></div></label></div>
          {!isServiceType(repeatItem.itemType) && repeatItem.category !== "Clothes" ? <label className="field"><span>Quantity</span><input name="repeat_quantity" type="number" min="1" max="10000" step="1" inputMode="numeric" defaultValue="1" /></label> : !isServiceType(repeatItem.itemType) ? <small className="field-hint">For clothes, add one piece at a time so its size and color stay with it.</small> : null}
          {!isServiceType(repeatItem.itemType) ? detailFields(repeatItem.category, repeatItem.itemType).purchase.map((field) => <label className="field" key={field.key}><span>{field.label} <b>OPTIONAL</b></span><input name={`repeat-attribute-${field.key}`} maxLength={120} placeholder={field.placeholder} /></label>) : null}
          {!isServiceType(repeatItem.itemType) && repeatItem.category !== "Clothes" ? <label className="field"><span>Size, flavor, or option <b>OPTIONAL</b></span><input name="repeat_variant" maxLength={120} placeholder="e.g. 100 ml bottle, oats formula" /></label> : null}
          <label className="field"><span>{isServiceType(repeatItem.itemType) ? "Service note" : "Coupon, bundle, or note"} <b>OPTIONAL</b></span><textarea name="note" rows={2} maxLength={400} placeholder={isServiceType(repeatItem.itemType) ? "What was done? Anything to remember next time?" : "What changed this time?"} /></label>
        </> : null}
      </>}
      <div className="dialog-footer"><span>{addMode === "repeat" ? isServiceType(repeatItem?.itemType) ? "Your service history stays together." : "Your saved product photo stays linked." : user ? "Saved to your account." : "Saved in this browser."}</span><button className="button button-primary" type="submit" disabled={addMode === "repeat" && !repeatItem}>{addMode === "repeat" ? isServiceType(repeatItem?.itemType) ? "Log service" : "Add this purchase" : editingItem ? "Save changes" : addIsService ? "Save service" : "Save product"} <Icon name="arrow" size={16} /></button></div>
    </form>
  </section> : null;

  const eventForm = modal === "event" && selectedItem ? <section className="inline-form-card detail-inline-form" role="dialog" aria-modal={isMobileLayout} aria-labelledby="event-title">
    <div className="dialog-top"><div><p className="eyebrow">{selectedItem.name} / {editingEventId ? "EDIT HISTORY" : "ADD TO THE STORY"}</p><h2 id="event-title">{editingEventId ? "Edit history" : eventKind === "purchase" ? "A purchase" : eventKind === "service" ? "Some upkeep" : eventKind === "opened" ? "Container opened" : eventKind === "finished" ? "Container finished" : "A use note"}<span className="period">.</span></h2></div><button ref={formCloseButton} className="icon-button" onClick={() => { setModal(null); setEditingEventId(null); }} aria-label="Close history form"><Icon name="close" /></button></div>
    <p className="dialog-intro">Write down what you remember. You can leave any field blank.</p>
    <form onSubmit={saveEvent} className="entry-form" autoComplete="off" noValidate>
      <label className="field"><span>Date <b>OPTIONAL</b></span><input type="date" name="date" max={localDateString()} defaultValue={selectedItem.events.find((entry) => entry.id === editingEventId)?.date ?? (eventKind === "service" && !editingEventId ? localDateString() : "")} /></label>
      {eventKind === "purchase" || eventKind === "service" ? <label className="field"><span>{eventKind === "purchase" ? selectedItem.category === "Clothes" ? "Paid for this piece" : "Total you paid" : "Service cost"} <b>OPTIONAL</b></span><div className="price-input"><input name="amount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="—" defaultValue={selectedItem.events.find((entry) => entry.id === editingEventId)?.amount ?? ""} /><select name="currency" aria-label="Currency" defaultValue={selectedItem.events.find((entry) => entry.id === editingEventId)?.currency ?? "INR"}>{CURRENCIES.map((value) => <option key={value}>{value}</option>)}</select></div>{eventKind === "purchase" ? <small className="field-hint">{selectedItem.category === "Clothes" ? "Log one garment per entry, including its own price and size." : "Enter the total for these units after discounts, card offers, or bundles."}</small> : null}</label> : null}
      {eventKind === "purchase" && selectedPurchaseFields.length ? <div className="attribute-fields purchase-attribute-fields">{selectedPurchaseFields.map((field) => <label className="field" key={field.key}><span>{field.label} <b>OPTIONAL</b></span><input name={`purchase-attribute-${field.key}`} maxLength={120} placeholder={field.placeholder} defaultValue={selectedItem.events.find((entry) => entry.id === editingEventId)?.attributes?.[field.key] ?? ""} /></label>)}</div> : null}
      {eventKind === "purchase" && selectedItem.category !== "Clothes" ? <div className="field-pair"><label className="field"><span>Quantity</span><input name="quantity" type="number" min="1" max="10000" step="1" inputMode="numeric" defaultValue={selectedItem.events.find((entry) => entry.id === editingEventId)?.quantity ?? 1} /></label><label className="field"><span>Variant <b>OPTIONAL</b></span>{selectedItem.variants?.length ? <select name="variant" defaultValue={selectedItem.events.find((entry) => entry.id === editingEventId)?.variant ?? ""}><option value="">Choose if useful</option>{selectedItem.variants.map((variant) => <option key={variant.id}>{variant.name}</option>)}</select> : <input name="variant" maxLength={120} placeholder="e.g. 100g, medium, black" defaultValue={selectedItem.events.find((entry) => entry.id === editingEventId)?.variant ?? ""} />}</label></div> : null}
      {eventKind === "purchase" || eventKind === "service" ? <div className="custom-fields-block event-extra-fields">
        {eventCustomFields.map((field) => <div className="custom-attribute-row" key={field.id}><label className="field"><span>Detail name</span><input maxLength={60} value={field.label} placeholder="e.g. Haircut style" onChange={(event) => setEventCustomFields((current) => current.map((entry) => entry.id === field.id ? { ...entry, label: event.target.value } : entry))} /></label><label className="field"><span>Value</span><input maxLength={160} value={field.value} placeholder="Add a detail" onChange={(event) => setEventCustomFields((current) => current.map((entry) => entry.id === field.id ? { ...entry, value: event.target.value } : entry))} /></label><button className="text-button remove-custom-field" type="button" onClick={() => setEventCustomFields((current) => current.filter((entry) => entry.id !== field.id))} aria-label="Remove custom entry detail">Remove</button></div>)}
        <button className="text-button add-custom-field" type="button" disabled={eventCustomFields.length >= 20} onClick={() => setEventCustomFields((current) => [...current, { id: makeId(), label: "", value: "" }])}>＋ Add a detail</button>
      </div> : null}
      {eventKind === "use" ? <label className="field"><span>How did it feel? <b>OPTIONAL</b></span><select name="feeling" defaultValue={selectedItem.events.find((entry) => entry.id === editingEventId)?.feeling ?? ""}><option value="">Skip for now</option><option value="loved">I really liked it</option><option value="okay">It was okay</option><option value="regret">I didn’t like it much</option></select></label> : null}
      {eventKind !== "opened" && eventKind !== "finished" ? <label className="field"><span>A note <b>OPTIONAL</b></span><textarea name="note" rows={3} maxLength={400} defaultValue={selectedItem.events.find((entry) => entry.id === editingEventId)?.note ?? ""} placeholder={eventKind === "service" ? "What was done? Anything to remember for next time…" : eventKind === "use" ? "How often, what worked, what didn’t…" : "Coupon, card offer, bundle, or where you bought it…"} /></label> : null}
      <div className="dialog-footer"><span>You can always add more later.</span><button className="button button-primary" type="submit">{editingEventId ? "Save changes" : "Add to timeline"} <Icon name="arrow" size={16} /></button></div>
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
      <header className={`topbar${profileOpen ? " profile-open" : ""}`}>
        <Link className="wordmark" href="/" aria-label="Kept, home"><span className="brand-mark">k.</span><span>kept</span></Link>
        <div className="topbar-note"><span className="status-dot" /> A small record of what stays</div>
        <div className="top-actions">
          <div className="more-menu-wrap" ref={moreMenu}>
            <button className="quiet-button more-menu-trigger" aria-expanded={moreOpen} aria-haspopup="menu" onClick={() => setMoreOpen((open) => !open)}>More <span aria-hidden="true">⌄</span></button>
            {moreOpen ? <div className="more-menu" role="menu" aria-label="More actions">
              <button role="menuitem" onClick={() => { toggleTheme(); setMoreOpen(false); }}><Icon name={theme === "dark" ? "sun" : "moon"} size={16} /> {theme === "dark" ? "Light appearance" : "Dark appearance"}</button>
              <button role="menuitem" onClick={() => { exportBackup(); setMoreOpen(false); }} disabled={!items.length && !routineData.phases.length && !routineData.concerns.length}><Icon name="download" size={16} /> Back up</button>
              <button role="menuitem" onClick={() => { importInput.current?.click(); setMoreOpen(false); }}><Icon name="upload" size={16} /> Restore</button>
            </div> : null}
          </div>
          {user ? <div className="profile-menu-wrap" ref={profileMenu}>
            <button className="profile-trigger" onClick={() => { setDeliveryPin(String(user.user_metadata?.kept_delivery_pin ?? "")); setProfileOpen((open) => !open); }} aria-expanded={profileOpen} aria-haspopup="dialog" aria-label="Open profile settings">
              <span className={`profile-avatar mascot-${profileMascot}`}><img src={mascotImageUrl(profileMascot)} alt="" /></span><span className="profile-trigger-label">Settings</span>
            </button>
            {profileOpen ? <section className="profile-popover" role="dialog" aria-modal={isMobileLayout} aria-label="Profile settings">
              <div className="profile-popover-heading"><div><p className="eyebrow">YOUR ACCOUNT</p><strong>Your profile<span className="period">.</span></strong></div><button ref={profileCloseButton} className="icon-button" onClick={() => setProfileOpen(false)} aria-label="Close profile settings"><Icon name="close" size={18} /></button></div>
              <div className="profile-account-card"><span className={`profile-avatar profile-avatar-large mascot-${profileMascot}`}><img src={mascotImageUrl(profileMascot)} alt="" /></span><span><strong>Kept account</strong><small>{user.email}</small></span></div>
              <section className="profile-avatar-section" aria-labelledby="profile-avatar-heading"><div className="profile-section-heading"><div><h3 id="profile-avatar-heading">Your avatar</h3><p>Choose a character for your account.</p></div><span>{PROFILE_MASCOTS.indexOf(profileMascot) + 1} / {PROFILE_MASCOTS.length}</span></div>
              <div className="mascot-grid" aria-label="Profile avatar options">
                {PROFILE_MASCOTS.map((mascot) => <button key={mascot} type="button" className={`mascot-option mascot-${mascot}${profileMascot === mascot ? " selected" : ""}`} onClick={() => saveProfileMascot(mascot)} disabled={profileBusy} aria-pressed={profileMascot === mascot} aria-label={`${mascot} profile picture`} title={mascot}>
                  <img src={mascotImageUrl(mascot)} alt="" loading="lazy" /><span>{mascot}</span>
                </button>)}
              </div><small className="avatar-credit">Character art by <a href="https://www.dicebear.com/styles/thumbs/" target="_blank" rel="noreferrer">DiceBear Thumbs</a> · CC0</small></section>
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
        <button type="button" className={view === "library" ? "active" : ""} aria-current={view === "library" ? "page" : undefined} onClick={() => { setView("library"); setSelectedId(null); setArchiveOpen(false); clearLibraryFilters(); }}>Library</button>
        <button type="button" className={view === "services" ? "active" : ""} aria-current={view === "services" ? "page" : undefined} onClick={() => { setView("services"); setSelectedId(null); setArchiveOpen(false); clearLibraryFilters(); }}>Services</button>
        <button type="button" className={view === "calendar" ? "active" : ""} aria-current={view === "calendar" ? "page" : undefined} onClick={() => { setView("calendar"); setSelectedId(null); }}>Calendar</button>
        <button type="button" className={view === "routine" ? "active" : ""} aria-current={view === "routine" ? "page" : undefined} onClick={() => { setView("routine"); setSelectedId(null); }}>Routine</button>
      </nav>

      <div id="main-content">
      {view === "library" || view === "services" ? <>
      {view === "library" ? <section className="intro" aria-labelledby="page-title">
        <div className="intro-copy">
          <p className="eyebrow">A LITTLE MORE AWARE OF WHAT YOU OWN</p>
          <h1 id="page-title">Keep what <em>matters.</em></h1>
          <p className="intro-description">Remember what you bought, how it’s holding up, and when it needs care.</p>
        </div>
      </section> : null}

      {!supabaseConfigured ? <p className="local-mode-note">Saved on this browser. Add Supabase details to enable account sign-in and cloud sync.</p> : null}

      {(migrationItems || migrationRoutineData) ? <section className="migration-card" aria-labelledby="migration-title">
        <div><p className="eyebrow">YOUR BROWSER HAS SAVED RECORDS</p><h2 id="migration-title">Bring your list into this account?</h2><p>{migrationItems?.length ?? 0} item{migrationItems?.length === 1 ? "" : "s"}{migrationRoutineData ? `, ${migrationRoutineData.phases.length} routine period${migrationRoutineData.phases.length === 1 ? "" : "s"}, and ${migrationRoutineData.concerns.length} concern${migrationRoutineData.concerns.length === 1 ? "" : "s"}` : ""}. Your browser copy stays here.</p></div>
        <div className="migration-actions"><button className="button button-primary" onClick={importLocalRecords} disabled={migrationBusy}>{migrationBusy ? "Importing…" : "Import records"}</button><button className="text-button" onClick={deferLocalImport} disabled={migrationBusy}>Not now</button></div>
      </section> : null}

      {view === "library" && items.length > 0 && <section className="summary-strip" aria-label="Your tracker at a glance">
        <div className="summary-cell"><strong className="summary-value">{productItems.length}</strong><span className="summary-caption">{productItems.length === 1 ? "product" : "products"}</span></div>
        {stats.repeated > 0 ? <div className="summary-cell"><strong className="summary-value">{stats.repeated}</strong><span className="summary-caption">repeat purchases</span></div> : null}
        {stats.totals.length ? <div className="summary-cell summary-spend">{stats.totals.map(([currency, total]) => <strong className="summary-money" key={currency}>{formatMoney(total, currency)} <small>{currency}</small></strong>)}<span className="summary-caption">recorded spend</span></div> : null}
      </section>}

      <section className={`workspace${selectedItem ? "" : " workspace-empty"}${isMobileLayout && selectedId ? " mobile-detail-open" : ""}`} id="library" aria-labelledby="library-title">
        <div className="library-column">
          <div className="section-heading">
            <div><p className="eyebrow section-eyebrow">{isServicesView ? "SERVICE RECORDS" : archiveOpen ? "PAST RECORDS" : "YOUR LIBRARY"}</p><h2 id="library-title">{isServicesView ? "Services" : archiveOpen ? "Archive" : "Your things"}<span className="period">.</span></h2></div>
            {!archiveOpen ? <button className="button button-primary add-button" onClick={openAddItem}><Icon name="plus" size={17} /><span>{isServicesView ? "Add a service" : "Add a thing"}</span></button> : null}
          </div>
          {itemForm}
          {items.length ? <div className="library-tools">
            <div className="library-search-row"><label className="search-box"><Icon name="search" size={17} /><span className="visually-hidden">Search your things</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find something…" /></label><button className={`button button-outline library-filter-toggle ${filtersOpen ? "active" : ""}`} type="button" aria-expanded={filtersOpen} aria-controls="library-filter-panel" onClick={() => setFiltersOpen((open) => !open)}><span aria-hidden="true">☷</span> Filters{activeFilterCount ? <b>{activeFilterCount}</b> : null}</button></div>
            <div className="library-browse-actions"><div className="filter-list" role="group" aria-label={isServicesView ? "Filter services by category" : "Filter products by category"}>
              {["All things", ...categories].map((value) => <button className={`filter-chip ${category === value ? "active" : ""}`} key={value} onClick={() => setCategory(value)} aria-pressed={category === value}>{value === "All things" ? isServicesView ? "All services" : "All categories" : value}</button>)}
            </div><button className={`text-button archive-toggle ${archiveOpen ? "active" : ""}`} type="button" onClick={() => { setArchiveOpen((open) => !open); setSelectedId(null); clearLibraryFilters(); }}>{archiveOpen ? "← Active list" : `Archive${items.filter((item) => Boolean(item.archivedAt) && isServiceType(item.itemType) === isServicesView).length ? ` · ${items.filter((item) => Boolean(item.archivedAt) && isServiceType(item.itemType) === isServicesView).length}` : ""}`}</button></div>
            {filtersOpen ? <section className="library-filter-panel" id="library-filter-panel" aria-label="Library filters"><div className="library-filter-panel-heading"><strong>Filter {isServicesView ? "services" : "products"}</strong><button type="button" className="text-button" onClick={clearLibraryFilters}>Clear filters</button></div>
              {categories.length ? <fieldset className="filter-facet"><legend>Category</legend><div className="filter-options"><label><input type="radio" name="filter-category" checked={category === "All things"} onChange={() => setCategory("All things")} /> All categories</label>{categories.map((value) => <label key={value}><input type="radio" name="filter-category" checked={category === value} onChange={() => setCategory(value)} /> {value}</label>)}</div></fieldset> : null}
              {filterFacets.map((facet) => <fieldset className="filter-facet" key={facet.key}><legend>{facet.label}</legend><div className="filter-options">{facet.values.map((value) => { const checked = (facetFilters[facet.key] ?? []).includes(value); return <label key={value}><input type="checkbox" checked={checked} onChange={(event) => setFacetFilters((current) => ({ ...current, [facet.key]: event.target.checked ? [...new Set([...(current[facet.key] ?? []), value])] : (current[facet.key] ?? []).filter((entry) => entry !== value) }))} /> {value}</label>; })}</div></fieldset>)}
              <fieldset className="filter-facet"><legend>Activity date</legend><div className="field-pair filter-date-fields"><label className="field"><span>Activity</span><select value={timeKindFilter} onChange={(event) => setTimeKindFilter(event.target.value)}><option value="any">Purchases or services</option><option value="purchase">Purchases</option><option value="service">Services</option></select></label><label className="field"><span>When</span><select value={timeFilter} onChange={(event) => setTimeFilter(event.target.value)}><option value="any">Any time</option><option value="30">Last 30 days</option><option value="90">Last 3 months</option><option value="365">Last year</option><option value="custom">Choose dates</option></select></label></div>{timeFilter === "custom" ? <div className="field-pair filter-date-fields"><label className="field"><span>From</span><input type="date" value={customDateFrom} onChange={(event) => setCustomDateFrom(event.target.value)} /></label><label className="field"><span>To</span><input type="date" value={customDateTo} onChange={(event) => setCustomDateTo(event.target.value)} /></label></div> : null}</fieldset>
            </section> : null}
          </div> : null}

          <div className="item-list" aria-live="polite">
            {visibleItems.length ? visibleItems.map((item, index) => {
              const buys = purchases(item);
              const lastPurchase = lastOfKind(item, "purchase");
              const lastService = lastOfKind(item, "service");
              const tracked = consumableSummary(item);
              const isActive = item.id === (selectedItem?.id ?? visibleItems[0]?.id);
              return <div className="item-row-wrap" key={item.id}><button className={`item-row ${isActive ? "selected" : ""}`} onClick={() => openItemOnMobile(item.id)} aria-pressed={isActive}>
                <span className={`item-number ${index % 3 === 1 ? "number-soft" : ""}`}>{String(index + 1).padStart(2, "0")}</span>
                {item.productPhoto || item.currentProduct?.imageUrl || fallbackItemImage(item) ? <img className="item-thumbnail" src={item.productPhoto || item.currentProduct?.imageUrl || fallbackItemImage(item)} alt="" referrerPolicy="no-referrer" /> : <span className={`item-seal seal-${(item.category || "other").toLowerCase().replace(/[^a-z]/g, "")}`} aria-hidden="true"><span>{item.name.trim().charAt(0).toUpperCase()}</span></span>}
                <span className="item-main"><strong>{item.name}</strong><small>{[item.brand, item.category || "Unsorted", item.itemType].filter(Boolean).join(" · ")}{tracked ? <span> · {tracked.unopened} unopened</span> : buys.length > 1 ? <span> · {buys.length} purchases</span> : null}</small></span>
                <span className="item-status">{archiveOpen ? <><small>ARCHIVED</small><strong>{item.archivedAt ? formatDate(item.archivedAt.slice(0, 10)) : ""}</strong></> : lastService ? <><small>SERVICE</small><strong>{lastService.date ? ageLabel(lastService.date) + " ago" : "logged"}</strong></> : lastPurchase?.date ? <><small>OWNED</small><strong>{formatAgeFromEvent(item)}</strong></> : <><small>ADDED</small><strong>—</strong></>}</span>
                <span className="row-arrow" aria-hidden="true"><Icon name="arrow" size={17} /></span>
              </button><ManageMenu label={item.name}>{archiveOpen ? <><button type="button" onClick={() => restoreItem(item)}>Restore to active list</button><button type="button" className="danger-action" onClick={() => removeItem(item)}>Delete permanently</button></> : <><button type="button" onClick={() => openEditItem(item)}>Edit details</button><button type="button" onClick={() => { setSelectedId(item.id); setView(isServiceType(item.itemType) ? "services" : "library"); archiveItem(item); }}>Move to Archive</button><button type="button" className="danger-action" onClick={() => removeItem(item)}>Delete permanently</button></>}</ManageMenu></div>;
            }) : (archiveOpen ? items.some((item) => Boolean(item.archivedAt) && isServiceType(item.itemType) === isServicesView) : isServicesView ? serviceItems.length : productItems.length) ? <div className="no-results"><span className="empty-glyph">⌕</span><strong>No matches in this index.</strong><span>Try another word or category.</span><button className="text-button" onClick={() => { setSearch(""); clearLibraryFilters(); }}>Clear filters</button></div> : modal === "item" || modal === "edit-item" ? null : <div className="empty-state">
              <p className="eyebrow">{isServicesView ? "SERVICE RECORDS" : archiveOpen ? "ARCHIVE" : "YOUR LIST STARTS HERE"}</p><h3>{archiveOpen ? "Nothing in the archive yet." : isServicesView ? "No services recorded yet." : productItems.length ? "Your products live here." : "Add the first thing you want to remember."}</h3><p>{archiveOpen ? "Items you no longer use will stay here with their history." : isServicesView ? "Add a haircut or another service to keep its dates and costs together, outside your products." : productItems.length ? "Your products stay here; recurring services are listed separately." : "A name is enough. Dates, prices, and notes can come later."}</p>{!archiveOpen ? <button className="button button-primary empty-add" onClick={openAddItem}><Icon name="plus" size={17} /> {isServicesView ? "Add a service" : "Add a thing"}</button> : null}
            </div>}
          </div>
          {items.length ? <div className="list-footer"><span>{archiveOpen ? "ARCHIVE" : isServicesView ? "SERVICE RECORDS" : "PRODUCTS"}</span><span>{visibleItems.length.toString().padStart(2, "0")}</span></div> : null}
        </div>

        {selectedItem ? <aside className="detail-column" aria-label={`${selectedItem.name} details`}>
          <div className="detail-record" key={selectedItem.id}>
            <div className="detail-topline"><button className="mobile-back-button" onClick={closeMobileItem}><span aria-hidden="true">←</span> {isServiceType(selectedItem.itemType) ? "Services" : "Library"}</button><span className="eyebrow">{selectedItem.archivedAt ? "ARCHIVED RECORD" : isServiceType(selectedItem.itemType) ? "SERVICE RECORD" : "OBJECT RECORD"} <span>/ {String(items.findIndex((item) => item.id === selectedItem.id) + 1).padStart(2, "0")}</span></span><ManageMenu label={selectedItem.name}>{selectedItem.archivedAt ? <><button type="button" onClick={() => restoreItem(selectedItem)}>Restore to active list</button><button type="button" className="danger-action" onClick={() => removeItem(selectedItem)}>Delete permanently</button></> : <><button type="button" onClick={() => openEditItem(selectedItem)}>Edit all details</button>{selectedItem.productUrl ? <button type="button" onClick={() => setProductRefreshToken((value) => value + 1)}>Refresh product details</button> : null}<button type="button" onClick={() => archiveItem(selectedItem)}>Move to Archive</button><button type="button" className="danger-action" onClick={() => removeItem(selectedItem)}>Delete permanently</button></>}</ManageMenu></div>
            {selectedItem.archivedAt ? <p className="archive-notice">This record is archived. Its history stays saved. Use Manage to restore it.</p> : null}
            <div className="detail-heading"><span className={`detail-seal seal-${(selectedItem.category || "other").toLowerCase().replace(/[^a-z]/g, "")}`} aria-hidden="true">{selectedItem.name.trim().charAt(0).toUpperCase()}</span><div><span className="detail-category">{[selectedItem.brand, selectedItem.category || "UNCATEGORIZED", selectedItem.itemType].filter(Boolean).join(" · ")}</span><h3>{selectedItem.name}</h3></div></div>
            {selectedItem.note || selectedItem.specifications && Object.values(selectedItem.specifications).some(Boolean) ? <details className="more-item-details detail-extra-details"><summary>More about this item <span>Notes and saved details</span></summary>{selectedItem.note ? <p className="item-note">{selectedItem.note}</p> : null}{selectedItem.specifications && Object.entries(selectedItem.specifications).some(([, value]) => value) ? <dl className="item-specifications">{Object.entries(selectedItem.specifications).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt>{attributeLabel(key)}</dt><dd>{value}</dd></div>)}</dl> : null}</details> : null}
            <section className={`product-card purchase-ledger-card ${selectedItemImage ? "has-product-image" : "no-product-image"}`} aria-label="Product and purchase history">
              <div className="product-card-heading"><span className="eyebrow">{selectedItem.brand || selectedItem.storeName || "YOUR PRODUCT"}</span></div>
              <div className="purchase-ledger-product">{selectedItemImage ? <img className="product-image" src={selectedItemImage} alt={selectedItem.currentProduct?.title || selectedItem.name} referrerPolicy="no-referrer" /> : <div className="product-image-placeholder" aria-hidden="true">{selectedItem.name.trim().charAt(0).toUpperCase()}</div>}<div className="purchase-ledger-copy"><strong className="product-title">{selectedItem.name}</strong>{selectedItem.currentProduct?.title && selectedItem.currentProduct.title !== selectedItem.name ? <span className="product-subtitle">{selectedItem.currentProduct.title}</span> : null}<span className="product-subtitle">{[selectedItem.brand, selectedItem.itemType, selectedItem.relatedGroup].filter(Boolean).join(" · ") || selectedItem.category || "Your product"}</span></div></div>
              <section className="purchase-comparison" aria-label="Recent amounts paid"><h4>What you paid</h4>{selectedPurchases.length ? <div className="purchase-comparison-grid">{selectedPurchases.slice(0, 2).map((purchase, index) => { const quantity = purchase.quantity ?? 1; return <article className="purchase-comparison-card" key={purchase.id}><span>{index === 0 ? "LATEST" : "PREVIOUS"}</span><strong>{formatMoney(purchase.amount, purchase.currency) || "Amount not added"}</strong><small>{quantity} {quantity === 1 ? "item" : "items"} · {formatDate(purchase.date)}</small>{purchase.amount !== undefined ? <small>{formatMoney(purchase.amount / quantity, purchase.currency)} each</small> : null}</article>; })}</div> : <p className="purchase-empty">No purchase logged yet.</p>}</section>
              {selectedItem.consumable ? <section className="consumable-card" aria-label="Container use and stock"><div className="consumable-card-heading"><div><p className="eyebrow">CURRENT SUPPLY</p><h4>{selectedConsumable?.open ? "One container open" : "No container open"}</h4></div><span>{selectedConsumable?.unopened ?? 0} unopened</span></div>{selectedConsumable?.open?.date ? <p>Opened {formatDate(selectedConsumable.open.date)}{selectedConsumable.openedDays !== null ? " · " + selectedConsumable.openedDays + " days in use" : ""}</p> : null}{selectedConsumable?.averageDays ? <p>Usually lasts about {selectedConsumable.averageDays} days per container.</p> : <p>A usual use period will appear after you finish a tracked container.</p>}{selectedConsumable?.remainingDays !== null && selectedConsumable?.remainingDays !== undefined ? <strong className="restock-estimate">{selectedConsumable.remainingDays <= 0 ? "Time to restock" : `About ${Math.ceil(selectedConsumable.remainingDays / 7)} weeks until restock`}</strong> : null}<div className="consumable-actions">{selectedConsumable?.open ? <button className="button button-outline" type="button" onClick={() => finishConsumable(selectedItem)}>Mark container finished</button> : selectedConsumable?.unopened ? <button className="button button-outline" type="button" onClick={() => openNextConsumable(selectedItem)}>Open next container</button> : <span>Log a purchase to add more stock.</span>}</div></section> : null}
              {!selectedItem.consumable && isConsumableType(selectedItem.category, selectedItem.itemType) && !selectedItem.archivedAt ? <p className="consumable-setup-invite">Track how long it lasts in Manage → Edit all details.</p> : null}
              {selectedItem.productUrl ? <a className="product-link" href={selectedItem.productUrl} target="_blank" rel="noreferrer noopener">Open product page <Icon name="arrow" size={15} /></a> : null}
              {productFetch?.itemId === selectedItem.id && productFetch.status === "loading" ? <p className="product-status" aria-live="polite">Checking product details…</p> : null}
              {productFetch?.itemId === selectedItem.id && productFetch.status === "error" ? <p className="product-status product-error" role="status">Product details couldn’t be refreshed. Your saved photo and history are safe. Use Manage to try again.</p> : null}
            </section>
            {selectedItem.relatedGroup ? <section className="related-purchases" aria-label={`Other products in ${selectedItem.relatedGroup}`}><div className="related-purchases-heading"><div><p className="eyebrow">SAME ROUTINE OR NEED</p><h4>{selectedItem.relatedGroup}</h4></div><span>{relatedItems.length + 1} products</span></div>{relatedItems.length ? <><p className="related-purchases-intro">Different products, together for comparison.</p><div className="related-purchase-list">{relatedPurchases.map(({ item, event }) => { const photo = item.productPhoto || item.currentProduct?.imageUrl || fallbackItemImage(item); const quantity = event.quantity ?? 1; return <button type="button" className="related-purchase-row" key={`${item.id}-${event.id}`} onClick={() => { setSelectedId(item.id); setSearch(""); setCategory("All things"); }}><span className="related-purchase-photo">{photo ? <img src={photo} alt="" referrerPolicy="no-referrer" /> : <i>{item.name.charAt(0).toUpperCase()}</i>}</span><span className="related-purchase-name"><strong>{item.name}</strong><small>{[item.brand, formatDate(event.date)].filter(Boolean).join(" · ")}</small></span><span className="related-purchase-amount">{formatMoney(event.amount, event.currency) || "—"}<small>{quantity} {quantity === 1 ? "item" : "items"}{event.amount !== undefined ? ` · ${formatMoney(event.amount / quantity, event.currency)} each` : ""}</small></span></button>; })}</div></> : <p className="related-purchases-intro">Add another product to compare purchases across brands or formulas.</p>}</section> : null}
            {(selectedItem.variants?.length || selectedItem.productUrl) ? <section className="variants-panel" aria-label="Product variants">
              <div className="variants-heading"><div><p className="eyebrow">OPTIONS</p><h4>Sizes & options</h4></div><button className="button button-outline" onClick={() => openVariantForm()}><Icon name="plus" size={15} /> Add option</button></div>
              {selectedItem.variants?.length ? <ul className="variant-list">{selectedItem.variants.map((variant) => <li key={variant.id}>
                <span><strong>{variant.name}</strong></span>
                <ManageMenu label={variant.name}><button type="button" onClick={() => openVariantForm(variant.id)}>Edit option</button><button type="button" className="danger-action" onClick={() => removeVariant(variant)}>Remove option</button></ManageMenu>
              </li>)}</ul> : <p className="variant-hint">Add an option to keep a size, color, or version easy to choose.</p>}
            </section> : <div className="variants-invite"><button className="text-button" onClick={() => openVariantForm()}>Add a size or variant</button></div>}
            {variantForm}
            <div className="detail-facts">
              <div><span>OWNED</span><strong>{formatAgeFromEvent(selectedItem)}</strong></div>
              <div><span>PURCHASES</span><strong>{selectedPurchases.length || "—"}</strong></div>
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
                </div><ManageMenu label={labelForKind(event.kind) + " entry"}><button type="button" onClick={() => openEventForm(event.kind, event)}>Edit date and details</button><button type="button" className="danger-action" onClick={() => removeEvent(event.id)}>Remove this entry</button></ManageMenu>
              </article>) : <div className="timeline-empty"><span className="timeline-empty-dot" /><p>No history yet.</p></div>}
            </div>
            <div className="detail-actions"><button className="button button-outline" onClick={() => openEventForm(selectedItem.itemType && isServiceType(selectedItem.itemType) ? "service" : "purchase")}><Icon name="plus" size={16} /> {selectedItem.itemType && isServiceType(selectedItem.itemType) ? "Log service" : "Add purchase"}</button>{!(selectedItem.itemType && isServiceType(selectedItem.itemType)) ? <button className="button button-outline" onClick={() => openEventForm("service")}><Icon name="plus" size={16} /> Log upkeep</button> : null}<button className="button button-outline" onClick={() => openEventForm("use")}><Icon name="plus" size={16} /> Add a note</button></div>
            {eventForm}
          </div>
        </aside> : null}
      </section>
      </> : null}
      <div className="calendar-keep-alive" hidden={view !== "calendar"}><CalendarView items={items} onOpenItem={openCalendarItem} isMobileLayout={isMobileLayout} /></div>
      <div className="routine-keep-alive" hidden={view !== "routine"}><RoutineView data={routineData} onChange={setRoutineData} items={items} /></div>
      </div>

      <nav className="mobile-tabbar" aria-label="Primary navigation">
        <button type="button" className={view === "library" ? "active" : ""} aria-current={view === "library" ? "page" : undefined} onClick={() => { setView("library"); setSelectedId(null); setArchiveOpen(false); clearLibraryFilters(); }}><span aria-hidden="true">▤</span>Library</button>
        <button type="button" className={view === "services" ? "active" : ""} aria-current={view === "services" ? "page" : undefined} onClick={() => { setView("services"); setSelectedId(null); setArchiveOpen(false); clearLibraryFilters(); }}><span aria-hidden="true">✂</span>Services</button>
        <button type="button" className={view === "calendar" ? "active" : ""} aria-current={view === "calendar" ? "page" : undefined} onClick={() => { setView("calendar"); setSelectedId(null); }}><span aria-hidden="true">▦</span>Calendar</button>
        <button type="button" className={view === "routine" ? "active" : ""} aria-current={view === "routine" ? "page" : undefined} onClick={() => { setView("routine"); setSelectedId(null); }}><span aria-hidden="true">◷</span>Routine</button>
      </nav>

      <footer className="page-footer"><Link className="footer-brand" href="/">kept<span>.</span></Link></footer>

      <div className="toast" role="status" aria-live="polite" data-visible={Boolean(notice)}>{notice}</div>
    </main>
  );
}
