import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { retailerForHost } from "@/lib/retailers";

export const runtime = "nodejs";

const MAX_HTML_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;

function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) {
    const octets = address.split(".").map(Number);
    const [a, b, c] = octets;
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) return isPublicAddress(normalized.slice(7));
    const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
    return !(
      normalized === "::" || normalized === "::1" ||
      (first & 0xfe00) === 0xfc00 ||
      (first & 0xffc0) === 0xfe80 ||
      (first & 0xff00) === 0xff00 ||
      (first & 0xff00) === 0x0100 ||
      normalized.startsWith("2001:db8:") ||
      normalized.startsWith("2001:2:")
    );
  }
  return false;
}

async function validatePublicHttpsURL(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" || url.username || url.password ||
    (url.port && url.port !== "443") || isIP(url.hostname) ||
    !url.hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/i.test(url.hostname)
  ) throw new Error("Use a public HTTPS product page.");

  const records = await lookup(url.hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => !isPublicAddress(record.address))) {
    throw new Error("That address is not a public product page.");
  }
  return url;
}

function decodeEntities(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity: string) => {
    const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
    if (entity[0] !== "#") return named[entity.toLowerCase()] ?? match;
    const code = entity[1]?.toLowerCase() === "x" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

function metaValues(html: string) {
  const values = new Map<string, string>();
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = new Map<string, string>();
    for (const attribute of tag[0].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      const key = attribute[1].toLowerCase();
      const raw = attribute[2] ?? attribute[3] ?? attribute[4];
      if (raw !== undefined) attributes.set(key, decodeEntities(raw));
    }
    const key = attributes.get("property") ?? attributes.get("name") ?? attributes.get("itemprop");
    const content = attributes.get("content");
    if (key && content && !values.has(key.toLowerCase())) values.set(key.toLowerCase(), content.trim());
  }
  return values;
}

function productNodes(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(productNodes);
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  const type = object["@type"];
  const isProduct = (Array.isArray(type) ? type : [type]).some((entry) => typeof entry === "string" && entry.toLowerCase() === "product");
  return [...(isProduct ? [object] : []), ...Object.values(object).flatMap(productNodes)];
}

function offerNodes(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(offerNodes);
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  const found = object.price !== undefined || object.lowPrice !== undefined;
  return [...(found ? [object] : []), ...Object.values(object).flatMap(offerNodes)];
}

function firstText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return decodeEntities(value.trim());
  if (value && typeof value === "object" && "name" in value) return firstText((value as { name?: unknown }).name);
  return undefined;
}

function firstImageURL(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstImageURL(entry);
      if (found) return found;
    }
  }
  if (typeof value === "string" && value.trim()) return decodeEntities(value.trim());
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return firstImageURL(object.url ?? object.contentUrl ?? object.thumbnailUrl);
  }
  return undefined;
}

function positivePrice(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  let text = String(value).replace(/[^\d.,-]/g, "").trim();
  if (!text || text.startsWith("-")) return undefined;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    text = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (comma >= 0) {
    text = /,\d{1,2}$/.test(text) ? text.replace(",", ".") : text.replace(/,/g, "");
  }
  const price = Number(text);
  return Number.isFinite(price) && price >= 0 && price <= 1_000_000_000 ? price : undefined;
}

function sameProductPage(candidate: unknown, sourceUrl: URL) {
  if (typeof candidate !== "string") return false;
  try {
    const url = new URL(candidate, sourceUrl);
    const candidatePid = url.searchParams.get("pid") ?? url.searchParams.get("sku");
    const sourcePid = sourceUrl.searchParams.get("pid") ?? sourceUrl.searchParams.get("sku");
    return url.hostname === sourceUrl.hostname && url.pathname === sourceUrl.pathname && (!candidatePid || !sourcePid || candidatePid === sourcePid);
  } catch { return false; }
}

function productData(html: string, sourceUrl: URL) {
  const meta = metaValues(html);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  const structured = scripts.flatMap((script) => {
    const attributes = script[1];
    const type = attributes.match(/\btype\s*=\s*(["'])(.*?)\1/i)?.[2]?.toLowerCase();
    const isStructured = type === "application/ld+json" || type === "application/json";
    if (!isStructured || script[2].length > MAX_HTML_BYTES) return [];
    try { return productNodes(JSON.parse(decodeEntities(script[2].trim()))); } catch { return []; }
  });
  const product = structured[0];
  const offersValue = product?.offers;
  const offers = offerNodes(offersValue);
  const exactOffer = offers.find((candidate) => {
    const offered = candidate.itemOffered && typeof candidate.itemOffered === "object" ? candidate.itemOffered as Record<string, unknown> : undefined;
    return sameProductPage(candidate.url ?? offered?.url, sourceUrl);
  });
  const uniqueOfferPrices = [...new Set(offers.map((candidate) => positivePrice(candidate.price)).filter((price): price is number => price !== undefined))];
  const offer = exactOffer ?? (uniqueOfferPrices.length <= 1 ? offers.find((candidate) => positivePrice(candidate.price) !== undefined) : undefined);
  const specificationValue = offer?.priceSpecification;
  const specification = Array.isArray(specificationValue) ? specificationValue.find((entry) => entry && typeof entry === "object") as Record<string, unknown> | undefined : specificationValue && typeof specificationValue === "object" ? specificationValue as Record<string, unknown> : undefined;
  const image = firstImageURL(product?.image);
  const htmlTitle = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1].replace(/<[^>]+>/g, "").trim();
  const title = firstText(product?.name) ?? meta.get("og:title") ?? meta.get("twitter:title") ?? (htmlTitle ? decodeEntities(htmlTitle) : undefined);
  const availabilityValue = typeof offer?.availability === "string" ? offer.availability.split(/[\/#]/).filter(Boolean).at(-1) : undefined;
  const availability = availabilityValue && /^[a-z]+$/i.test(availabilityValue) ? availabilityValue : undefined;
  const isUnavailable = availability === "OutOfStock" || availability === "SoldOut" || availability === "Discontinued";
  const amount = isUnavailable ? undefined : positivePrice(offer?.price ?? specification?.price ?? (uniqueOfferPrices.length <= 1 ? meta.get("product:price:amount") ?? meta.get("og:price:amount") ?? meta.get("price") : undefined));
  const currencyValue = offer?.priceCurrency ?? specification?.priceCurrency ?? meta.get("product:price:currency") ?? meta.get("og:price:currency");
  const currency = typeof currencyValue === "string" && /^[A-Z]{3}$/i.test(currencyValue) ? currencyValue.toUpperCase() : undefined;
  const rawImage = meta.get("og:image:secure_url") ?? image ?? meta.get("og:image") ?? meta.get("twitter:image");
  let imageUrl: string | undefined;
  if (rawImage) {
    try {
      const candidate = new URL(rawImage, sourceUrl);
      if (candidate.protocol === "https:" && !candidate.username && !candidate.password) imageUrl = candidate.toString();
    } catch { /* Some product pages publish malformed image fields. */ }
  }
  const sku = firstText(product?.sku ?? product?.productID ?? product?.mpn);
  const variantParts: string[] = [];
  const color = firstText(product?.color);
  const size = firstText(product?.size);
  if (color) variantParts.push(`Color: ${color}`);
  if (size) variantParts.push(`Size: ${size}`);
  return { title: title?.slice(0, 240), imageUrl, amount, currency, availability, productId: sku?.slice(0, 120), variant: variantParts.length ? variantParts.join(" · ").slice(0, 240) : undefined };
}

function flipkartData(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const root = value as Record<string, unknown>;
  const base = (root.productBaseInfoV1 ?? root.productBaseInfo) as Record<string, unknown> | undefined;
  if (!base) return undefined;
  const attributes = (base.productAttributes ?? base.attributes ?? base) as Record<string, unknown>;
  const sellingPrice = (attributes.flipkartSpecialPrice ?? attributes.sellingPrice ?? attributes.flipkartSellingPrice ?? base.flipkartSpecialPrice ?? base.sellingPrice ?? base.flipkartSellingPrice) as Record<string, unknown> | undefined;
  const mrp = (attributes.maximumRetailPrice ?? base.maximumRetailPrice) as Record<string, unknown> | undefined;
  const imageUrls = (attributes.imageUrls ?? base.imageUrls) as Record<string, unknown> | undefined;
  const rawImageUrl = imageUrls && (["1100x1360", "800x800", "400x400", "275x340", "275x275", "200x200", "unknown"]
    .map((size) => imageUrls[size]).find((entry) => typeof entry === "string" && /^https?:\/\//i.test(entry))
    ?? Object.values(imageUrls).find((entry) => typeof entry === "string" && /^https?:\/\//i.test(entry)));
  let imageUrl: string | undefined;
  if (typeof rawImageUrl === "string") {
    try { const parsed = new URL(rawImageUrl); parsed.protocol = "https:"; imageUrl = parsed.toString(); } catch { /* Ignore malformed retailer image URLs. */ }
  }
  const title = firstText(attributes.title ?? base.title);
  const productId = firstText(base.productId ?? (base.productIdentifier as Record<string, unknown> | undefined)?.productId);
  const size = firstText(attributes.size ?? base.size);
  const color = firstText(attributes.color ?? base.color);
  const variantParts = [color ? `Color: ${color}` : "", size ? `Size: ${size}` : ""].filter(Boolean);
  const amount = positivePrice(sellingPrice?.amount);
  const currency = firstText(sellingPrice?.currency) ?? firstText((mrp as Record<string, unknown> | undefined)?.currency);
  const maximumRetailPrice = positivePrice(mrp?.amount);
  if (!title) return undefined;
  return {
    title: title.slice(0, 240),
    imageUrl: typeof imageUrl === "string" ? imageUrl : undefined,
    amount,
    currency: currency && /^[A-Z]{3}$/i.test(currency) ? currency.toUpperCase() : undefined,
    productId: productId?.slice(0, 120),
    variant: variantParts.length ? variantParts.join(" · ").slice(0, 240) : undefined,
    mrp: maximumRetailPrice,
    source: "flipkart-api" as const,
  };
}

async function fetchFlipkartProduct(productId: string) {
  const affiliateId = process.env.FLIPKART_AFFILIATE_ID;
  const affiliateToken = process.env.FLIPKART_AFFILIATE_TOKEN;
  if (!affiliateId || !affiliateToken) return undefined;
  const apiUrl = new URL("https://affiliate-api.flipkart.net/affiliate/1.0/product.json");
  apiUrl.searchParams.set("id", productId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(apiUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "Fk-Affiliate-Id": affiliateId, "Fk-Affiliate-Token": affiliateToken, accept: "application/json" },
    });
    if (!response.ok) return undefined;
    const data: unknown = await response.json();
    return flipkartData(data);
  } catch { return undefined; }
  finally { clearTimeout(timeout); }
}

async function readLimitedBody(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) throw new Error("The product page is too large to read.");
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error("The product page is too large to read.");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

async function fetchProductPage(initialUrl: URL) {
  let url = initialUrl;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const safeUrl = await validatePublicHttpsURL(url.toString());
      const response = await fetch(safeUrl, {
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
        // Many stores reject requests that identify themselves as a custom scraper.
        // A normal browser request helps on stores that allow server-side previews;
        // it cannot bypass stores that require a session, app, or bot challenge.
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "accept-language": "en-IN,en;q=0.9",
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "none",
          "upgrade-insecure-requests": "1",
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirect === MAX_REDIRECTS) throw new Error("The product page redirected too many times.");
        url = new URL(location, safeUrl);
        continue;
      }
      if (!response.ok) throw new Error("The product site could not be reached right now.");
      const type = response.headers.get("content-type") ?? "";
      if (!type.toLowerCase().includes("text/html")) throw new Error("That link does not open a product webpage.");
      const html = await readLimitedBody(response);
      return { data: productData(html, safeUrl), sourceUrl: safeUrl.toString() };
    }
    throw new Error("The product page could not be read.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json({ error: "This request must come from the Kept app." }, { status: 403 });
  }
  let rawUrl: unknown;
  try { rawUrl = (await request.json() as { url?: unknown }).url; } catch { return Response.json({ error: "Add a valid product link." }, { status: 400 }); }
  if (typeof rawUrl !== "string" || rawUrl.length > 2048) return Response.json({ error: "Add a valid product link." }, { status: 400 });
  try {
    const initialUrl = await validatePublicHttpsURL(rawUrl);
    const retailer = retailerForHost(initialUrl.hostname);
    const flipkartId = retailer?.name === "Flipkart" ? initialUrl.searchParams.get("pid") : null;
    const officialProduct = flipkartId ? await fetchFlipkartProduct(flipkartId) : undefined;
    const result = officialProduct
      ? { data: officialProduct, sourceUrl: initialUrl.toString() }
      : await fetchProductPage(initialUrl);
    const resolvedRetailer = retailer ?? retailerForHost(new URL(result.sourceUrl).hostname);
    return Response.json({ ...result.data, source: officialProduct ? "flipkart-api" : "product-page", storeName: resolvedRetailer?.name, sourceUrl: result.sourceUrl, fetchedAt: new Date().toISOString() }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error && !/fetch failed|aborted|timeout/i.test(error.message)
      ? error.message
      : "This product page could not be read. Try again, or add the price yourself.";
    return Response.json({ error: message }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }
}
