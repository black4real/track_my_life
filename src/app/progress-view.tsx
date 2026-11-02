"use client";

/* Private progress photos use signed Supabase URLs; show the original framing for comparison. */
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { formatDate, makeId, ProgressCatalogProduct, ProgressCheckIn, ProgressData, ProgressPhoto, ProgressProduct, ProgressTrack, RoutineData, TrackedItem, WorkoutSession } from "@/lib/tracker";

type Props = { data: ProgressData; onChange: (data: ProgressData) => void; items: TrackedItem[]; routine: RoutineData; userId?: string };
type ProgressTab = "skin" | "supplement" | "workout";
type ProgressDraft = { kind: string; fields: Record<string, string>; photoData?: string; selectedTrackId?: string; tab: ProgressTab; savedAt: string };

function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayNumber(date: string, start: string) {
  const a = new Date(`${start}T12:00:00`).getTime();
  const b = new Date(`${date}T12:00:00`).getTime();
  return Math.max(1, Math.floor((b - a) / 86_400_000) + 1);
}

function daysBetween(from: string, to: string) {
  return Math.max(0, Math.floor((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000));
}

function orderedPhotos(track: ProgressTrack) {
  return [...track.photos].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

function trackStart(track: ProgressTrack) {
  return track.kind === "skin"
    ? orderedPhotos(track)[0]?.date
    : track.startedOn || [...track.checkIns.map((entry) => entry.date), ...track.photos.map((photo) => photo.date)].sort()[0];
}

function linkedPhoto(item?: TrackedItem) { return item?.productPhoto || item?.currentProduct?.imageUrl; }

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That photo could not be opened."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Your browser couldn’t open this image. Try Safari with the original photo, or save it as JPEG in Photos and try again."));
      image.onload = () => {
        const scale = Math.min(1, 2200 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) { reject(new Error("The photo editor is unavailable.")); return; }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function ProductChooser({ items, routine, catalog, kind, onPick, onCustom }: { items: TrackedItem[]; routine: RoutineData; catalog: ProgressCatalogProduct[]; kind: "skin" | "supplement"; onPick: (product: ProgressProduct) => void; onCustom: () => void }) {
  const routineProducts = routine.products;
  const choices = useMemo<Array<{ id: string; name: string; brand?: string; image?: string; linkedItemId?: string; linkedRoutineProductId?: string; catalogProductId?: string }>>(() => [
    ...catalog.filter((product) => product.kind === kind).map((product) => ({ id: `catalog:${product.id}`, name: product.name, brand: product.brand, image: product.photo, catalogProductId: product.id })),
    ...items.filter((item) => !item.archivedAt).map((item) => ({ id: `library:${item.id}`, name: item.name, brand: item.brand, image: linkedPhoto(item), linkedItemId: item.id })),
    ...routineProducts.map((product) => ({ id: `routine:${product.id}`, name: product.name, brand: product.brand, image: product.photo, linkedRoutineProductId: product.id })),
  ].filter((choice, index, all) => all.findIndex((entry) => entry.id.startsWith("catalog:") ? entry.id === choice.id : entry.name.toLowerCase() === choice.name.toLowerCase() && (entry.brand ?? "").toLowerCase() === (choice.brand ?? "").toLowerCase()) === index), [items, routineProducts, catalog, kind]);
  return <div className="progress-product-choices">
    {choices.length ? <div className="progress-product-choice-grid">{choices.map((choice) => <button type="button" className="progress-product-choice" key={choice.id} onClick={() => onPick({ id: makeId(), name: choice.name, brand: choice.brand, catalogProductId: choice.catalogProductId, linkedItemId: choice.linkedItemId, linkedRoutineProductId: choice.linkedRoutineProductId, createdAt: new Date().toISOString() })}>
      <span className="progress-product-choice-image">{choice.image ? <img src={choice.image} alt="" /> : choice.name.slice(0, 1).toUpperCase()}</span><span><strong>{choice.name}</strong><small>{choice.brand || (choice.id.startsWith("catalog:") ? "Saved product" : choice.linkedItemId ? "From Library" : "From Routine")}</small></span><span aria-hidden="true">＋</span>
    </button>)}</div> : <p className="progress-empty">Your Library and Routine have no products yet. Add one by name below.</p>}
    <button type="button" className="text-button progress-custom-link" onClick={onCustom}>＋ Add a custom product</button>
  </div>;
}

function WorkoutProgress({ data, onChange }: { data: ProgressData; onChange: (next: ProgressData) => void }) {
  const [showPlan, setShowPlan] = useState(false);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [showSession, setShowSession] = useState(false);
  const active = data.tracks.filter((track) => track.kind === "workout" && track.status === "active");
  const past = data.tracks.filter((track) => track.kind === "workout" && track.status === "completed");
  const selected = data.tracks.find((track) => track.kind === "workout" && track.id === activeTrackId) ?? null;
  function addPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("planName") ?? "").trim();
    if (!name) return;
    const now = new Date().toISOString();
    const track: ProgressTrack = { id: makeId(), kind: "workout", name, areas: [], startedOn: String(form.get("startedOn") ?? "") || localToday(), notes: String(form.get("planNotes") ?? "").trim() || undefined, status: "active", createdAt: now, products: [], photos: [], checkIns: [], workoutSessions: [] };
    onChange({ ...data, tracks: [track, ...data.tracks] });
    setActiveTrackId(track.id); setShowPlan(false); event.currentTarget.reset();
  }
  function addSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const session: WorkoutSession = { id: makeId(), date: String(form.get("sessionDate") ?? localToday()), exercise: String(form.get("exercise") ?? "").trim(), sets: Number(form.get("sets")) || undefined, reps: Number(form.get("reps")) || undefined, weight: Number(form.get("weight")) || undefined, weightUnit: String(form.get("weightUnit") ?? "kg"), distance: Number(form.get("distance")) || undefined, distanceUnit: String(form.get("distanceUnit") ?? "km"), durationMinutes: Number(form.get("duration")) || undefined, note: String(form.get("sessionNote") ?? "").trim() || undefined, createdAt: new Date().toISOString() };
    if (!session.exercise) return;
    onChange({ ...data, tracks: data.tracks.map((track) => track.id === selected.id ? { ...track, workoutSessions: [...(track.workoutSessions ?? []), session].sort((a, b) => a.date.localeCompare(b.date)) } : track) });
    setShowSession(false); event.currentTarget.reset();
  }
  return <div className="workout-progress">
    <div className="progress-section-heading workout-heading"><div><p className="eyebrow">TRAINING LOG</p><h2>Workouts<span className="period">.</span></h2><p>Keep sessions together and see your lifts, reps, distance, or time build.</p></div><button type="button" className="button button-primary" onClick={() => setShowPlan((value) => !value)}>＋ New training log</button></div>
    {showPlan ? <form className="progress-form" onSubmit={addPlan}><div className="progress-form-heading"><strong>Start a training log</strong><button type="button" className="text-button" onClick={() => setShowPlan(false)}>Close</button></div><label className="field"><span>Name</span><input name="planName" maxLength={120} placeholder="e.g. Strength training" required /></label><label className="field"><span>Started</span><input name="startedOn" type="date" max={localToday()} defaultValue={localToday()} /></label><label className="field"><span>Focus <b>OPTIONAL</b></span><input name="planNotes" maxLength={500} placeholder="e.g. Build consistency, 3 days a week" /></label><button className="button button-primary" type="submit">Create training log</button></form> : null}
    {selected ? <section className="workout-detail"><button className="mobile-back-button" type="button" onClick={() => { setActiveTrackId(null); setShowSession(false); }}>← All training logs</button><div className="progress-detail-heading"><div><p className="eyebrow">{selected.startedOn ? `STARTED ${formatDate(selected.startedOn)}` : "TRAINING LOG"}</p><h3>{selected.name}<span className="period">.</span></h3>{selected.notes ? <p>{selected.notes}</p> : null}</div><button type="button" className="text-button" onClick={() => onChange({ ...data, tracks: data.tracks.map((track) => track.id === selected.id ? { ...track, status: track.status === "active" ? "completed" : "active" } : track) })}>{selected.status === "active" ? "Finish log" : "Reopen log"}</button></div><div className="workout-session-heading"><div><p className="eyebrow">YOUR SESSIONS</p><h4>Progression<span className="period">.</span></h4></div><button className="button button-outline" type="button" onClick={() => setShowSession((value) => !value)}>＋ Log a session</button></div>
      {showSession ? <form className="progress-form workout-session-form" onSubmit={addSession}><div className="progress-form-heading"><strong>Session details</strong><button type="button" className="text-button" onClick={() => setShowSession(false)}>Close</button></div><div className="field-pair"><label className="field"><span>Date</span><input type="date" name="sessionDate" max={localToday()} defaultValue={localToday()} required /></label><label className="field"><span>Exercise</span><input name="exercise" maxLength={160} placeholder="e.g. Bench press" required /></label></div><div className="field-pair workout-metrics"><label className="field"><span>Sets</span><input type="number" inputMode="numeric" name="sets" min="1" placeholder="3" /></label><label className="field"><span>Reps</span><input type="number" inputMode="numeric" name="reps" min="1" placeholder="8" /></label><label className="field"><span>Weight</span><input type="number" inputMode="decimal" name="weight" min="0" step="0.25" placeholder="40" /></label><label className="field"><span>Unit</span><select name="weightUnit"><option>kg</option><option>lb</option></select></label></div><div className="field-pair workout-metrics"><label className="field"><span>Distance <b>OPTIONAL</b></span><input type="number" inputMode="decimal" name="distance" min="0" step="0.1" placeholder="2" /></label><label className="field"><span>Distance unit</span><select name="distanceUnit"><option>km</option><option>mi</option><option>m</option></select></label><label className="field"><span>Minutes <b>OPTIONAL</b></span><input type="number" inputMode="numeric" name="duration" min="1" placeholder="30" /></label></div><label className="field"><span>Notes <b>OPTIONAL</b></span><textarea name="sessionNote" rows={2} maxLength={2000} placeholder="How it felt, form notes, anything to remember" /></label><button type="submit" className="button button-primary">Save session</button></form> : null}
      {(selected.workoutSessions ?? []).length ? <ol className="workout-session-list">{[...(selected.workoutSessions ?? [])].sort((a, b) => b.date.localeCompare(a.date)).map((session) => <li key={session.id}><time>{formatDate(session.date)}</time><strong>{session.exercise}</strong><span>{[session.sets && session.reps ? `${session.sets} × ${session.reps}` : null, session.weight ? `${session.weight} ${session.weightUnit ?? "kg"}` : null, session.distance ? `${session.distance} ${session.distanceUnit ?? "km"}` : null, session.durationMinutes ? `${session.durationMinutes} min` : null].filter(Boolean).join(" · ") || "Session logged"}</span>{session.note ? <p>{session.note}</p> : null}</li>)}</ol> : <div className="progress-empty"><strong>No sessions yet.</strong><p>Log an exercise with the numbers you care about. You can add different exercises over time.</p><button className="button button-primary" type="button" onClick={() => setShowSession(true)}>＋ Log first session</button></div>}
    </section> : <div className="workout-log-grid">{active.length ? active.map((track) => <button type="button" key={track.id} className="progress-track-card" onClick={() => setActiveTrackId(track.id)}><span className="progress-card-photo"><span>↗</span></span><span className="progress-card-body"><small>{track.startedOn ? `SINCE ${formatDate(track.startedOn)}` : "TRAINING LOG"}</small><strong>{track.name}</strong><span>{track.notes || "Training progression"}</span><span>{(track.workoutSessions ?? []).length} session{(track.workoutSessions ?? []).length === 1 ? "" : "s"}</span></span><span className="progress-card-arrow">→</span></button>) : <div className="progress-empty"><span className="empty-glyph">↗</span><strong>Start your first training log.</strong><p>Track strength, running, cycling, or any movement. Add only the numbers that matter to you.</p><button type="button" className="button button-primary" onClick={() => setShowPlan(true)}>＋ New training log</button></div>}</div>}
    {past.length ? <details className="progress-past-tracks"><summary>Past training logs <span>{past.length}</span></summary><div className="workout-log-grid">{past.map((track) => <button type="button" key={track.id} className="progress-track-card" onClick={() => setActiveTrackId(track.id)}><span className="progress-card-photo"><span>↗</span></span><span className="progress-card-body"><small>PAST</small><strong>{track.name}</strong><span>{(track.workoutSessions ?? []).length} sessions saved</span></span></button>)}</div></details> : null}
  </div>;
}

export function ProgressView({ data, onChange, items, routine, userId = "local" }: Props) {
  const [tab, setTab] = useState<ProgressTab>("skin");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showTrackForm, setShowTrackForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showPhotoForm, setShowPhotoForm] = useState(false);
  const [showCatalogForm, setShowCatalogForm] = useState(false);
  const [customProductForm, setCustomProductForm] = useState(false);
  const [photoData, setPhotoData] = useState("");
  const [catalogPhotoData, setCatalogPhotoData] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoDate, setPhotoDate] = useState(localToday());
  const [photoNote, setPhotoNote] = useState("");
  const [photoCounts, setPhotoCounts] = useState<Record<string, string>>({});
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [feelingNotes, setFeelingNotes] = useState<Record<string, string>>({});
  const [firstProductSource, setFirstProductSource] = useState("custom");
  const [showFirstProductPicker, setShowFirstProductPicker] = useState(false);
  const [selectedSupplementProduct, setSelectedSupplementProduct] = useState<ProgressProduct | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const draftRef = useRef<ProgressDraft | null>(null);
  const draftStorageKey = `kept-progress-draft-v1-${userId}`;

  useEffect(() => {
    let draft: ProgressDraft | null = null;
    try {
      const saved = localStorage.getItem(draftStorageKey);
      if (saved) {
        draft = JSON.parse(saved) as ProgressDraft;
        if (draft && typeof draft.kind === "string" && draft.fields && typeof draft.fields === "object") {
          draftRef.current = draft;
        }
      }
    } catch { /* A broken local draft never blocks normal Progress use. */ }
    const timer = window.setTimeout(() => {
      if (draft) {
        setDraftSavedAt(draft.savedAt || ""); setDraftMessage("Draft restored from this device"); setPhotoData(draft.photoData || "");
        if (["catalog", "track", "add-product"].includes(draft.kind)) setCatalogPhotoData(draft.photoData || "");
        if (draft.fields.photoDate) setPhotoDate(draft.fields.photoDate);
        if (draft.fields.photoNote) setPhotoNote(draft.fields.photoNote);
        setTab(draft.tab || "skin");
        if (draft.selectedTrackId) setSelectedId(draft.selectedTrackId);
        if (draft.kind === "track") setShowTrackForm(true);
        if (draft.kind === "catalog") setShowCatalogForm(true);
        if (draft.kind === "photo" && draft.selectedTrackId) setShowPhotoForm(true);
        if (draft.kind === "add-product" && draft.selectedTrackId) setShowProductForm(true);
      }
      setDraftLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [draftStorageKey]);

  useEffect(() => {
    if (!draftLoaded || !draftRef.current) return;
    const active = document.activeElement;
    document.querySelectorAll<HTMLFormElement>(".progress-form[data-progress-draft]").forEach((form) => {
      if (form.dataset.progressDraft !== draftRef.current?.kind) return;
      for (const [name, value] of Object.entries(draftRef.current?.fields ?? {})) {
        const field = form.elements.namedItem(name);
        if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
          if (field !== active && !field.value) field.value = value;
        }
      }
    });
  }, [draftLoaded, showTrackForm, showCatalogForm, showPhotoForm, showProductForm, selectedId]);

  function saveDraft(kind: string, form: HTMLFormElement, image = photoData) {
    const fields = Object.fromEntries([...new FormData(form).entries()].map(([key, value]) => [key, typeof value === "string" ? value : ""]));
    const draft: ProgressDraft = { kind, fields, photoData: image || undefined, selectedTrackId: selected?.id, tab, savedAt: new Date().toISOString() };
    draftRef.current = draft;
    setDraftSavedAt(draft.savedAt);
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      setDraftMessage("Draft saved on this device");
    } catch {
      setDraftMessage("Text draft saved; this photo may be too large to keep as a draft.");
    }
  }

  function clearDraft() {
    draftRef.current = null;
    setDraftSavedAt(""); setDraftMessage("");
    try { localStorage.removeItem(draftStorageKey); } catch { /* Ignore unavailable local storage. */ }
  }

  function resumeDraft() {
    const draft = draftRef.current;
    if (!draft) return;
    setTab(draft.tab || "skin");
    if (draft.selectedTrackId) setSelectedId(draft.selectedTrackId);
    if (draft.kind === "track") setShowTrackForm(true);
    if (draft.kind === "catalog") setShowCatalogForm(true);
    if (draft.kind === "photo" && draft.selectedTrackId) setShowPhotoForm(true);
    if (draft.kind === "add-product" && draft.selectedTrackId) setShowProductForm(true);
  }

  const visibleTracks = data.tracks.filter((track) => track.kind === tab);
  const selected = visibleTracks.find((track) => track.id === selectedId) ?? null;
  const activeTracks = visibleTracks.filter((track) => track.status === "active");
  const pastTracks = visibleTracks.filter((track) => track.status === "completed");
  const itemById = new Map(items.map((item) => [item.id, item]));
  const routineById = new Map(routine.products.map((product) => [product.id, product]));

  function changeTrack(trackId: string, update: (track: ProgressTrack) => ProgressTrack) {
    onChange({ ...data, tracks: data.tracks.map((track) => track.id === trackId ? update(track) : track) });
  }

  function photoForProduct(product: ProgressProduct) {
    return (data.catalog ?? []).find((entry) => entry.id === product.catalogProductId)?.photo || linkedPhoto(product.linkedItemId ? itemById.get(product.linkedItemId) : undefined) || routineById.get(product.linkedRoutineProductId ?? "")?.photo;
  }

  function newTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const enteredName = String(form.get("trackName") ?? "").trim();
    const name = tab === "supplement" && selectedSupplementProduct ? productLabel(selectedSupplementProduct) : enteredName;
    if (!name) return;
    const now = new Date().toISOString();
    const id = makeId();
    if (tab === "skin") {
      const catalog = [...(data.catalog ?? [])];
      const first = newProductFromForm(form, now, "skin", catalog);
      if (first?.catalogProductId && catalogPhotoData) {
        const index = catalog.findIndex((product) => product.id === first.catalogProductId);
        if (index >= 0) catalog[index] = { ...catalog[index], photo: catalogPhotoData };
      }
      const areas = String(form.get("areas") ?? "").split(",").map((area) => area.trim()).filter(Boolean).slice(0, 8);
      const track: ProgressTrack = { id, kind: "skin", name, areas, status: "active", createdAt: now, products: first ? [first] : [], photos: [], checkIns: [] };
      onChange({ ...data, catalog, tracks: [track, ...data.tracks] });
      setSelectedId(id);
    } else {
      const startedOn = String(form.get("startedOn") ?? "");
      const brand = String(form.get("brand") ?? "").trim() || selectedSupplementProduct?.brand || undefined;
      const catalog = [...(data.catalog ?? [])];
      let savedProduct = selectedSupplementProduct?.catalogProductId ? catalog.find((entry) => entry.id === selectedSupplementProduct.catalogProductId) : catalog.find((entry) => entry.kind === "supplement" && entry.name.toLowerCase() === name.toLowerCase() && (entry.brand ?? "").toLowerCase() === (brand ?? "").toLowerCase());
      if (!savedProduct && !selectedSupplementProduct?.linkedItemId && !selectedSupplementProduct?.linkedRoutineProductId) { savedProduct = { id: makeId(), kind: "supplement", name, brand, photo: catalogPhotoData || undefined, createdAt: now }; catalog.unshift(savedProduct); }
      else if (savedProduct && catalogPhotoData) { savedProduct = { ...savedProduct, photo: catalogPhotoData }; const index = catalog.findIndex((entry) => entry.id === savedProduct?.id); if (index >= 0) catalog[index] = savedProduct; }
      const product: ProgressProduct = { ...(selectedSupplementProduct ?? {}), id: makeId(), name, brand, catalogProductId: savedProduct?.id ?? selectedSupplementProduct?.catalogProductId, dose: String(form.get("dose") ?? "").trim() || selectedSupplementProduct?.dose, createdAt: now };
      const track: ProgressTrack = { id, kind: "supplement", name, areas: [], startedOn: startedOn || undefined, notes: String(form.get("notes") ?? "").trim() || undefined, status: "active", createdAt: now, products: [product], photos: [], checkIns: [] };
      onChange({ ...data, catalog, tracks: [track, ...data.tracks] });
      setSelectedId(id);
    }
    event.currentTarget.reset(); setShowTrackForm(false); clearDraft(); setFirstProductSource("custom"); setCatalogPhotoData(""); setSelectedSupplementProduct(null); setShowFirstProductPicker(false);
  }

  function newProductFromForm(form: FormData, createdAt: string, kind: "skin" | "supplement", catalog: ProgressCatalogProduct[]): ProgressProduct | null {
    const source = String(form.get("productSource") ?? "custom");
    if (source.startsWith("catalog:")) {
      const saved = catalog.find((entry) => entry.id === source.slice(8));
      return saved ? { id: makeId(), name: saved.name, brand: saved.brand, catalogProductId: saved.id, createdAt } : null;
    }
    if (source.startsWith("library:")) {
      const item = itemById.get(source.slice(8));
      return item ? { id: makeId(), name: item.name, brand: item.brand, linkedItemId: item.id, createdAt } : null;
    }
    if (source.startsWith("routine:")) {
      const product = routineById.get(source.slice(8));
      return product ? { id: makeId(), name: product.name, brand: product.brand, linkedItemId: product.linkedItemId, linkedRoutineProductId: product.id, createdAt } : null;
    }
    const name = String(form.get("productName") ?? "").trim();
    const brand = String(form.get("productBrand") ?? "").trim() || undefined;
    if (!name) return null;
    let saved = catalog.find((entry) => entry.kind === kind && entry.name.toLowerCase() === name.toLowerCase() && (entry.brand ?? "").toLowerCase() === (brand ?? "").toLowerCase());
    if (!saved) { saved = { id: makeId(), kind, name, brand, createdAt }; catalog.unshift(saved); }
    return { id: makeId(), name, brand, catalogProductId: saved.id, createdAt };
  }

  function addCatalogProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("catalogName") ?? "").trim();
    if (!name) return;
    const kind = String(form.get("catalogKind")) === "supplement" ? "supplement" : "skin";
    const brand = String(form.get("catalogBrand") ?? "").trim() || undefined;
    const now = new Date().toISOString();
    const current = data.catalog ?? [];
    const matching = current.find((entry) => entry.kind === kind && entry.name.toLowerCase() === name.toLowerCase() && (entry.brand ?? "").toLowerCase() === (brand ?? "").toLowerCase());
    const product: ProgressCatalogProduct = { id: matching?.id ?? makeId(), kind, name, brand, photo: catalogPhotoData || matching?.photo, photoPath: matching?.photoPath, createdAt: matching?.createdAt ?? now };
    onChange({ ...data, catalog: [product, ...current.filter((entry) => entry.id !== product.id)] });
    setCatalogPhotoData(""); setShowCatalogForm(false); setPhotoError(""); clearDraft(); event.currentTarget.reset();
  }

  function logUse(track: ProgressTrack, product: ProgressProduct, used: boolean, feeling?: string) {
    const date = localToday();
    const previous = track.checkIns.find((entry) => entry.productId === product.id && entry.date === date);
    const entry: ProgressCheckIn = { id: previous?.id ?? makeId(), productId: product.id, date, used, feeling: feeling ?? previous?.feeling, note: feelingNotes[product.id]?.trim() || previous?.note, createdAt: previous?.createdAt ?? new Date().toISOString() };
    changeTrack(track.id, (current) => ({ ...current, startedOn: current.kind === "supplement" ? current.startedOn || date : current.startedOn, checkIns: previous ? current.checkIns.map((value) => value.id === previous.id ? entry : value) : [...current.checkIns, entry] }));
  }

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; const form = event.currentTarget.form; event.target.value = ""; setPhotoError("");
    if (!file) return;
    if ((!file.type.startsWith("image/") && !/\.(heic|heif|avif|tif|tiff|bmp|gif|jpg|jpeg|png|webp)$/i.test(file.name)) || file.size > 30 * 1024 * 1024) { setPhotoError("Choose an image under 30 MB."); return; }
    try { const prepared = await compressImage(file); setPhotoData(prepared); if (form) saveDraft("photo", form, prepared); }
    catch (error) { setPhotoError(error instanceof Error ? error.message : "That photo could not be prepared."); }
  }

  async function handleCatalogPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; const form = event.currentTarget.form; event.target.value = "";
    if (!file) return;
    if ((!file.type.startsWith("image/") && !/\.(heic|heif|avif|tif|tiff|bmp|gif|jpg|jpeg|png|webp)$/i.test(file.name)) || file.size > 30 * 1024 * 1024) { setPhotoError("Choose an image under 30 MB."); return; }
    try {
      const prepared = await compressImage(file); setCatalogPhotoData(prepared);
      if (form) saveDraft(form.dataset.progressDraft || "catalog", form, prepared);
      setPhotoError("");
    } catch (error) { setPhotoError(error instanceof Error ? error.message : "That photo could not be prepared."); }
  }

  const interval = (() => {
    if (!selected || selected.photos.length === 0 || !photoDate) return null;
    const previousPhoto = orderedPhotos(selected).filter((photo) => photo.date <= photoDate).at(-1);
    if (!previousPhoto) return null;
    const periodDays = daysBetween(previousPhoto.date, photoDate);
    const checkIns = selected.products.map((product) => {
      const entries = selected.checkIns.filter((entry) => entry.productId === product.id && entry.date > previousPhoto.date && entry.date <= photoDate);
      const loggedDates = new Set(entries.map((entry) => entry.date));
      return { product, periodDays, loggedDays: loggedDates.size, usedCount: entries.filter((entry) => entry.used).length, needsEstimate: loggedDates.size < periodDays };
    });
    return { previousPhoto, periodDays, checkIns };
  })();

  function openPhotoForm() {
    setPhotoData(""); setPhotoError(""); setPhotoDate(localToday()); setPhotoNote(""); setPhotoCounts({}); setShowPhotoForm(true);
  }

  function savePhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !photoData || !photoDate) { setPhotoError("Choose a photo and its date first."); return; }
    const form = new FormData(event.currentTarget);
    const usageCounts: Record<string, number> = {};
    if (interval) for (const { product, periodDays, needsEstimate, usedCount } of interval.checkIns) {
      const value = String(form.get(`usage-${product.id}`) ?? "").trim();
      if (needsEstimate && !value) { setPhotoError(`Add an estimate for ${product.name}, or enter 0.`); return; }
      const count = value === "" ? usedCount : Number(value);
      if (!Number.isInteger(count) || count < 0 || count > periodDays) { setPhotoError(`Enter a use count from 0 to ${periodDays} for ${product.name}.`); return; }
      usageCounts[product.id] = count;
    }
    const photo: ProgressPhoto = { id: makeId(), date: photoDate, photo: photoData, note: photoNote.trim() || undefined, periodDays: interval?.periodDays, usageCounts: interval ? usageCounts : undefined, createdAt: new Date().toISOString() };
    changeTrack(selected.id, (track) => ({ ...track, photos: [...track.photos, photo] }));
    setShowPhotoForm(false); setPhotoData(""); setPhotoNote(""); setPhotoCounts({}); setCompareIds([]); clearDraft();
  }

  function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const catalog = [...(data.catalog ?? [])];
    const product = newProductFromForm(new FormData(event.currentTarget), new Date().toISOString(), tab === "workout" ? "skin" : tab, catalog);
    if (!product) { setPhotoError("Choose a saved product or enter a product name."); return; }
    let nextCatalog = catalog;
    if (customProductForm && catalogPhotoData) {
      const saved = catalog.find((entry) => entry.id === product.catalogProductId);
      if (saved) nextCatalog = catalog.map((entry) => entry.id === saved.id ? { ...entry, photo: catalogPhotoData } : entry);
    }
    onChange({ ...data, catalog: nextCatalog, tracks: data.tracks.map((track) => track.id === selected.id ? { ...track, products: [...track.products, product] } : track) });
    setShowProductForm(false); setCustomProductForm(false); setPhotoError(""); setCatalogPhotoData(""); clearDraft(); event.currentTarget.reset();
  }

  function addDailyFeeling(event: FormEvent<HTMLFormElement>, track: ProgressTrack, product: ProgressProduct) {
    event.preventDefault();
    const current = track.checkIns.find((entry) => entry.productId === product.id && entry.date === localToday());
    if (!current) return;
    const form = new FormData(event.currentTarget);
    const feeling = String(form.get("feeling") ?? "");
    const note = String(form.get("feelingNote") ?? "").trim();
    changeTrack(track.id, (value) => ({ ...value, checkIns: value.checkIns.map((entry) => entry.id === current.id ? { ...entry, feeling: feeling || undefined, note: note || undefined } : entry) }));
    setFeelingNotes((values) => ({ ...values, [product.id]: note }));
  }

  function toggleCompare(id: string) {
    setCompareIds((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < 2 ? [...current, id] : [current[1], id]);
  }

  function productLabel(product: ProgressProduct) {
    const saved = (data.catalog ?? []).find((entry) => entry.id === product.catalogProductId);
    const item = product.linkedItemId ? itemById.get(product.linkedItemId) : undefined;
    const routineProduct = product.linkedRoutineProductId ? routineById.get(product.linkedRoutineProductId) : undefined;
    return saved?.name ?? item?.name ?? routineProduct?.name ?? product.name;
  }

  const tracks = selected ? undefined : activeTracks;
  const chosenPhotos = selected ? selected.photos.filter((photo) => compareIds.includes(photo.id)) : [];

  return <section className="progress-view" aria-labelledby="progress-title">
    <header className="progress-header"><div><p className="eyebrow">YOUR PERSONAL CHECKPOINTS</p><h1 id="progress-title">Progress<span className="period">.</span></h1><p>Small records of what you use and how things change over time.</p></div><div className="progress-tabs" role="tablist" aria-label="Progress journals">
      <button type="button" role="tab" aria-selected={tab === "skin"} className={tab === "skin" ? "active" : ""} onClick={() => { setTab("skin"); setSelectedId(null); setShowTrackForm(false); }}>Skin</button>
      <button type="button" role="tab" aria-selected={tab === "supplement"} className={tab === "supplement" ? "active" : ""} onClick={() => { setTab("supplement"); setSelectedId(null); setShowTrackForm(false); }}>Supplements</button>
      <button type="button" role="tab" aria-selected={tab === "workout"} className={tab === "workout" ? "active" : ""} onClick={() => { setTab("workout"); setSelectedId(null); setShowTrackForm(false); }}>Workout</button>
    </div></header>
    {draftSavedAt && !showTrackForm && !showCatalogForm && !showPhotoForm && !showProductForm ? <div className="progress-draft-notice"><span><strong>Unfinished form saved.</strong><small>On this device · {formatDate(draftSavedAt.slice(0, 10))}</small></span><button className="button button-outline" type="button" onClick={resumeDraft}>Resume draft</button></div> : null}

    {tab === "workout" ? <WorkoutProgress data={data} onChange={onChange} /> : selected ? <div className="progress-detail">
      <button type="button" className="mobile-back-button progress-back" onClick={() => { setSelectedId(null); setShowPhotoForm(false); setShowProductForm(false); }}>← All {tab === "skin" ? "skin journeys" : "supplements"}</button>
      <div className="progress-detail-heading"><div><p className="eyebrow">{tab === "skin" ? selected.areas.join(" · ") || "SKIN JOURNEY" : "SUPPLEMENT JOURNEY"}</p><h2>{selected.name}<span className="period">.</span></h2><p>{trackStart(selected) ? `Day ${dayNumber(localToday(), trackStart(selected)!)}` : "Add a start date or first check-in to begin counting days."}{selected.status === "completed" ? " · Past journey" : ""}</p></div><button type="button" className="text-button" onClick={() => changeTrack(selected.id, (track) => ({ ...track, status: track.status === "active" ? "completed" : "active" }))}>{selected.status === "active" ? "Finish journey" : "Reopen journey"}</button></div>

      <section className="progress-products" aria-labelledby="progress-products-title"><div className="progress-section-heading"><div><p className="eyebrow">WHAT I’M USING</p><h3 id="progress-products-title">{tab === "skin" ? "Products" : "Supplement"}<span className="period">.</span></h3></div>{tab === "skin" ? <button type="button" className="button button-outline" onClick={() => { setShowProductForm(true); setCustomProductForm(false); }}>＋ Add product</button> : null}</div>
        <div className="progress-product-list">{selected.products.map((product) => {
          const todayEntry = selected.checkIns.find((entry) => entry.productId === product.id && entry.date === localToday());
          const uses = selected.checkIns.filter((entry) => entry.productId === product.id && entry.used).length;
          return <article className="progress-product-card" key={product.id}><div className="progress-product-main"><div className="progress-thumb">{photoForProduct(product) ? <img src={photoForProduct(product)} alt="" /> : <span>{productLabel(product).slice(0, 1).toUpperCase()}</span>}</div><div><strong>{productLabel(product)}</strong>{product.brand ? <small>{product.brand}</small> : null}{product.dose ? <small>{product.dose}</small> : null}<small>{uses} logged use{uses === 1 ? "" : "s"}</small></div></div>
            <div className="progress-checkin-controls"><span>{tab === "skin" ? "Used today?" : "Taken today?"}</span><div><button type="button" className={todayEntry?.used ? "selected" : ""} onClick={() => logUse(selected, product, true)}>{tab === "skin" ? "Used" : "Taken"}</button><button type="button" className={todayEntry && !todayEntry.used ? "selected" : ""} onClick={() => logUse(selected, product, false)}>{tab === "skin" ? "Not used" : "Skipped"}</button></div></div>
            {todayEntry ? <form className="progress-feeling-form" onSubmit={(event) => addDailyFeeling(event, selected, product)}><label><span>How did it feel? <b>OPTIONAL</b></span><select name="feeling" defaultValue={todayEntry.feeling ?? ""}><option value="">No note today</option><option value="good">Felt good</option><option value="no-change">No clear change</option><option value="off">Felt off</option></select></label><label><span>Anything to remember? <b>OPTIONAL</b></span><input name="feelingNote" maxLength={300} defaultValue={todayEntry.note ?? ""} placeholder="A short note" /></label><button type="submit" className="text-button">Save today’s note</button></form> : null}
          </article>;
        })}{selected.products.length === 0 ? <p className="progress-empty">No products are attached to this journey yet.</p> : null}</div>
      </section>

      {showProductForm ? <form className="progress-form" data-progress-draft="add-product" onInput={(event) => saveDraft("add-product", event.currentTarget)} onSubmit={addProduct}><div className="progress-form-heading"><strong>Add something to this journey</strong><button className="text-button" type="button" onClick={() => { setShowProductForm(false); setCustomProductForm(false); }}>Close</button></div>
        {customProductForm ? <><label className="field"><span>Product name</span><input name="productName" maxLength={160} placeholder="e.g. Glycolic acid" required /></label><label className="field"><span>Brand <b>OPTIONAL</b></span><input name="productBrand" maxLength={100} placeholder="Brand name" /></label><label className="field"><span>Product photo <b>OPTIONAL</b></span><input type="file" accept="image/*,.heic,.heif,.avif" onChange={handleCatalogPhoto} /></label>{catalogPhotoData ? <img className="progress-upload-preview" src={catalogPhotoData} alt="Saved product photo preview" /> : null}</> : <ProductChooser items={items} routine={routine} catalog={data.catalog ?? []} kind={tab} onPick={(product) => { changeTrack(selected.id, (track) => ({ ...track, products: [...track.products, product] })); setShowProductForm(false); clearDraft(); }} onCustom={() => setCustomProductForm(true)} />}
        {customProductForm ? <button className="button button-primary" type="submit">Save and add product</button> : null}{draftMessage ? <small className="draft-status" role="status">{draftMessage}</small> : null}{photoError ? <p className="form-error" role="alert">{photoError}</p> : null}
      </form> : null}

      <section className="progress-timeline" aria-labelledby="progress-timeline-title"><div className="progress-section-heading"><div><p className="eyebrow">YOUR CHECKPOINTS</p><h3 id="progress-timeline-title">Timeline<span className="period">.</span></h3></div><button type="button" className="button button-primary" onClick={openPhotoForm}>＋ Add photo</button></div>
        {selected.photos.length > 1 ? <p className="progress-compare-hint">Choose two photos to compare.</p> : null}
        {chosenPhotos.length === 2 ? <div className="progress-comparison" aria-label="Side-by-side photo comparison">{chosenPhotos.map((photo) => <figure key={photo.id}><img src={photo.photo} alt={`${selected.name} progress on ${formatDate(photo.date)}`} /><figcaption>{tab === "skin" ? `Day ${dayNumber(photo.date, orderedPhotos(selected)[0].date)}` : trackStart(selected) ? `Day ${dayNumber(photo.date, trackStart(selected)!)}` : "Progress photo"} · {formatDate(photo.date)}</figcaption></figure>)}</div> : null}
        {selected.photos.length ? <ol className="progress-photo-timeline">{orderedPhotos(selected).map((photo, index, photos) => {
          const baseline = trackStart(selected) || photo.date;
          const prior = photos[index - 1];
          return <li key={photo.id} className="progress-photo-entry"><div className="progress-photo-image"><img src={photo.photo || ""} alt={`${selected.name} progress on ${formatDate(photo.date)}`} /><button type="button" className={`progress-compare-select${compareIds.includes(photo.id) ? " selected" : ""}`} onClick={() => toggleCompare(photo.id)} aria-pressed={compareIds.includes(photo.id)}>{compareIds.includes(photo.id) ? "Selected to compare" : "Compare"}</button></div><div className="progress-photo-copy"><p className="eyebrow">{tab === "skin" ? `DAY ${dayNumber(photo.date, baseline)}` : trackStart(selected) ? `DAY ${dayNumber(photo.date, trackStart(selected)!)}` : `CHECKPOINT ${index + 1}`}</p><h4>{formatDate(photo.date)}</h4>{prior ? <p>{photo.usageCounts ? selected.products.map((product) => `${productLabel(product)}: ${photo.usageCounts?.[product.id] ?? 0}/${photo.periodDays ?? daysBetween(prior.date, photo.date)} days`).join(" · ") : `${selected.checkIns.filter((entry) => entry.date > prior.date && entry.date <= photo.date && entry.used).length} recorded uses since last photo`}</p> : <p>Starting photo · Day 1</p>}{photo.note ? <p className="progress-photo-note">{photo.note}</p> : null}</div></li>;
        })}</ol> : <div className="progress-empty progress-photo-empty"><strong>Your first photo starts Day 1.</strong><p>Keep the same lighting and framing when you can. You can add more checkpoints whenever you like.</p><button className="button button-primary" type="button" onClick={openPhotoForm}>Add the first photo</button></div>}
      </section>

      {showPhotoForm ? <form className="progress-form progress-photo-form" data-progress-draft="photo" onInput={(event) => saveDraft("photo", event.currentTarget)} onSubmit={savePhoto}><div className="progress-form-heading"><strong>{selected.photos.length ? "Add a progress photo" : "Start with your Day 1 photo"}</strong><button className="text-button" type="button" onClick={() => setShowPhotoForm(false)}>Close</button></div>
        <label className="field"><span>Photo <b>REQUIRED</b></span><input type="file" accept="image/*,.heic,.heif,.avif" capture="environment" onChange={handlePhoto} required={!photoData} /></label>{photoData ? <img className="progress-upload-preview" src={photoData} alt="Photo preview" /> : null}<small className="field-hint">Photos are prepared as a smaller JPEG for safe storage. HEIC and other image types are accepted when your browser can open them.</small>
        <label className="field"><span>Date taken</span><input type="date" name="photoDate" value={photoDate} max={localToday()} onChange={(event) => { setPhotoDate(event.target.value); const form = event.currentTarget.form; if (form) saveDraft("photo", form); }} required /></label>
        {interval?.checkIns.map(({ product, periodDays, loggedDays, usedCount, needsEstimate }) => needsEstimate ? <label className="field" key={product.id}><span>How many times did you use {productLabel(product)} in the last {periodDays} days?</span><small className="field-hint">Check-ins cover {loggedDays} days. Give your best estimate, or enter 0.</small><input type="number" name={`usage-${product.id}`} min="0" max={periodDays} step="1" inputMode="numeric" value={photoCounts[product.id] ?? String(usedCount)} onChange={(event) => setPhotoCounts((current) => ({ ...current, [product.id]: event.target.value }))} required /></label> : null)}
        {interval && !interval.checkIns.some((entry) => entry.needsEstimate) ? <p className="progress-estimate-confirm">All {interval.periodDays} days are logged. Usage totals will come from your daily check-ins.</p> : null}
        <label className="field"><span>A note <b>OPTIONAL</b></span><textarea name="photoNote" value={photoNote} onChange={(event) => { setPhotoNote(event.target.value); const form = event.currentTarget.form; if (form) saveDraft("photo", form); }} maxLength={2000} rows={3} placeholder="Lighting, changes, or anything you want to remember" /></label>
        {draftMessage ? <small className="draft-status" role="status">{draftMessage}</small> : null}{photoError ? <p className="form-error" role="alert">{photoError}</p> : null}<button type="submit" className="button button-primary" disabled={!photoData}>Save checkpoint</button>
      </form> : null}
    </div> : <>
      <div className="progress-overview-heading"><div><p className="eyebrow">{tab === "skin" ? "AREAS & ROUTINES" : "YOUR SUPPLEMENTS"}</p><h2>{tab === "skin" ? "Skin journeys" : "Supplement tracks"}<span className="period">.</span></h2><p>{tab === "skin" ? "Keep photos, product use, and notes together by area." : "Follow each supplement on its own timeline."}</p></div><div className="progress-overview-actions"><button className="button button-outline" type="button" onClick={() => { setShowCatalogForm((value) => !value); setCatalogPhotoData(""); }}>＋ Save a product</button><button className="button button-primary" type="button" onClick={() => setShowTrackForm((value) => !value)}>＋ {tab === "skin" ? "New skin journey" : "Add supplement"}</button></div></div>
      {showTrackForm ? <form className="progress-form progress-new-track" data-progress-draft="track" onInput={(event) => saveDraft("track", event.currentTarget)} onSubmit={newTrack}><div className="progress-form-heading"><strong>{tab === "skin" ? "New skin journey" : "New supplement"}</strong><button className="text-button" type="button" onClick={() => setShowTrackForm(false)}>Close</button></div>
        <label className="field"><span>{tab === "skin" ? "Journey name" : "Supplement name"}</span><input name="trackName" maxLength={120} placeholder={selectedSupplementProduct ? productLabel(selectedSupplementProduct) : tab === "skin" ? "e.g. Face" : "e.g. Omega 3"} required={tab !== "supplement" || !selectedSupplementProduct} disabled={Boolean(selectedSupplementProduct)} /></label>{tab === "supplement" ? <fieldset className="progress-product-start"><legend>Use a saved product <b>OPTIONAL</b></legend><button type="button" className="text-button" onClick={() => setShowFirstProductPicker((value) => !value)}>{selectedSupplementProduct ? "Change selected product" : showFirstProductPicker ? "Hide saved products" : "Choose by name and photo"}</button>{showFirstProductPicker ? <ProductChooser items={items} routine={routine} catalog={data.catalog ?? []} kind="supplement" onPick={(product) => { setSelectedSupplementProduct(product); setShowFirstProductPicker(false); }} onCustom={() => { setSelectedSupplementProduct(null); setShowFirstProductPicker(false); }} /> : null}{selectedSupplementProduct ? <p className="field-hint">Selected: {productLabel(selectedSupplementProduct)}. The saved photo will be reused.</p> : null}</fieldset> : null}
        {tab === "skin" ? <><label className="field"><span>Area or focus <b>OPTIONAL</b></span><input name="areas" maxLength={300} placeholder="e.g. Face, hands, neck" /><small className="field-hint">Separate areas with commas.</small></label><fieldset className="progress-product-start"><legend>First product <b>OPTIONAL</b></legend><input type="hidden" name="productSource" value={firstProductSource} />{firstProductSource === "custom" ? <div className="progress-first-product"><label className="field"><span>Product name</span><input name="productName" maxLength={160} placeholder="e.g. Glycolic acid" /></label><label className="field"><span>Brand <b>OPTIONAL</b></span><input name="productBrand" maxLength={100} placeholder="Brand name" /></label><label className="field"><span>Product photo <b>OPTIONAL</b></span><input type="file" accept="image/*,.heic,.heif,.avif" onChange={handleCatalogPhoto} /></label>{catalogPhotoData ? <img className="progress-upload-preview" src={catalogPhotoData} alt="Product photo preview" /> : null}<button type="button" className="text-button" onClick={() => setShowFirstProductPicker((value) => !value)}>{showFirstProductPicker ? "Hide saved products" : "Choose a saved product"}</button></div> : null}{showFirstProductPicker || firstProductSource !== "custom" ? <ProductChooser items={items} routine={routine} catalog={data.catalog ?? []} kind={tab} onPick={(product) => { setFirstProductSource(product.catalogProductId ? `catalog:${product.catalogProductId}` : product.linkedItemId ? `library:${product.linkedItemId}` : product.linkedRoutineProductId ? `routine:${product.linkedRoutineProductId}` : "custom"); setShowFirstProductPicker(false); }} onCustom={() => { setFirstProductSource("custom"); setShowFirstProductPicker(false); }} /> : null}{firstProductSource !== "custom" ? <p className="field-hint">The saved name and image will be reused.</p> : null}</fieldset><button className="button button-primary" type="submit">Create journey</button></> : <><label className="field"><span>Brand <b>OPTIONAL</b></span><input name="brand" maxLength={100} placeholder="Brand name" /></label><label className="field"><span>Dose or serving <b>OPTIONAL</b></span><input name="dose" maxLength={120} placeholder="e.g. 1 capsule" /></label><label className="field"><span>Product photo <b>OPTIONAL</b></span><input type="file" accept="image/*,.heic,.heif,.avif" onChange={handleCatalogPhoto} /></label>{catalogPhotoData ? <img className="progress-upload-preview" src={catalogPhotoData} alt="Product photo preview" /> : null}<label className="field"><span>Started taking it <b>OPTIONAL</b></span><input name="startedOn" type="date" max={localToday()} /></label><label className="field"><span>Notes <b>OPTIONAL</b></span><textarea name="notes" maxLength={2000} rows={2} placeholder="Anything you want to keep in mind" /></label><button className="button button-primary" type="submit">Create supplement track</button></>}
        {draftMessage ? <small className="draft-status" role="status">{draftMessage}</small> : null}
      </form> : null}
      {showCatalogForm ? <form className="progress-form progress-catalog-form" data-progress-draft="catalog" onInput={(event) => saveDraft("catalog", event.currentTarget, catalogPhotoData)} onSubmit={addCatalogProduct}><div className="progress-form-heading"><strong>Save a product for later</strong><button type="button" className="text-button" onClick={() => setShowCatalogForm(false)}>Close</button></div><p className="field-hint">The name and photo stay in your account. Pick this product in any future Skin or Supplement track.</p><label className="field"><span>Product name</span><input name="catalogName" maxLength={160} placeholder="e.g. Glycolic acid" required /></label><div className="field-pair"><label className="field"><span>Type</span><select name="catalogKind" defaultValue={tab}><option value="skin">Skin</option><option value="supplement">Supplement</option></select></label><label className="field"><span>Brand <b>OPTIONAL</b></span><input name="catalogBrand" maxLength={100} placeholder="Brand name" /></label></div><label className="field"><span>Product photo <b>OPTIONAL</b></span><input type="file" accept="image/*,.heic,.heif,.avif" onChange={handleCatalogPhoto} /></label>{catalogPhotoData ? <img className="progress-upload-preview" src={catalogPhotoData} alt="Product photo preview" /> : null}<small className="field-hint">HEIC and common image formats are accepted when your browser can decode them, then saved as JPEG.</small>{draftMessage ? <small className="draft-status" role="status">{draftMessage}</small> : null}{photoError ? <p className="form-error" role="alert">{photoError}</p> : null}<button type="submit" className="button button-primary">Save to product shelf</button></form> : null}
      {customProductForm && !selected ? <form className="progress-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get("customName") ?? "").trim(); if (!name) return; const product: ProgressProduct = { id: makeId(), name, brand: String(form.get("customBrand") ?? "").trim() || undefined, createdAt: new Date().toISOString() }; const trackId = makeId(); const track: ProgressTrack = { id: trackId, kind: "skin", name: "Skin journey", areas: [], status: "active", createdAt: new Date().toISOString(), products: [product], photos: [], checkIns: [] }; onChange({ tracks: [track, ...data.tracks] }); setSelectedId(trackId); setCustomProductForm(false); }}><div className="progress-form-heading"><strong>Add a custom product</strong><button type="button" className="text-button" onClick={() => setCustomProductForm(false)}>Cancel</button></div><label className="field"><span>Name</span><input name="customName" placeholder="e.g. Glycolic acid" required /></label><label className="field"><span>Brand <b>OPTIONAL</b></span><input name="customBrand" /></label><button type="submit" className="button button-primary">Create with this product</button></form> : null}
      {(data.catalog ?? []).length ? <section className="progress-saved-shelf" aria-labelledby="progress-shelf-title"><div className="progress-section-heading"><div><p className="eyebrow">YOUR SAVED PRODUCTS</p><h3 id="progress-shelf-title">Product shelf<span className="period">.</span></h3><p>Names and photos stay ready to reuse in another track.</p></div><span>{(data.catalog ?? []).length} saved</span></div><div className="progress-saved-product-grid">{(data.catalog ?? []).map((product) => <article className="progress-saved-product" key={product.id}><span className="progress-saved-product-photo">{product.photo ? <img src={product.photo} alt="" /> : <span>{product.name.slice(0, 1).toUpperCase()}</span>}</span><span><small>{product.kind === "skin" ? "SKIN" : "SUPPLEMENT"}</small><strong>{product.name}</strong><span>{product.brand || "No brand added"}</span></span></article>)}</div></section> : null}
      {activeTracks.length ? <div className={`progress-track-grid ${tab === "supplement" ? "supplement-track-grid" : ""}`}>{tracks?.map((track) => {
        const start = trackStart(track);
        const latestPhoto = orderedPhotos(track).at(-1);
        const latestCheckin = [...track.checkIns].sort((a, b) => b.date.localeCompare(a.date))[0];
        const loggedUses = track.checkIns.filter((entry) => entry.used).length;
        return <button type="button" className="progress-track-card" key={track.id} onClick={() => setSelectedId(track.id)}><span className="progress-card-photo">{latestPhoto?.photo ? <img src={latestPhoto.photo} alt="" /> : <span>{tab === "skin" ? "◎" : "＋"}</span>}</span><span className="progress-card-body"><small>{tab === "skin" ? track.areas.join(" · ") || "SKIN JOURNEY" : "SUPPLEMENT"}</small><strong>{track.name}</strong><span>{track.products.map((product) => product.name).join(" · ") || "No products yet"}</span><span>{start ? `Day ${dayNumber(localToday(), start)}` : "Add a start date or check-in"} · {track.photos.length} photo{track.photos.length === 1 ? "" : "s"}</span><span>{tab === "skin" ? `${loggedUses} recorded uses` : latestCheckin ? `Last check-in ${formatDate(latestCheckin.date)}` : "No check-ins yet"}</span></span><span className="progress-card-arrow" aria-hidden="true">→</span></button>;
      })}</div> : <div className="progress-empty progress-overview-empty"><span className="empty-glyph">◷</span><strong>{pastTracks.length ? "No active tracks." : tab === "skin" ? "Start a skin journey." : "Add a supplement to follow."}</strong><p>{tab === "skin" ? "Group products and photos by area. Your first photo will be Day 1." : "Log when you take it and how you feel. Photos are optional."}</p>{!showTrackForm ? <button type="button" className="button button-primary" onClick={() => setShowTrackForm(true)}>＋ {tab === "skin" ? "New skin journey" : "Add supplement"}</button> : null}</div>}
      {pastTracks.length ? <details className="progress-past-tracks"><summary>Past journeys <span>{pastTracks.length}</span></summary><div className="progress-track-grid">{pastTracks.map((track) => <button type="button" className="progress-track-card" key={track.id} onClick={() => setSelectedId(track.id)}><span className="progress-card-photo"><span>↺</span></span><span className="progress-card-body"><small>PAST</small><strong>{track.name}</strong><span>{track.products.map((product) => product.name).join(" · ")}</span></span><span className="progress-card-arrow" aria-hidden="true">→</span></button>)}</div></details> : null}
    </>}
  </section>;
}
