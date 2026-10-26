import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemEvent, TrackedItem } from "@/lib/tracker";

const PHOTO_BUCKET = "product-photos";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ItemRow = {
  id: string; name: string; category: string | null; note: string | null; product_url: string | null; store_name: string | null;
  product_photo_path: string | null; listed_price_override: TrackedItem["listedPriceOverride"] | null;
  current_product: TrackedItem["currentProduct"] | null; created_at: string;
};
type EventRow = { id: string; kind: ItemEvent["kind"]; date: string | null; amount: number | null; currency: string | null; quantity: number | null; variant: string | null; note: string | null; feeling: ItemEvent["feeling"] | null; item_id: string; user_id: string; created_at: string };
type VariantRow = { id: string; name: string; amount: number | null; currency: string | null; item_id: string; user_id: string };

export async function loadTrackerItems(client: SupabaseClient, userId: string): Promise<TrackedItem[]> {
  const [itemsResult, eventsResult, variantsResult] = await Promise.all([
    client.from("items").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    client.from("events").select("*").eq("user_id", userId),
    client.from("variants").select("*").eq("user_id", userId),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (variantsResult.error) throw variantsResult.error;

  const rows = (itemsResult.data ?? []) as ItemRow[];
  const events = (eventsResult.data ?? []) as EventRow[];
  const variants = (variantsResult.data ?? []) as VariantRow[];
  return Promise.all(rows.map(async (row) => {
    let productPhoto: string | undefined;
    if (row.product_photo_path) {
      const { data } = await client.storage.from(PHOTO_BUCKET).createSignedUrl(row.product_photo_path, 60 * 60);
      productPhoto = data?.signedUrl;
    }
    return {
      id: row.id, name: row.name, category: row.category ?? undefined, note: row.note ?? undefined,
      productUrl: row.product_url ?? undefined, storeName: row.store_name ?? undefined, productPhoto, productPhotoPath: row.product_photo_path ?? undefined,
      listedPriceOverride: row.listed_price_override ?? undefined, currentProduct: row.current_product ?? undefined,
      createdAt: row.created_at,
      events: events.filter((entry) => entry.item_id === row.id).map((entry) => ({
        id: entry.id, kind: entry.kind, date: entry.date ?? undefined, amount: entry.amount ?? undefined, currency: entry.currency ?? undefined,
        quantity: entry.quantity ?? undefined, variant: entry.variant ?? undefined, note: entry.note ?? undefined, feeling: entry.feeling ?? undefined, createdAt: entry.created_at,
      })),
      variants: variants.filter((entry) => entry.item_id === row.id).map((entry) => ({
        id: entry.id, name: entry.name, amount: entry.amount ?? undefined, currency: entry.currency ?? undefined,
      })),
    };
  }));
}

async function uploadPhoto(client: SupabaseClient, userId: string, item: TrackedItem, overwrite = false) {
  if (!item.productPhoto?.startsWith("data:image/")) return item.productPhotoPath?.startsWith(`${userId}/`) ? item.productPhotoPath : undefined;
  if (!overwrite && item.productPhotoPath?.startsWith(`${userId}/`)) return item.productPhotoPath;
  const match = item.productPhoto.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
  if (!match) throw new Error(`The photo for ${item.name} is not a supported image.`);
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  const extension = match[1].split("/")[1].replace("jpeg", "jpg");
  const path = `${userId}/${item.id}.${extension}`;
  const { error } = await client.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: match[1], upsert: true });
  if (error) throw error;
  return path;
}

export async function syncTrackerItems(client: SupabaseClient, userId: string, previous: TrackedItem[], next: TrackedItem[]) {
  const previousById = new Map(previous.map((item) => [item.id, item]));
  const nextIds = next.map((item) => item.id);
  const normalized = new Map<string, string | undefined>();

  for (const item of next) {
    const old = previousById.get(item.id);
    if (old && JSON.stringify({ ...old, productPhoto: undefined }) === JSON.stringify({ ...item, productPhoto: undefined })) {
      normalized.set(item.id, item.productPhotoPath);
      continue;
    }
    const photoPath = await uploadPhoto(client, userId, item);
    const { error: itemError } = await client.from("items").upsert({
      id: item.id, user_id: userId, name: item.name, category: item.category ?? null, note: item.note ?? null,
      product_url: item.productUrl ?? null, store_name: item.storeName ?? null, product_photo_path: photoPath ?? null,
      listed_price_override: item.listedPriceOverride ?? null, current_product: item.currentProduct ?? null,
      created_at: item.createdAt,
    });
    if (itemError) throw itemError;
    if (old?.productPhotoPath && old.productPhotoPath !== photoPath) {
      const { error: photoError } = await client.storage.from(PHOTO_BUCKET).remove([old.productPhotoPath]);
      if (photoError) throw photoError;
    }

    const oldVariants = old?.variants ?? [];
    const newVariants = item.variants ?? [];
    if (newVariants.length) {
      const { error } = await client.from("variants").upsert(newVariants.map((variant) => ({ ...variant, item_id: item.id, user_id: userId })));
      if (error) throw error;
    }
    const removeVariantIds = oldVariants.filter((variant) => !newVariants.some((nextVariant) => nextVariant.id === variant.id)).map((variant) => variant.id);
    if (removeVariantIds.length) {
      const { error } = await client.from("variants").delete().eq("item_id", item.id).in("id", removeVariantIds);
      if (error) throw error;
    }

    const oldEvents = old?.events ?? [];
    const newEvents = item.events ?? [];
    if (newEvents.length) {
      const { error } = await client.from("events").upsert(newEvents.map((entry) => ({
        id: entry.id, item_id: item.id, user_id: userId, kind: entry.kind, date: entry.date ?? null,
        amount: entry.amount ?? null, currency: entry.currency ?? null, quantity: entry.quantity ?? null,
        variant: entry.variant ?? null, note: entry.note ?? null, feeling: entry.feeling ?? null, created_at: entry.createdAt,
      })));
      if (error) throw error;
    }
    const removeEventIds = oldEvents.filter((entry) => !newEvents.some((nextEvent) => nextEvent.id === entry.id)).map((entry) => entry.id);
    if (removeEventIds.length) {
      const { error } = await client.from("events").delete().eq("item_id", item.id).in("id", removeEventIds);
      if (error) throw error;
    }
    normalized.set(item.id, photoPath);
  }

  const removed = previous.filter((item) => !nextIds.includes(item.id));
  if (removed.length) {
    const { error } = await client.from("items").delete().eq("user_id", userId).in("id", removed.map((item) => item.id));
    if (error) throw error;
    const paths = removed.map((item) => item.productPhotoPath).filter((path): path is string => Boolean(path));
    if (paths.length) await client.storage.from(PHOTO_BUCKET).remove(paths);
  }
  return normalized;
}

export async function importTrackerItems(client: SupabaseClient, userId: string, items: TrackedItem[]) {
  const normalized = new Map<string, string | undefined>();
  for (const item of items) {
    const photoPath = await uploadPhoto(client, userId, item, true);
    const safePhotoPath = item.productPhoto?.startsWith("data:image/") ? photoPath : item.productPhotoPath?.startsWith(`${userId}/`) ? item.productPhotoPath : undefined;
    const { error } = await client.from("items").upsert({
      id: item.id, user_id: userId, name: item.name, category: item.category ?? null, note: item.note ?? null,
      product_url: item.productUrl ?? null, store_name: item.storeName ?? null, product_photo_path: safePhotoPath ?? null,
      listed_price_override: item.listedPriceOverride ?? null, current_product: item.currentProduct ?? null,
      created_at: item.createdAt,
    });
    if (error) throw error;
    if (item.variants?.length) {
      const { error: variantsError } = await client.from("variants").upsert(item.variants.map((variant) => ({ ...variant, item_id: item.id, user_id: userId })));
      if (variantsError) throw variantsError;
    }
    if (item.events.length) {
      const { error: eventsError } = await client.from("events").upsert(item.events.map((entry) => ({
        id: entry.id, item_id: item.id, user_id: userId, kind: entry.kind, date: entry.date ?? null,
        amount: entry.amount ?? null, currency: entry.currency ?? null, quantity: entry.quantity ?? null,
        variant: entry.variant ?? null, note: entry.note ?? null, feeling: entry.feeling ?? null, created_at: entry.createdAt,
      })));
      if (eventsError) throw eventsError;
    }
    normalized.set(item.id, safePhotoPath);
  }
  return normalized;
}

export function makeCloudCompatibleItems(items: TrackedItem[]) {
  return items.map((item) => ({
    ...item,
    id: UUID.test(item.id) ? item.id : crypto.randomUUID(),
    events: item.events.map((entry) => ({ ...entry, id: UUID.test(entry.id) ? entry.id : crypto.randomUUID() })),
    variants: item.variants?.map((variant) => ({ ...variant, id: UUID.test(variant.id) ? variant.id : crypto.randomUUID() })),
  }));
}

