"use client";

/* Calendar thumbnails intentionally use the original shop or saved photo URL. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ItemEvent, TrackedItem } from "@/lib/tracker";
import { fallbackItemImage, formatDate, formatMoney } from "@/lib/tracker";

type CalendarEntry = { item: TrackedItem; event: ItemEvent };
type CalendarGroup = { item: TrackedItem; events: ItemEvent[] };

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function eventLabel(kind: ItemEvent["kind"]) {
  return kind === "purchase" ? "Bought" : kind === "service" ? "Care" : "Use note";
}

function itemPhoto(item: TrackedItem) {
  return item.productPhoto || item.currentProduct?.imageUrl || fallbackItemImage(item);
}

function groupByItem(entries: CalendarEntry[]): CalendarGroup[] {
  const groups = new Map<string, CalendarGroup>();
  for (const { item, event } of entries) {
    const group = groups.get(item.id);
    if (group) group.events.push(event);
    else groups.set(item.id, { item, events: [event] });
  }
  return [...groups.values()];
}

function groupEventLabel(events: ItemEvent[]) {
  const counts = new Map<string, number>();
  for (const event of events) counts.set(eventLabel(event.kind), (counts.get(eventLabel(event.kind)) ?? 0) + 1);
  return [...counts].map(([label, count]) => `${label}${count > 1 ? ` ×${count}` : ""}`).join(" · ");
}

function categoryIcon(category?: string) {
  const normalized = category?.toLowerCase() ?? "";
  if (normalized.includes("cloth")) return "✳";
  if (normalized.includes("accessor")) return "◇";
  if (normalized.includes("tech")) return "⌘";
  if (normalized.includes("groom")) return "✂";
  if (normalized.includes("fitness")) return "◉";
  if (normalized.includes("health")) return "+";
  if (normalized.includes("skin")) return "◌";
  if (normalized.includes("home")) return "⌂";
  if (normalized.includes("vehicle")) return "↗";
  return "·";
}

export function CalendarView({ items, onOpenItem, isMobileLayout = false }: { items: TrackedItem[]; onOpenItem: (id: string) => void; isMobileLayout?: boolean }) {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(today));
  const [dayPanelOpen, setDayPanelOpen] = useState(false);
  const dayCloseButton = useRef<HTMLButtonElement>(null);
  const selectedDayButton = useRef<HTMLButtonElement>(null);
  const entriesByDate = useMemo(() => {
    const entries = new Map<string, CalendarEntry[]>();
    for (const item of items) {
      for (const event of item.events) {
        if (!event.date || !/^\d{4}-\d{2}-\d{2}$/.test(event.date)) continue;
        const bucket = entries.get(event.date) ?? [];
        bucket.push({ item, event });
        entries.set(event.date, bucket);
      }
    }
    for (const bucket of entries.values()) bucket.sort((a, b) => (a.item.name).localeCompare(b.item.name));
    return entries;
  }, [items]);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  }, [month]);
  const selectedEntries = useMemo(() => entriesByDate.get(selectedDate) ?? [], [entriesByDate, selectedDate]);
  const selectedGroups = useMemo(() => groupByItem(selectedEntries), [selectedEntries]);
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(month);
  const dateLabel = selectedDate ? formatDate(selectedDate) : "Choose a date";

  const closeDayPanel = useCallback(() => {
    setDayPanelOpen(false);
    requestAnimationFrame(() => selectedDayButton.current?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    if (isMobileLayout && dayPanelOpen) dayCloseButton.current?.focus({ preventScroll: true });
  }, [isMobileLayout, dayPanelOpen]);

  useEffect(() => {
    if (!isMobileLayout || !dayPanelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDayPanel();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = document.querySelector<HTMLElement>(".calendar-day-panel.mobile-open");
      if (!panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]")].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isMobileLayout, dayPanelOpen, closeDayPanel]);

  function moveMonth(amount: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + amount, 1);
    setMonth(next);
    setSelectedDate(localDateKey(new Date(next.getFullYear(), next.getMonth(), 1)));
  }

  function goToday() {
    const now = new Date();
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(localDateKey(now));
  }

  return <section className="calendar-view" aria-labelledby="calendar-title">
    <div className="calendar-heading">
      <div><p className="eyebrow">YOUR DATES, KEPT</p><h1 id="calendar-title">Calendar<span className="period">.</span></h1><p className="calendar-intro">A photo-led view of the moments you logged.</p></div>
      <div className="calendar-controls">
        <button className="quiet-button calendar-today" onClick={goToday}>Today</button>
        <div className="calendar-month-controls"><button className="icon-button" onClick={() => moveMonth(-1)} aria-label="Previous month">←</button><strong aria-live="polite">{monthLabel}</strong><button className="icon-button" onClick={() => moveMonth(1)} aria-label="Next month">→</button></div>
      </div>
    </div>
    <div className="calendar-layout">
      <section className="calendar-grid-wrap" aria-label={`${monthLabel} calendar`}>
        <div className="calendar-grid calendar-weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid calendar-days">
          {days.map((day) => {
            const key = localDateKey(day);
            const entries = entriesByDate.get(key) ?? [];
            const groups = groupByItem(entries);
            const inMonth = day.getMonth() === month.getMonth();
            const isToday = key === localDateKey(today);
            return <button key={key} ref={key === selectedDate ? selectedDayButton : undefined} data-date={key} className={`calendar-day${inMonth ? "" : " outside-month"}${key === selectedDate ? " selected" : ""}${isToday ? " today" : ""}${entries.length ? " has-events" : ""}`} onClick={() => { setSelectedDate(key); setDayPanelOpen(true); }} aria-pressed={key === selectedDate} aria-expanded={key === selectedDate ? dayPanelOpen : undefined} aria-label={`${formatDate(key)}${entries.length ? `, ${entries.length} recorded ${entries.length === 1 ? "event" : "events"}` : ", no recorded events"}`}>
              <span className="calendar-day-number">{day.getDate()}</span>
              {entries.length ? <><span className={`calendar-day-photos${groups.length === 1 ? " single" : ""}`}>{groups.slice(0, 3).map(({ item, events }) => <span className="calendar-photo-stack" key={item.id}>
                {itemPhoto(item) ? <img src={itemPhoto(item)} alt="" referrerPolicy="no-referrer" /> : <i className={`calendar-photo-fallback seal-${(item.category || "other").toLowerCase().replace(/[^a-z]/g, "")}`} aria-hidden="true">{categoryIcon(item.category)}</i>}
                {events.length > 1 ? <span className="calendar-photo-count" aria-label={`${events.length} entries for ${item.name}`}>×{events.length}</span> : null}
              </span>)}</span><span className="calendar-event-count">{groups.length} {groups.length === 1 ? "item" : "items"}{entries.length > groups.length ? ` · ${entries.length} entries` : ""}</span></> : <span className="calendar-empty-mark" aria-hidden="true" />}
            </button>;
          })}
        </div>
      </section>
      <aside className={`calendar-day-panel${dayPanelOpen ? " mobile-open" : ""}`} role={isMobileLayout && dayPanelOpen ? "dialog" : "region"} aria-modal={isMobileLayout && dayPanelOpen ? true : undefined} aria-labelledby="calendar-day-title" aria-label={isMobileLayout && dayPanelOpen ? undefined : `Events for ${dateLabel}`}>
        <div className="calendar-day-panel-heading"><div><p className="eyebrow">DAY NOTES</p><h2 id="calendar-day-title">{dateLabel}</h2><span>{selectedEntries.length ? `${selectedGroups.length} ${selectedGroups.length === 1 ? "item" : "items"}${selectedEntries.length > selectedGroups.length ? ` · ${selectedEntries.length} entries` : ""}` : "Nothing logged"}</span></div><button ref={dayCloseButton} type="button" className="icon-button calendar-day-close" onClick={closeDayPanel} aria-label="Back to month calendar">×</button></div>
        {selectedGroups.length ? <div className="calendar-event-list">{selectedGroups.map(({ item, events }) => <button className="calendar-event-card" key={item.id} onClick={() => { closeDayPanel(); onOpenItem(item.id); }}>
          {itemPhoto(item) ? <span className="calendar-event-photo-wrap"><img src={itemPhoto(item)} alt="" referrerPolicy="no-referrer" />{events.length > 1 ? <span className="calendar-photo-count">×{events.length}</span> : null}</span> : <span className={`calendar-event-fallback seal-${(item.category || "other").toLowerCase().replace(/[^a-z]/g, "")}`} aria-hidden="true">{categoryIcon(item.category)}{events.length > 1 ? <span className="calendar-photo-count">×{events.length}</span> : null}</span>}
          <span className="calendar-event-copy"><small>{groupEventLabel(events)}</small><strong>{item.name}</strong>{events.map((event) => <span className="calendar-group-event" key={event.id}>{[event.variant, event.attributes ? Object.entries(event.attributes).map(([key, value]) => `${key.replaceAll("_", " ")}: ${value}`).join(" · ") : null, event.amount !== undefined ? formatMoney(event.amount, event.currency) : null, event.note].filter(Boolean).join(" · ")}</span>)}</span>
          <span className="calendar-event-arrow" aria-hidden="true">→</span>
        </button>)}</div> : <div className="calendar-day-empty"><span aria-hidden="true">·</span><p>This day has no dated entries.</p><small>Add a date to a purchase, care note, or use note to see it here.</small></div>}
      </aside>
    </div>
  </section>;
}
