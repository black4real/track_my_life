"use client";

/* Calendar thumbnails intentionally use the original shop or saved photo URL. */
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import type { ItemEvent, TrackedItem } from "@/lib/tracker";
import { formatDate, formatMoney } from "@/lib/tracker";

type CalendarEntry = { item: TrackedItem; event: ItemEvent };

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function eventLabel(kind: ItemEvent["kind"]) {
  return kind === "purchase" ? "Bought" : kind === "service" ? "Care" : "Use note";
}

function itemPhoto(item: TrackedItem) {
  return item.productPhoto || item.currentProduct?.imageUrl;
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

export function CalendarView({ items, onOpenItem }: { items: TrackedItem[]; onOpenItem: (id: string) => void }) {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(today));
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
  const selectedEntries = entriesByDate.get(selectedDate) ?? [];
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(month);
  const dateLabel = selectedDate ? formatDate(selectedDate) : "Choose a date";

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

  return <main className="calendar-view" aria-labelledby="calendar-title">
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
            const inMonth = day.getMonth() === month.getMonth();
            const isToday = key === localDateKey(today);
            return <button key={key} className={`calendar-day${inMonth ? "" : " outside-month"}${key === selectedDate ? " selected" : ""}${isToday ? " today" : ""}${entries.length ? " has-events" : ""}`} onClick={() => setSelectedDate(key)} aria-pressed={key === selectedDate} aria-label={`${formatDate(key)}${entries.length ? `, ${entries.length} recorded ${entries.length === 1 ? "event" : "events"}` : ", no recorded events"}`}>
              <span className="calendar-day-number">{day.getDate()}</span>
              {entries.length ? <><span className="calendar-day-photos">{entries.slice(0, 3).map(({ item, event }) => itemPhoto(item)
                ? <img key={event.id} src={itemPhoto(item)} alt="" referrerPolicy="no-referrer" />
                : <i key={event.id} className={`calendar-photo-fallback seal-${(item.category || "other").toLowerCase().replace(/[^a-z]/g, "")}`} aria-hidden="true">{categoryIcon(item.category)}</i>)}</span><span className="calendar-event-count">{entries.length} {entries.length === 1 ? "entry" : "entries"}</span></> : <span className="calendar-empty-mark" aria-hidden="true" />}
            </button>;
          })}
        </div>
      </section>
      <aside className="calendar-day-panel" aria-live="polite" aria-label={`Events for ${dateLabel}`}>
        <div className="calendar-day-panel-heading"><p className="eyebrow">DAY NOTES</p><h2>{dateLabel}</h2><span>{selectedEntries.length ? `${selectedEntries.length} ${selectedEntries.length === 1 ? "entry" : "entries"}` : "Nothing logged"}</span></div>
        {selectedEntries.length ? <div className="calendar-event-list">{selectedEntries.map(({ item, event }) => <button className="calendar-event-card" key={event.id} onClick={() => onOpenItem(item.id)}>
          {itemPhoto(item) ? <img src={itemPhoto(item)} alt="" referrerPolicy="no-referrer" /> : <span className={`calendar-event-fallback seal-${(item.category || "other").toLowerCase().replace(/[^a-z]/g, "")}`} aria-hidden="true">{categoryIcon(item.category)}</span>}
          <span className="calendar-event-copy"><small>{eventLabel(event.kind)}</small><strong>{item.name}</strong>{event.variant ? <span>{event.variant}</span> : null}{event.amount !== undefined ? <span>{formatMoney(event.amount, event.currency)}</span> : null}{event.note ? <span className="calendar-event-note">{event.note}</span> : null}</span>
          <span className="calendar-event-arrow" aria-hidden="true">→</span>
        </button>)}</div> : <div className="calendar-day-empty"><span aria-hidden="true">·</span><p>This day has no dated entries.</p><small>Add a date to a purchase, care note, or use note to see it here.</small></div>}
      </aside>
    </div>
  </main>;
}
