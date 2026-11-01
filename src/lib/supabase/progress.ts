import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_PROGRESS_DATA, ProgressCatalogProduct, ProgressData, ProgressPhoto, ProgressTrack, validProgressData } from "@/lib/tracker";

const PHOTO_BUCKET = "product-photos";

type TrackRow = { id: string; kind: ProgressTrack["kind"]; name: string; areas: string[]; started_on: string | null; notes: string | null; status: ProgressTrack["status"]; created_at: string };
type ProductRow = { id: string; track_id: string; name: string; brand: string | null; linked_item_id: string | null; linked_routine_product_id: string | null; catalog_product_id: string | null; dose: string | null; created_at: string };
type CatalogRow = { id: string; kind: "skin" | "supplement"; name: string; brand: string | null; photo_path: string | null; created_at: string };
type PhotoRow = { id: string; track_id: string; photo_path: string; captured_on: string; note: string | null; period_days: number | null; usage_counts: Record<string, number> | null; created_at: string };
type CheckInRow = { id: string; track_id: string; product_id: string; checkin_date: string; used: boolean; feeling: string | null; note: string | null; created_at: string };

export async function loadProgressData(client: SupabaseClient, userId: string): Promise<ProgressData> {
  const [tracksResult, productsResult, photosResult, checkInsResult, catalogResult] = await Promise.all([
    client.from("progress_tracks").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    client.from("progress_products").select("*").eq("user_id", userId),
    client.from("progress_photos").select("*").eq("user_id", userId).order("captured_on", { ascending: true }),
    client.from("progress_checkins").select("*").eq("user_id", userId).order("checkin_date", { ascending: true }),
    client.from("progress_catalog_products").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
  ]);
  for (const result of [tracksResult, productsResult, photosResult, checkInsResult, catalogResult]) if (result.error) throw result.error;
  const tracks = (tracksResult.data ?? []) as TrackRow[];
  const products = (productsResult.data ?? []) as ProductRow[];
  const photoRows = (photosResult.data ?? []) as PhotoRow[];
  const checkIns = (checkInsResult.data ?? []) as CheckInRow[];
  const catalog = (catalogResult.data ?? []) as CatalogRow[];
  const hydratedCatalog = await Promise.all(catalog.map(async (product) => {
    if (!product.photo_path?.startsWith(`${userId}/`)) return { ...product, url: undefined };
    const { data } = await client.storage.from(PHOTO_BUCKET).createSignedUrl(product.photo_path, 60 * 60);
    return { ...product, url: data?.signedUrl };
  }));
  const hydratedPhotos = await Promise.all(photoRows.map(async (photo) => {
    if (!photo.photo_path.startsWith(`${userId}/`)) return { ...photo, url: undefined };
    const { data } = await client.storage.from(PHOTO_BUCKET).createSignedUrl(photo.photo_path, 60 * 60);
    return { ...photo, url: data?.signedUrl };
  }));
  const data: ProgressData = { catalog: hydratedCatalog.map((product): ProgressCatalogProduct => ({ id: product.id, kind: product.kind, name: product.name, brand: product.brand ?? undefined, photo: product.url, photoPath: product.photo_path ?? undefined, createdAt: product.created_at })), tracks: tracks.map((track) => ({
    id: track.id, kind: track.kind, name: track.name, areas: track.areas ?? [], startedOn: track.started_on ?? undefined,
    notes: track.notes ?? undefined, status: track.status, createdAt: track.created_at,
    products: products.filter((product) => product.track_id === track.id).map((product) => ({
      id: product.id, name: product.name, brand: product.brand ?? undefined, linkedItemId: product.linked_item_id ?? undefined,
      linkedRoutineProductId: product.linked_routine_product_id ?? undefined, catalogProductId: product.catalog_product_id ?? undefined, dose: product.dose ?? undefined, createdAt: product.created_at,
    })),
    photos: hydratedPhotos.filter((photo) => photo.track_id === track.id).map((photo): ProgressPhoto => ({
      id: photo.id, date: photo.captured_on, photo: photo.url, photoPath: photo.photo_path, note: photo.note ?? undefined,
      periodDays: photo.period_days ?? undefined, usageCounts: photo.usage_counts ?? undefined, createdAt: photo.created_at,
    })),
    checkIns: checkIns.filter((entry) => entry.track_id === track.id).map((entry) => ({
      id: entry.id, productId: entry.product_id, date: entry.checkin_date, used: entry.used,
      feeling: entry.feeling ?? undefined, note: entry.note ?? undefined, createdAt: entry.created_at,
    })),
  })) };
  return validProgressData(data) ? data : EMPTY_PROGRESS_DATA;
}

async function uploadPhoto(client: SupabaseClient, userId: string, track: ProgressTrack, photo: ProgressPhoto) {
  if (!photo.photo?.startsWith("data:image/")) return photo.photoPath?.startsWith(`${userId}/`) ? photo.photoPath : undefined;
  const match = photo.photo.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
  if (!match) throw new Error("Progress photos must be JPG, PNG, or WebP images.");
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  const extension = match[1].split("/")[1].replace("jpeg", "jpg");
  const path = `${userId}/progress/${track.id}/${photo.id}.${extension}`;
  const { error } = await client.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: match[1], upsert: true });
  if (error) throw error;
  return path;
}

async function uploadCatalogPhoto(client: SupabaseClient, userId: string, product: ProgressCatalogProduct) {
  if (!product.photo?.startsWith("data:image/")) return product.photoPath?.startsWith(`${userId}/`) ? product.photoPath : undefined;
  const match = product.photo.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
  if (!match) throw new Error("Saved product photos must be JPG, PNG, or WebP after upload.");
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  const path = `${userId}/progress-products/${product.id}.jpg`;
  const { error } = await client.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: match[1], upsert: true });
  if (error) throw error;
  return path;
}

export async function syncProgressData(client: SupabaseClient, userId: string, previous: ProgressData, next: ProgressData): Promise<ProgressData> {
  const nextTrackIds = new Set(next.tracks.map((track) => track.id));
  const nextCatalog = next.catalog ?? [];
  const oldCatalog = previous.catalog ?? [];
  const catalogWithPaths = await Promise.all(nextCatalog.map(async (product) => ({ product, path: await uploadCatalogPhoto(client, userId, product) })));
  const allProducts = next.tracks.flatMap((track) => track.products.map((product) => ({ track, product })));
  const allPhotos = await Promise.all(next.tracks.flatMap((track) => track.photos.map(async (photo) => ({ track, photo, path: await uploadPhoto(client, userId, track, photo) }))));
  const allCheckIns = next.tracks.flatMap((track) => track.checkIns.map((entry) => ({ track, entry })));

  if (next.tracks.length) {
    const { error } = await client.from("progress_tracks").upsert(next.tracks.map((track) => ({
      id: track.id, user_id: userId, kind: track.kind, name: track.name, areas: track.areas, started_on: track.startedOn ?? null,
      notes: track.notes ?? null, status: track.status, created_at: track.createdAt,
    })));
    if (error) throw error;
  }
  if (catalogWithPaths.length) {
    const { error } = await client.from("progress_catalog_products").upsert(catalogWithPaths.map(({ product, path }) => ({
      id: product.id, user_id: userId, kind: product.kind, name: product.name, brand: product.brand ?? null,
      photo_path: path ?? product.photoPath ?? null, created_at: product.createdAt,
    })));
    if (error) throw error;
  }
  if (allProducts.length) {
    const { error } = await client.from("progress_products").upsert(allProducts.map(({ track, product }) => ({
      id: product.id, track_id: track.id, user_id: userId, name: product.name, brand: product.brand ?? null,
      linked_item_id: product.linkedItemId ?? null, linked_routine_product_id: product.linkedRoutineProductId ?? null,
      catalog_product_id: product.catalogProductId ?? null,
      dose: product.dose ?? null, created_at: product.createdAt,
    })));
    if (error) throw error;
  }
  if (allPhotos.length) {
    const { error } = await client.from("progress_photos").upsert(allPhotos.map(({ track, photo, path }) => ({
      id: photo.id, track_id: track.id, user_id: userId, photo_path: path ?? photo.photoPath ?? "", captured_on: photo.date,
      note: photo.note ?? null, period_days: photo.periodDays ?? null, usage_counts: photo.usageCounts ?? {}, created_at: photo.createdAt,
    })));
    if (error) throw error;
  }
  if (allCheckIns.length) {
    const { error } = await client.from("progress_checkins").upsert(allCheckIns.map(({ track, entry }) => ({
      id: entry.id, track_id: track.id, product_id: entry.productId, user_id: userId, checkin_date: entry.date,
      used: entry.used, feeling: entry.feeling ?? null, note: entry.note ?? null, created_at: entry.createdAt,
    })), { onConflict: "product_id,checkin_date" });
    if (error) throw error;
  }

  for (const oldTrack of previous.tracks) {
    const nextTrack = next.tracks.find((track) => track.id === oldTrack.id);
    if (!nextTrack) continue;
    const nextProductIds = new Set(nextTrack.products.map((product) => product.id));
    const removedProducts = oldTrack.products.filter((product) => !nextProductIds.has(product.id)).map((product) => product.id);
    if (removedProducts.length) {
      const { error } = await client.from("progress_products").delete().eq("user_id", userId).in("id", removedProducts);
      if (error) throw error;
    }
    const nextPhotoIds = new Set(nextTrack.photos.map((photo) => photo.id));
    const removedPhotos = oldTrack.photos.filter((photo) => !nextPhotoIds.has(photo.id));
    if (removedPhotos.length) {
      const { error } = await client.from("progress_photos").delete().eq("user_id", userId).in("id", removedPhotos.map((photo) => photo.id));
      if (error) throw error;
      const paths = removedPhotos.map((photo) => photo.photoPath).filter((path): path is string => Boolean(path));
      if (paths.length) await client.storage.from(PHOTO_BUCKET).remove(paths);
    }
    const nextCheckInIds = new Set(nextTrack.checkIns.map((entry) => entry.id));
    const removedCheckIns = oldTrack.checkIns.filter((entry) => !nextCheckInIds.has(entry.id)).map((entry) => entry.id);
    if (removedCheckIns.length) {
      const { error } = await client.from("progress_checkins").delete().eq("user_id", userId).in("id", removedCheckIns);
      if (error) throw error;
    }
  }
  const removedTracks = previous.tracks.filter((track) => !nextTrackIds.has(track.id));
  if (removedTracks.length) {
    const paths = removedTracks.flatMap((track) => track.photos.map((photo) => photo.photoPath).filter((path): path is string => Boolean(path)));
    const { error } = await client.from("progress_tracks").delete().eq("user_id", userId).in("id", removedTracks.map((track) => track.id));
    if (error) throw error;
    if (paths.length) await client.storage.from(PHOTO_BUCKET).remove(paths);
  }
  const nextCatalogIds = new Set(nextCatalog.map((product) => product.id));
  const removedCatalog = oldCatalog.filter((product) => !nextCatalogIds.has(product.id));
  if (removedCatalog.length) {
    const paths = removedCatalog.map((product) => product.photoPath).filter((path): path is string => Boolean(path));
    const { error } = await client.from("progress_catalog_products").delete().eq("user_id", userId).in("id", removedCatalog.map((product) => product.id));
    if (error) throw error;
    if (paths.length) await client.storage.from(PHOTO_BUCKET).remove(paths);
  }
  return loadProgressData(client, userId);
}
