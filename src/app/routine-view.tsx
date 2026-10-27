"use client";

/* Product photos can be hosted shop images or private uploads. */
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { ageLabel, formatDate, makeId, RoutineConcern, RoutineData, RoutinePhase, RoutineProduct, RoutineSlot, TrackedItem } from "@/lib/tracker";

type Props = { data: RoutineData; onChange: (next: RoutineData) => void; items: TrackedItem[] };
const today = () => new Date().toLocaleDateString("en-CA");

function elapsed(start?: string) {
  if (!start) return "Start date not added";
  if (start === today()) return "Started today";
  return `Using for ${ageLabel(start).toLowerCase()}`;
}

function targetPassed(phase: RoutinePhase) {
  if (!phase.startDate || !phase.targetDuration || !phase.targetUnit) return false;
  const due = new Date(`${phase.startDate}T12:00:00`);
  if (phase.targetUnit === "weeks") due.setDate(due.getDate() + phase.targetDuration * 7);
  else {
    const day = due.getDate();
    due.setDate(1);
    due.setMonth(due.getMonth() + phase.targetDuration);
    const lastDay = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
    due.setDate(Math.min(day, lastDay));
  }
  return due.getTime() <= Date.now();
}

function itemPhoto(item?: TrackedItem) { return item?.productPhoto || item?.currentProduct?.imageUrl; }

export function RoutineView({ data, onChange, items }: Props) {
  const [addingSlot, setAddingSlot] = useState<RoutineSlot | null>(null);
  const [replacing, setReplacing] = useState<RoutinePhase | null>(null);
  const [productSource, setProductSource] = useState<"library" | "new">("new");
  const [linkedChoice, setLinkedChoice] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [productName, setProductName] = useState("");
  const [productBrand, setProductBrand] = useState("");
  const [productPhoto, setProductPhoto] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [concernForm, setConcernForm] = useState(false);
  const [concernName, setConcernName] = useState("");
  const [concernNotes, setConcernNotes] = useState("");
  const [routineError, setRoutineError] = useState("");
  const [editingConcernId, setEditingConcernId] = useState<string | null>(null);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const currentPhases = data.phases.filter((phase) => !phase.endDate);
  const phasesBySlot = (slot: RoutineSlot) => currentPhases.filter((phase) => phase.slot === slot).sort((a, b) => a.position - b.position);
  const openForm = (slot: RoutineSlot, replace?: RoutinePhase) => {
    setAddingSlot(slot); setReplacing(replace ?? null); setProductSource(items.length ? "library" : "new"); setLinkedChoice(""); setLibrarySearch(""); setProductName(""); setProductBrand(""); setProductPhoto(""); setPhotoError(""); setRoutineError("");
  };
  const closeForm = () => { setAddingSlot(null); setReplacing(null); setRoutineError(""); };

  function readPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setPhotoError("");
    if (!file) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/) || file.size > 1_000_000) { setPhotoError("Choose a JPG, PNG, or WebP under 1 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setProductPhoto(String(reader.result));
    reader.onerror = () => setPhotoError("That photo could not be opened.");
    reader.readAsDataURL(file);
  }

  function savePhase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!addingSlot) return;
    const form = new FormData(event.currentTarget);
    const selectedItem = productSource === "library" && linkedChoice ? itemById.get(linkedChoice) : undefined;
    const name = selectedItem?.name ?? productName.trim();
    if (!name) { setRoutineError("Add a product name or choose one from your Library."); return; }
    const date = String(form.get("startDate") ?? "");
    const durationString = String(form.get("duration") ?? "").trim();
    const duration = durationString ? Number(durationString) : undefined;
    if (duration !== undefined && (!Number.isInteger(duration) || duration < 1 || duration > 1200)) { setRoutineError("Enter a duration from 1 to 1,200."); return; }
    let product: RoutineProduct;
    let products = data.products;
    if (selectedItem) {
      product = data.products.find((entry) => entry.linkedItemId === selectedItem.id) ?? { id: makeId(), linkedItemId: selectedItem.id, name: selectedItem.name, brand: selectedItem.brand };
      if (!data.products.some((entry) => entry.id === product.id)) products = [...data.products, product];
    } else {
      product = { id: makeId(), name, brand: productBrand.trim() || undefined, photo: productPhoto || undefined };
      products = [...data.products, product];
    }
    const position = replacing?.position ?? phasesBySlot(addingSlot).length;
    const stepId = replacing?.stepId ?? makeId();
    const phases = data.phases.map((phase) => replacing?.id === phase.id ? { ...phase, endDate: date || today() } : phase);
    const phase: RoutinePhase = { id: makeId(), stepId, productId: product.id, slot: addingSlot, position, startDate: date || undefined, targetDuration: duration, targetUnit: duration ? String(form.get("unit") || "weeks") as "weeks" | "months" : undefined, createdAt: new Date().toISOString() };
    onChange({ ...data, products, phases: [...phases, phase] });
    closeForm();
  }

  function movePhase(slot: RoutineSlot, id: string, direction: -1 | 1) {
    const ordered = phasesBySlot(slot);
    const index = ordered.findIndex((phase) => phase.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return;
    const first = ordered[index]; const second = ordered[nextIndex];
    onChange({ ...data, phases: data.phases.map((phase) => phase.id === first.id ? { ...phase, position: second.position } : phase.id === second.id ? { ...phase, position: first.position } : phase) });
  }

  function saveConcern(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = concernName.trim();
    if (!name) return;
    if (editingConcernId) {
      onChange({ ...data, concerns: data.concerns.map((concern) => concern.id === editingConcernId ? { ...concern, name, notes: concernNotes.trim() || undefined } : concern) });
    } else {
      const concern: RoutineConcern = { id: makeId(), name, notes: concernNotes.trim() || undefined, status: "current", createdAt: new Date().toISOString() };
      onChange({ ...data, concerns: [concern, ...data.concerns] });
    }
    setConcernName(""); setConcernNotes(""); setConcernForm(false); setEditingConcernId(null);
  }

  function editConcern(concern: RoutineConcern) { setEditingConcernId(concern.id); setConcernName(concern.name); setConcernNotes(concern.notes ?? ""); setConcernForm(true); }

  function setConcernStatus(concern: RoutineConcern, status: RoutineConcern["status"]) {
    onChange({ ...data, concerns: data.concerns.map((entry) => entry.id === concern.id ? { ...entry, status, resolvedAt: status === "resolved" ? today() : undefined } : entry) });
  }

  const history = data.phases.filter((phase) => Boolean(phase.endDate)).sort((a, b) => (b.endDate ?? "").localeCompare(a.endDate ?? ""));

  return <section className="routine-view" aria-labelledby="routine-title">
    <header className="routine-heading"><div><p className="eyebrow">YOUR DAILY PRACTICE</p><h1 id="routine-title">Routine<span className="period">.</span></h1><p className="routine-intro">Keep track of what you use, how long it stays, and what you want to work on.</p></div><span className="routine-mark" aria-hidden="true">AM<br />PM</span></header>

    <div className="routine-slots">
      {(["morning", "night"] as const).map((slot) => <section className="routine-slot" key={slot} aria-labelledby={`${slot}-routine-title`}>
        <div className="routine-slot-heading"><div><p className="eyebrow">{slot === "morning" ? "START THE DAY" : "WIND DOWN"}</p><h2 id={`${slot}-routine-title`}>{slot === "morning" ? "Morning" : "Night"}<span className="period">.</span></h2></div><button className="button button-outline" type="button" onClick={() => openForm(slot)}><span aria-hidden="true">＋</span> Add product</button></div>
        <ol className="routine-product-list">
          {phasesBySlot(slot).map((phase, index) => {
            const product = data.products.find((entry) => entry.id === phase.productId);
            const linked = product?.linkedItemId ? itemById.get(product.linkedItemId) : undefined;
            const photo = linked ? itemPhoto(linked) : product?.photo;
            const reached = targetPassed(phase);
            return <li className="routine-product-card" key={phase.id}>
              <span className="routine-order" aria-label={`Step ${index + 1}`}>{String(index + 1).padStart(2, "0")}</span>
              <div className="routine-product-image">{photo ? <img src={photo} alt="" /> : <span>{(linked?.name ?? product?.name ?? "?").slice(0, 1).toUpperCase()}</span>}</div>
              <div className="routine-product-copy"><h3>{linked?.name ?? product?.name ?? "Product"}</h3>{(linked?.brand ?? product?.brand) ? <p>{linked?.brand ?? product?.brand}</p> : null}<span>{elapsed(phase.startDate)}{phase.targetDuration && phase.targetUnit ? ` · plan ${phase.targetDuration} ${phase.targetUnit}` : ""}</span>{reached ? <strong className="routine-due">Your planned time is up</strong> : null}</div>
              <div className="routine-card-actions"><button className="text-button" type="button" onClick={() => movePhase(slot, phase.id, -1)} disabled={index === 0} aria-label="Move product up">↑</button><button className="text-button" type="button" onClick={() => movePhase(slot, phase.id, 1)} disabled={index === phasesBySlot(slot).length - 1} aria-label="Move product down">↓</button><button className="text-button" type="button" onClick={() => openForm(slot, phase)}>Switch</button></div>
            </li>;
          })}
          {!phasesBySlot(slot).length ? <li className="routine-empty">No products here yet. Add one whenever you’re ready.</li> : null}
        </ol>
        {addingSlot === slot ? <form className="routine-form" onSubmit={savePhase}>
          <div className="routine-form-heading"><strong>{replacing ? "Switch product" : `Add to ${slot}`}</strong><button className="text-button" type="button" onClick={closeForm}>Cancel</button></div>
          <div className="routine-source-switch" role="group" aria-label="Where is this product saved?"><button type="button" className={productSource === "library" ? "active" : ""} aria-pressed={productSource === "library"} onClick={() => { setProductSource("library"); setLinkedChoice(""); setRoutineError(""); }}>From Library</button><button type="button" className={productSource === "new" ? "active" : ""} aria-pressed={productSource === "new"} onClick={() => { setProductSource("new"); setLinkedChoice(""); setRoutineError(""); }}>New routine product</button></div>
          {productSource === "library" ? <div className="routine-library-picker"><label className="field"><span>Find a saved product</span><input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Search your Library" /></label>{linkedChoice ? (() => { const item = itemById.get(linkedChoice); return item ? <div className="routine-library-selected">{itemPhoto(item) ? <img src={itemPhoto(item)} alt="" /> : <span>{item.name.slice(0, 1).toUpperCase()}</span>}<strong>{item.name}{item.brand ? <small>{item.brand}</small> : null}</strong><button type="button" className="text-button" onClick={() => setLinkedChoice("")}>Change</button></div> : null; })() : <div className="routine-library-options">{items.filter((item) => `${item.name} ${item.brand ?? ""} ${item.category ?? ""}`.toLowerCase().includes(librarySearch.trim().toLowerCase())).map((item) => <button key={item.id} type="button" className="routine-library-option" onClick={() => { setLinkedChoice(item.id); setRoutineError(""); }}>{itemPhoto(item) ? <img src={itemPhoto(item)} alt="" /> : <span>{item.name.slice(0, 1).toUpperCase()}</span>}<strong>{item.name}{item.brand ? <small>{item.brand}</small> : null}</strong><span aria-hidden="true">→</span></button>)}{!items.length ? <p className="routine-empty">Your Library is empty. Choose “New routine product” to add one here.</p> : null}</div>}</div> : <><label className="field"><span>Product name <b>REQUIRED</b></span><input value={productName} maxLength={160} onChange={(event) => setProductName(event.target.value)} placeholder="e.g. Gentle cleanser" required /></label><div className="field-pair"><label className="field"><span>Brand</span><input value={productBrand} maxLength={100} onChange={(event) => setProductBrand(event.target.value)} placeholder="Optional" /></label><label className="field"><span>Photo</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={readPhoto} /></label></div>{photoError ? <p className="form-error" role="alert">{photoError}</p> : null}</>}
          <div className="field-pair"><label className="field"><span>Start date</span><input type="date" name="startDate" defaultValue={today()} /></label><label className="field"><span>Plan to use for <b>OPTIONAL</b></span><div className="routine-duration"><input type="number" name="duration" min="1" max="1200" inputMode="numeric" placeholder="e.g. 8" /><select name="unit" aria-label="Duration unit"><option value="weeks">weeks</option><option value="months">months</option></select></div></label></div>
          {routineError ? <p className="form-error" role="alert">{routineError}</p> : null}<div className="routine-form-actions"><span>Your past use stays in the timeline.</span><button className="button button-primary" type="submit">{replacing ? "Switch product" : "Add to routine"}</button></div>
        </form> : null}
      </section>)}
    </div>

    <section className="routine-history" aria-labelledby="routine-history-title"><div className="routine-section-heading"><div><p className="eyebrow">WHAT YOU’VE USED</p><h2 id="routine-history-title">Past routine<span className="period">.</span></h2></div></div>{history.length ? <ol className="routine-history-list">{history.map((phase) => { const product = data.products.find((entry) => entry.id === phase.productId); const linked = product?.linkedItemId ? itemById.get(product.linkedItemId) : undefined; const photo = linked ? itemPhoto(linked) : product?.photo; return <li key={phase.id}><div className="routine-history-image">{photo ? <img src={photo} alt="" /> : <span>{(linked?.name ?? product?.name ?? "?").slice(0, 1).toUpperCase()}</span>}</div><div><strong>{linked?.name ?? product?.name ?? "Product"}</strong><span>{phase.slot === "morning" ? "Morning" : "Night"} · {formatDate(phase.startDate)} – {formatDate(phase.endDate)}</span></div></li>; })}</ol> : <p className="routine-empty">When you switch a product, its time here will be saved.</p>}</section>

    <section className="routine-concerns" aria-labelledby="routine-concerns-title"><div className="routine-section-heading"><div><p className="eyebrow">A SEPARATE LIST</p><h2 id="routine-concerns-title">Things on my mind<span className="period">.</span></h2><p>Keep concerns separate from the products you use.</p></div>{!concernForm ? <button className="button button-outline" type="button" onClick={() => setConcernForm(true)}><span aria-hidden="true">＋</span> Add concern</button> : null}</div>
      {concernForm ? <form className="routine-form concern-form" onSubmit={saveConcern}><div className="routine-form-heading"><strong>{editingConcernId ? "Edit concern" : "New concern"}</strong><button className="text-button" type="button" onClick={() => { setConcernForm(false); setEditingConcernId(null); }}>Cancel</button></div><label className="field"><span>What are you noticing?</span><input value={concernName} maxLength={160} onChange={(event) => setConcernName(event.target.value)} placeholder="e.g. Dryness" required /></label><label className="field"><span>Notes <b>OPTIONAL</b></span><textarea value={concernNotes} maxLength={2000} onChange={(event) => setConcernNotes(event.target.value)} placeholder="Anything you want to remember…" /></label><button className="button button-primary" type="submit">Save concern</button></form> : null}
      <ul className="concern-list">{data.concerns.filter((concern) => concern.status === "current").map((concern) => <li key={concern.id}><div><strong>{concern.name}</strong>{concern.notes ? <p>{concern.notes}</p> : null}</div><div className="concern-actions"><button className="text-button" type="button" onClick={() => editConcern(concern)}>Edit</button><button className="text-button" type="button" onClick={() => setConcernStatus(concern, "resolved")}>Mark resolved</button></div></li>)}</ul>
      {!data.concerns.some((concern) => concern.status === "current") && !concernForm ? <p className="routine-empty">No current concerns recorded.</p> : null}
      {data.concerns.some((concern) => concern.status === "resolved") ? <details className="resolved-concerns"><summary>Past concerns <span>{data.concerns.filter((concern) => concern.status === "resolved").length}</span></summary><ul className="concern-list">{data.concerns.filter((concern) => concern.status === "resolved").map((concern) => <li key={concern.id}><div><strong>{concern.name}</strong>{concern.notes ? <p>{concern.notes}</p> : null}<small>Resolved {formatDate(concern.resolvedAt)}</small></div><div className="concern-actions"><button className="text-button" type="button" onClick={() => editConcern(concern)}>Edit</button><button className="text-button" type="button" onClick={() => setConcernStatus(concern, "current")}>Reopen</button></div></li>)}</ul></details> : null}
    </section>
  </section>;
}
