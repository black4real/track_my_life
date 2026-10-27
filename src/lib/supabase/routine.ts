import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_ROUTINE_DATA, RoutineData, RoutineProduct, validRoutineData } from "@/lib/tracker";

const PHOTO_BUCKET = "product-photos";

export async function loadRoutineData(client: SupabaseClient, userId: string): Promise<RoutineData> {
  const { data, error } = await client.from("routine_data").select("products, phases, concerns").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) return EMPTY_ROUTINE_DATA;
  const products = (data.products ?? []) as RoutineProduct[];
  const hydrated = await Promise.all(products.map(async (product) => {
    if (!product.photoPath?.startsWith(`${userId}/`)) return product;
    const { data: signed } = await client.storage.from(PHOTO_BUCKET).createSignedUrl(product.photoPath, 60 * 60);
    return { ...product, photo: signed?.signedUrl };
  }));
  const routine = { products: hydrated, phases: data.phases ?? [], concerns: data.concerns ?? [] };
  return validRoutineData(routine) ? routine : EMPTY_ROUTINE_DATA;
}

async function uploadRoutinePhoto(client: SupabaseClient, userId: string, product: RoutineProduct) {
  if (!product.photo?.startsWith("data:image/")) return product.photoPath?.startsWith(`${userId}/`) ? product.photoPath : undefined;
  const match = product.photo.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
  if (!match) throw new Error(`The photo for ${product.name} is not a supported image.`);
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  const extension = match[1].split("/")[1].replace("jpeg", "jpg");
  const path = `${userId}/routine-${product.id}.${extension}`;
  const { error } = await client.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: match[1], upsert: true });
  if (error) throw error;
  return path;
}

export async function syncRoutineData(client: SupabaseClient, userId: string, routine: RoutineData): Promise<RoutineData> {
  const products = await Promise.all(routine.products.map(async (product) => {
    const photoPath = await uploadRoutinePhoto(client, userId, product);
    const { photo: _photo, ...rest } = product;
    return { ...rest, ...(photoPath ? { photoPath } : {}), ...(_photo && !_photo.startsWith("data:image/") ? { photo: _photo } : {}) };
  }));
  const { error } = await client.from("routine_data").upsert({ user_id: userId, products, phases: routine.phases, concerns: routine.concerns, updated_at: new Date().toISOString() });
  if (error) throw error;
  return loadRoutineData(client, userId);
}
