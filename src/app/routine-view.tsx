"use client";

/* Product photos can be hosted shop images or private uploads. */
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, FormEvent, ReactNode, useMemo, useState } from "react";
import { formatDate, makeId, RoutineConcern, RoutineData, RoutinePhase, RoutineProduct, RoutineSlot, TrackedItem } from "@/lib/tracker";

type Props = { data: RoutineData; onChange: (next: RoutineData) => void; items: TrackedItem[] };
const today = () => new Date().toLocaleDateString("en-CA");

function elapsed(start?: string) {
  if (!start) return "Start date not added";
  const [year, month, day] = start.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (!year || !month || !day || Number.isNaN(parsed.getTime())) return "Start date not added";
  const now = new Date();
  const startDay = Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const currentDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((currentDay - startDay) / 86_400_000);
  if (days < 0) return "Start date not added";
  if (days === 0) return "Started today";
  if (days < 7) return `Using for ${days} ${days === 1 ? "day" : "days"}`;
  const weeks = Math.floor(days / 7);
  return `Using for ${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}

function itemPhoto(item?: TrackedItem) { return item?.productPhoto || item?.currentProduct?.imageUrl; }

function RoutineManageMenu({ label, children }: { label: string; children: ReactNode }) {
  return <details className="manage-menu routine-manage-menu" onClick={(event) => { if ((event.target as HTMLElement).closest("button")) event.currentTarget.open = false; }}>
    <summary aria-label={`Manage ${label}`} title={`Manage ${label}`}>•••</summary>
    <div className="manage-menu-panel" role="group" aria-label={`${label} actions`}>{children}</div>
  </details>;
}

export function RoutineView({ data, onChange, items }: Props) {
  const [addingSlot, setAddingSlot] = useState<RoutineSlot | null>(null);
  const [replacing, setReplacing] = useState<RoutinePhase | null>(null);
  const [formMode, setFormMode] = useState<"add" | "switch" | "edit">("add");
  const [resettingSlot, setResettingSlot] = useState<RoutineSlot | null>(null);
  const [carryProductIds, setCarryProductIds] = useState<string[]>([]);
  const [catalogForm, setCatalogForm] = useState(false);
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [productSource, setProductSource] = useState<"library" | "routine" | "new">("new");
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
  const openForm = (slot: RoutineSlot, phase?: RoutinePhase, mode: "add" | "switch" | "edit" = "add") => {
    const existingProduct = phase ? data.products.find((product) => product.id === phase.productId) : undefined;
    setAddingSlot(slot); setReplacing(phase ?? null); setFormMode(mode);
    const linkedItemExists = Boolean(existingProduct?.linkedItemId && items.some((item) => item.id === existingProduct.linkedItemId));
    setProductSource(linkedItemExists ? "library" : mode === "add" && items.length ? "library" : mode === "add" && data.products.length ? "routine" : "new");
    setLinkedChoice(linkedItemExists ? existingProduct?.linkedItemId ?? "" : ""); setLibrarySearch(""); setProductName(existingProduct?.name ?? ""); setProductBrand(existingProduct?.brand ?? ""); setProductPhoto(existingProduct?.photo ?? ""); setPhotoError(""); setRoutineError("");
  };
  const closeForm = () => { setAddingSlot(null); setReplacing(null); setFormMode("add"); setRoutineError(""); };

  function openCatalogForm(product?: RoutineProduct) {
    const linked = product?.linkedItemId ? itemById.get(product.linkedItemId) : undefined;
    setCatalogForm(true);
    setEditingCatalogId(product?.id ?? null);
    setProductName(linked?.name ?? product?.name ?? "");
    setProductBrand(linked?.brand ?? product?.brand ?? "");
    setProductPhoto(product?.photo ?? (linked ? itemPhoto(linked) ?? "" : ""));
    setPhotoError(""); setRoutineError("");
  }

  function saveCatalogProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = productName.trim();
    if (!name) { setRoutineError("Add a product name first."); return; }
    const product: RoutineProduct = {
      id: editingCatalogId ?? makeId(), name, brand: productBrand.trim() || undefined,
      photo: productPhoto || undefined,
    };
    onChange({ ...data, products: editingCatalogId ? data.products.map((entry) => entry.id === editingCatalogId ? { ...entry, ...product, linkedItemId: undefined, photoPath: undefined } : entry) : [...data.products, product] });
    setCatalogForm(false); setEditingCatalogId(null); setProductName(""); setProductBrand(""); setProductPhoto(""); setRoutineError("");
  }

  function addCatalogProductToRoutine(product: RoutineProduct, slot: RoutineSlot) {
    if (phasesBySlot(slot).some((phase) => phase.productId === product.id)) return;
    const phase: RoutinePhase = { id: makeId(), stepId: makeId(), productId: product.id, slot, position: phasesBySlot(slot).length, startDate: today(), createdAt: new Date().toISOString() };
    onChange({ ...data, phases: [...data.phases, phase] });
  }

  function removeFromRoutine(phase: RoutinePhase) {
    const rest = phasesBySlot(phase.slot).filter((entry) => entry.id !== phase.id);
    const positions = new Map(rest.map((entry, index) => [entry.id, index]));
    onChange({ ...data, phases: data.phases.map((entry) => entry.id === phase.id ? { ...entry, endDate: today() } : positions.has(entry.id) ? { ...entry, position: positions.get(entry.id)! } : entry) });
  }

  function deleteCatalogProduct(productId: string) {
    onChange({ ...data, products: data.products.filter((product) => product.id !== productId), phases: data.phases.filter((phase) => phase.productId !== productId) });
    setConfirmDeleteId(null);
  }

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
    const selectedRoutineProduct = productSource === "routine" && linkedChoice ? data.products.find((entry) => entry.id === linkedChoice) : undefined;
    const name = selectedItem?.name ?? selectedRoutineProduct?.name ?? productName.trim();
    if (!name) { setRoutineError("Add a product name or choose one from your Library."); return; }
    const date = String(form.get("startDate") ?? "");
    const existingProduct = replacing ? data.products.find((entry) => entry.id === replacing.productId) : undefined;
    let product: RoutineProduct;
    let products = data.products;
    if (selectedRoutineProduct) {
      product = selectedRoutineProduct;
    } else if (selectedItem) {
      product = formMode === "edit" && existingProduct
        ? { ...existingProduct, linkedItemId: selectedItem.id, name: selectedItem.name, brand: selectedItem.brand, photo: undefined }
        : data.products.find((entry) => entry.linkedItemId === selectedItem.id) ?? { id: makeId(), linkedItemId: selectedItem.id, name: selectedItem.name, brand: selectedItem.brand };
      if (formMode === "edit" && existingProduct) products = products.map((entry) => entry.id === existingProduct.id ? product : entry);
      else if (!data.products.some((entry) => entry.id === product.id)) products = [...products, product];
    } else {
      product = formMode === "edit" && existingProduct
        ? { ...existingProduct, linkedItemId: undefined, name, brand: productBrand.trim() || undefined, photo: productPhoto || undefined }
        : { id: makeId(), name, brand: productBrand.trim() || undefined, photo: productPhoto || undefined };
      products = formMode === "edit" && existingProduct ? products.map((entry) => entry.id === existingProduct.id ? product : entry) : [...products, product];
    }
    if (formMode === "edit" && replacing) {
      const endDate = String(form.get("endDate") ?? "");
      if (replacing.endDate && !endDate) { setRoutineError("Keep an end date so this past period stays in your history."); return; }
      if (endDate && date && endDate < date) { setRoutineError("The end date must be after the start date."); return; }
      onChange({ ...data, products, phases: data.phases.map((phase) => phase.id === replacing.id ? { ...phase, productId: product.id, startDate: date || undefined, ...(phase.endDate ? { endDate: endDate || undefined } : {}) } : phase) });
      closeForm();
      return;
    }
    const position = replacing?.position ?? phasesBySlot(addingSlot).length;
    const stepId = replacing?.stepId ?? makeId();
    const phases = data.phases.map((phase) => replacing?.id === phase.id ? { ...phase, endDate: date || today() } : phase);
    const phase: RoutinePhase = { id: makeId(), stepId, productId: product.id, slot: addingSlot, position, startDate: date || undefined, createdAt: new Date().toISOString() };
    onChange({ ...data, products, phases: [...phases, phase] });
    closeForm();
  }

  function beginNewRoutine(slot: RoutineSlot) {
    const current = phasesBySlot(slot);
    setResettingSlot(slot);
    setCarryProductIds(current.map((phase) => phase.productId));
    setAddingSlot(null); setReplacing(null); setRoutineError("");
  }

  function startNewRoutine() {
    if (!resettingSlot) return;
    const slot = resettingSlot;
    const oldPhases = phasesBySlot(slot);
    const date = today();
    const carried = oldPhases.filter((phase) => carryProductIds.includes(phase.productId));
    const ended = data.phases.map((phase) => oldPhases.some((old) => old.id === phase.id) ? { ...phase, endDate: date } : phase);
    const nextPhases = carried.map((phase, index): RoutinePhase => ({
      id: makeId(), stepId: phase.stepId, productId: phase.productId, slot,
      position: index, startDate: date, createdAt: new Date().toISOString(),
    }));
    onChange({ ...data, phases: [...ended, ...nextPhases] });
    setResettingSlot(null); setCarryProductIds([]);
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
        <div className="routine-slot-heading"><div><p className="eyebrow">{slot === "morning" ? "START THE DAY" : "WIND DOWN"}</p><h2 id={`${slot}-routine-title`}>{slot === "morning" ? "Morning" : "Night"}<span className="period">.</span></h2></div><div className="routine-slot-buttons"><button className="button button-outline" type="button" onClick={() => openForm(slot)}><span aria-hidden="true">＋</span> Add product</button><button className="text-button routine-reset-button" type="button" onClick={() => beginNewRoutine(slot)}>Start new routine</button></div></div>
        {resettingSlot === slot ? <section className="routine-reset-panel" aria-label={`Start a new ${slot} routine`}><div className="routine-form-heading"><strong>Start a new {slot} routine</strong><button className="text-button" type="button" onClick={() => setResettingSlot(null)}>Cancel</button></div><p>Choose any products to carry forward. Unchecked products will move to past routine.</p>{phasesBySlot(slot).length ? <fieldset><legend>Keep these products</legend>{phasesBySlot(slot).map((phase) => { const product = data.products.find((entry) => entry.id === phase.productId); const linked = product?.linkedItemId ? itemById.get(product.linkedItemId) : undefined; const photo = linked ? itemPhoto(linked) : product?.photo; return <label className="routine-carry-choice" key={phase.id}><input type="checkbox" checked={carryProductIds.includes(phase.productId)} onChange={(event) => setCarryProductIds((current) => event.target.checked ? [...new Set([...current, phase.productId])] : current.filter((id) => id !== phase.productId))} />{photo ? <img src={photo} alt="" /> : <span>{(linked?.name ?? product?.name ?? "?").slice(0, 1).toUpperCase()}</span>}<strong>{linked?.name ?? product?.name ?? "Product"}{(linked?.brand ?? product?.brand) ? <small>{linked?.brand ?? product?.brand}</small> : null}</strong></label>; })}</fieldset> : <p className="routine-empty">There are no current products to carry forward.</p>}<button className="button button-primary" type="button" onClick={startNewRoutine}>Move to past and start new</button></section> : null}
        <ol className="routine-product-list">
          {phasesBySlot(slot).map((phase, index) => {
            const product = data.products.find((entry) => entry.id === phase.productId);
            const linked = product?.linkedItemId ? itemById.get(product.linkedItemId) : undefined;
            const photo = linked ? itemPhoto(linked) : product?.photo;
            return <li className="routine-product-card" key={phase.id}>
              <span className="routine-order" aria-label={`Step ${index + 1}`}>{String(index + 1).padStart(2, "0")}</span>
              <div className="routine-product-image">{photo ? <img src={photo} alt="" /> : <span>{(linked?.name ?? product?.name ?? "?").slice(0, 1).toUpperCase()}</span>}</div>
              <div className="routine-product-copy"><h3>{linked?.name ?? product?.name ?? "Product"}</h3>{(linked?.brand ?? product?.brand) ? <p>{linked?.brand ?? product?.brand}</p> : null}<span>{elapsed(phase.startDate)}</span></div>
              <RoutineManageMenu label={linked?.name ?? product?.name ?? "routine product"}><button type="button" disabled={index === 0} onClick={() => movePhase(slot, phase.id, -1)}>Move earlier</button><button type="button" disabled={index === phasesBySlot(slot).length - 1} onClick={() => movePhase(slot, phase.id, 1)}>Move later</button><button type="button" onClick={() => openForm(slot, phase, "edit")}>Edit routine details</button><button type="button" onClick={() => openForm(slot, phase, "switch")}>Switch product</button><button type="button" className="danger-action" onClick={() => removeFromRoutine(phase)}>Remove from routine</button></RoutineManageMenu>
            </li>;
          })}
          {!phasesBySlot(slot).length ? <li className="routine-empty">No products here yet. Add one whenever you’re ready.</li> : null}
        </ol>
        {addingSlot === slot ? <form className="routine-form" onSubmit={savePhase}>
          <div className="routine-form-heading"><strong>{formMode === "edit" ? "Edit routine product" : formMode === "switch" ? "Switch product" : `Add to ${slot}`}</strong><button className="text-button" type="button" onClick={closeForm}>Cancel</button></div>
          <div className={`routine-source-switch ${data.products.length ? "has-three" : ""}`} role="group" aria-label="Where is this product saved?"><button type="button" className={productSource === "library" ? "active" : ""} aria-pressed={productSource === "library"} onClick={() => { setProductSource("library"); setLinkedChoice(""); setRoutineError(""); }}>From Library</button>{data.products.length ? <button type="button" className={productSource === "routine" ? "active" : ""} aria-pressed={productSource === "routine"} onClick={() => { setProductSource("routine"); setLinkedChoice(""); setRoutineError(""); }}>Already in Routine</button> : null}<button type="button" className={productSource === "new" ? "active" : ""} aria-pressed={productSource === "new"} onClick={() => { setProductSource("new"); setLinkedChoice(""); setRoutineError(""); }}>New product</button></div>
          {productSource === "library" ? <div className="routine-library-picker"><label className="field"><span>Find a saved product</span><input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Search your Library" /></label>{linkedChoice ? (() => { const item = itemById.get(linkedChoice); return item ? <div className="routine-library-selected">{itemPhoto(item) ? <img src={itemPhoto(item)} alt="" /> : <span>{item.name.slice(0, 1).toUpperCase()}</span>}<strong>{item.name}{item.brand ? <small>{item.brand}</small> : null}</strong><button type="button" className="text-button" onClick={() => setLinkedChoice("")}>Change</button></div> : null; })() : <div className="routine-library-options">{items.filter((item) => `${item.name} ${item.brand ?? ""} ${item.category ?? ""}`.toLowerCase().includes(librarySearch.trim().toLowerCase())).map((item) => <button key={item.id} type="button" className="routine-library-option" onClick={() => { setLinkedChoice(item.id); setRoutineError(""); }}>{itemPhoto(item) ? <img src={itemPhoto(item)} alt="" /> : <span>{item.name.slice(0, 1).toUpperCase()}</span>}<strong>{item.name}{item.brand ? <small>{item.brand}</small> : null}</strong><span aria-hidden="true">→</span></button>)}{!items.length ? <p className="routine-empty">Your Library is empty. Choose “New product” to add one here.</p> : null}</div>}</div> : productSource === "routine" ? <div className="routine-library-picker"><label className="field"><span>Find an existing routine product</span><input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Search saved routine products" /></label>{linkedChoice && data.products.some((product) => product.id === linkedChoice) ? (() => { const product = data.products.find((entry) => entry.id === linkedChoice)!; const linked = product.linkedItemId ? itemById.get(product.linkedItemId) : undefined; const photo = linked ? itemPhoto(linked) : product.photo; return <div className="routine-library-selected">{photo ? <img src={photo} alt="" /> : <span>{product.name.slice(0, 1).toUpperCase()}</span>}<strong>{linked?.name ?? product.name}{(linked?.brand ?? product.brand) ? <small>{linked?.brand ?? product.brand}</small> : null}</strong><button type="button" className="text-button" onClick={() => setLinkedChoice("")}>Change</button></div>; })() : <div className="routine-library-options">{data.products.filter((product) => !phasesBySlot(addingSlot).some((phase) => phase.productId === product.id && phase.id !== replacing?.id) && `${product.name} ${product.brand ?? ""}`.toLowerCase().includes(librarySearch.trim().toLowerCase())).map((product) => { const linked = product.linkedItemId ? itemById.get(product.linkedItemId) : undefined; const photo = linked ? itemPhoto(linked) : product.photo; return <button key={product.id} type="button" className="routine-library-option" onClick={() => { setLinkedChoice(product.id); setRoutineError(""); }}>{photo ? <img src={photo} alt="" /> : <span>{(linked?.name ?? product.name).slice(0, 1).toUpperCase()}</span>}<strong>{linked?.name ?? product.name}{(linked?.brand ?? product.brand) ? <small>{linked?.brand ?? product.brand}</small> : null}</strong><span aria-hidden="true">→</span></button>; })}</div>}</div> : <><label className="field"><span>Product name <b>REQUIRED</b></span><input value={productName} maxLength={160} onChange={(event) => setProductName(event.target.value)} placeholder="e.g. Gentle cleanser" required /></label><div className="field-pair"><label className="field"><span>Brand</span><input value={productBrand} maxLength={100} onChange={(event) => setProductBrand(event.target.value)} placeholder="Optional" /></label><label className="field"><span>Photo</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={readPhoto} /></label></div>{photoError ? <p className="form-error" role="alert">{photoError}</p> : null}</>}
          <div className="field-pair"><label className="field"><span>Start date</span><input type="date" name="startDate" defaultValue={replacing?.startDate ?? today()} /></label>{formMode === "edit" && replacing?.endDate ? <label className="field"><span>End date</span><input type="date" name="endDate" defaultValue={replacing.endDate} /></label> : null}</div>
          {routineError ? <p className="form-error" role="alert">{routineError}</p> : null}<div className="routine-form-actions"><span>{formMode === "edit" ? "Update details for this routine step." : "Your past use stays in the timeline."}</span><button className="button button-primary" type="submit">{formMode === "edit" ? "Save changes" : formMode === "switch" ? "Switch product" : "Add to routine"}</button></div>
        </form> : null}
      </section>)}
    </div>

    <section className="routine-catalog" aria-labelledby="routine-catalog-title">
      <div className="routine-section-heading"><div><p className="eyebrow">SAVED FOR LATER</p><h2 id="routine-catalog-title">Routine products<span className="period">.</span></h2><p>Add your usual products once, then add them to Morning or Night with one tap.</p></div>{!catalogForm ? <button className="button button-outline" type="button" onClick={() => openCatalogForm()}><span aria-hidden="true">＋</span> Add product</button> : null}</div>
      {catalogForm ? <form className="routine-form catalog-form" onSubmit={saveCatalogProduct}><div className="routine-form-heading"><strong>{editingCatalogId ? "Edit saved product" : "Save product for later"}</strong><button className="text-button" type="button" onClick={() => { setCatalogForm(false); setEditingCatalogId(null); setRoutineError(""); }}>Cancel</button></div><label className="field"><span>Product name <b>REQUIRED</b></span><input value={productName} maxLength={160} onChange={(event) => setProductName(event.target.value)} placeholder="e.g. Azelaic acid" required /></label><div className="field-pair"><label className="field"><span>Brand</span><input value={productBrand} maxLength={100} onChange={(event) => setProductBrand(event.target.value)} placeholder="Optional" /></label><label className="field"><span>Photo</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={readPhoto} /></label></div>{photoError ? <p className="form-error" role="alert">{photoError}</p> : null}{productPhoto ? <div className="catalog-photo-preview"><img src={productPhoto} alt="Selected product" /><button className="text-button" type="button" onClick={() => setProductPhoto("")}>Remove photo</button></div> : null}{routineError ? <p className="form-error" role="alert">{routineError}</p> : null}<button className="button button-primary" type="submit">{editingCatalogId ? "Save changes" : "Save to product list"}</button></form> : null}
      {data.products.length ? <ul className="routine-catalog-list">{data.products.map((product) => { const linked = product.linkedItemId ? itemById.get(product.linkedItemId) : undefined; const photo = linked ? itemPhoto(linked) : product.photo; const inMorning = phasesBySlot("morning").some((phase) => phase.productId === product.id); const inNight = phasesBySlot("night").some((phase) => phase.productId === product.id); return <li className="routine-catalog-card" key={product.id}><div className="routine-product-image">{photo ? <img src={photo} alt="" /> : <span>{(linked?.name ?? product.name).slice(0, 1).toUpperCase()}</span>}</div><div className="routine-product-copy"><h3>{linked?.name ?? product.name}</h3>{(linked?.brand ?? product.brand) ? <p>{linked?.brand ?? product.brand}</p> : null}{inMorning || inNight ? <span>In {inMorning && inNight ? "Morning and Night" : inMorning ? "Morning" : "Night"}</span> : <span>Not in a routine right now</span>}</div><div className="routine-catalog-actions"><button className="button button-outline" type="button" disabled={inMorning} onClick={() => addCatalogProductToRoutine(product, "morning")}>{inMorning ? "In Morning" : "+ Morning"}</button><button className="button button-outline" type="button" disabled={inNight} onClick={() => addCatalogProductToRoutine(product, "night")}>{inNight ? "In Night" : "+ Night"}</button><RoutineManageMenu label={linked?.name ?? product.name}><button type="button" onClick={() => openCatalogForm(product)}>Edit saved product</button><button type="button" className="danger-action" onClick={() => setConfirmDeleteId(product.id)}>Delete product</button></RoutineManageMenu></div>{confirmDeleteId === product.id ? <div className="catalog-delete-confirm" role="group" aria-label={`Delete ${product.name}`}><span>Delete this product and its past routine history?</span><button className="text-button" type="button" onClick={() => setConfirmDeleteId(null)}>Cancel</button><button className="text-button" type="button" onClick={() => deleteCatalogProduct(product.id)}>Delete product</button></div> : null}</li>; })}</ul> : <p className="routine-empty">Your saved product list is empty. Add your products here once and reuse them whenever you need.</p>}
    </section>

    <section className="routine-history" aria-labelledby="routine-history-title"><div className="routine-section-heading"><div><p className="eyebrow">WHAT YOU’VE USED</p><h2 id="routine-history-title">Past routine<span className="period">.</span></h2></div></div>{history.length ? <ol className="routine-history-list">{history.map((phase) => { const product = data.products.find((entry) => entry.id === phase.productId); const linked = product?.linkedItemId ? itemById.get(product.linkedItemId) : undefined; const photo = linked ? itemPhoto(linked) : product?.photo; return <li key={phase.id}><div className="routine-history-image">{photo ? <img src={photo} alt="" /> : <span>{(linked?.name ?? product?.name ?? "?").slice(0, 1).toUpperCase()}</span>}</div><div><strong>{linked?.name ?? product?.name ?? "Product"}</strong><span>{phase.slot === "morning" ? "Morning" : "Night"} · {formatDate(phase.startDate)} – {formatDate(phase.endDate)}</span></div><button className="text-button" type="button" onClick={() => openForm(phase.slot, phase, "edit")}>Edit</button></li>; })}</ol> : <p className="routine-empty">When you switch a product, its time here will be saved.</p>}</section>

    <section className="routine-concerns" aria-labelledby="routine-concerns-title"><div className="routine-section-heading"><div><p className="eyebrow">A SEPARATE LIST</p><h2 id="routine-concerns-title">Things on my mind<span className="period">.</span></h2><p>Keep concerns separate from the products you use.</p></div>{!concernForm ? <button className="button button-outline" type="button" onClick={() => setConcernForm(true)}><span aria-hidden="true">＋</span> Add concern</button> : null}</div>
      {concernForm ? <form className="routine-form concern-form" onSubmit={saveConcern}><div className="routine-form-heading"><strong>{editingConcernId ? "Edit concern" : "New concern"}</strong><button className="text-button" type="button" onClick={() => { setConcernForm(false); setEditingConcernId(null); }}>Cancel</button></div><label className="field"><span>What are you noticing?</span><input value={concernName} maxLength={160} onChange={(event) => setConcernName(event.target.value)} placeholder="e.g. Dryness" required /></label><label className="field"><span>Notes <b>OPTIONAL</b></span><textarea value={concernNotes} maxLength={2000} onChange={(event) => setConcernNotes(event.target.value)} placeholder="Anything you want to remember…" /></label><button className="button button-primary" type="submit">Save concern</button></form> : null}
      <ul className="concern-list">{data.concerns.filter((concern) => concern.status === "current").map((concern) => <li key={concern.id}><div><strong>{concern.name}</strong>{concern.notes ? <p>{concern.notes}</p> : null}</div><RoutineManageMenu label={concern.name}><button type="button" onClick={() => editConcern(concern)}>Edit concern</button><button type="button" onClick={() => setConcernStatus(concern, "resolved")}>Mark resolved</button></RoutineManageMenu></li>)}</ul>
      {!data.concerns.some((concern) => concern.status === "current") && !concernForm ? <p className="routine-empty">No current concerns recorded.</p> : null}
      {data.concerns.some((concern) => concern.status === "resolved") ? <details className="resolved-concerns"><summary>Past concerns <span>{data.concerns.filter((concern) => concern.status === "resolved").length}</span></summary><ul className="concern-list">{data.concerns.filter((concern) => concern.status === "resolved").map((concern) => <li key={concern.id}><div><strong>{concern.name}</strong>{concern.notes ? <p>{concern.notes}</p> : null}<small>Resolved {formatDate(concern.resolvedAt)}</small></div><RoutineManageMenu label={concern.name}><button type="button" onClick={() => editConcern(concern)}>Edit concern</button><button type="button" onClick={() => setConcernStatus(concern, "current")}>Reopen concern</button></RoutineManageMenu></li>)}</ul></details> : null}
    </section>
  </section>;
}
