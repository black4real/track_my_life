import { chromium } from "playwright";
import axe from "axe-core";
import { mkdir } from "node:fs/promises";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4400";
await mkdir("work/review", { recursive: true });
const browser = await chromium.launch({ headless: true });
const reports = [];

for (const view of [
  { name: "desktop", viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" },
  { name: "mobile", viewport: { width: 390, height: 844 }, reducedMotion: "reduce" },
]) {
  const context = await browser.newContext({ viewport: view.viewport, reducedMotion: view.reducedMotion });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Keep what matters." }).waitFor();
  await page.screenshot({ path: `work/review/${view.name}-empty.png`, fullPage: true });

  await page.getByRole("button", { name: "Add a thing" }).first().click();
  await page.locator('input[name="name"]').fill("Everyday watch");
  await page.getByRole("button", { name: "Save this thing" }).click();
  await page.getByRole("heading", { name: "Everyday watch" }).waitFor();
  if (!(await page.getByText("Date not added").count())) throw new Error(`${view.name}: name-only item should not invent an age`);

  await page.getByRole("button", { name: "Add purchase" }).click();
  let form = page.locator(".detail-inline-form").filter({ has: page.getByRole("heading", { name: "A purchase." }) });
  await form.locator('input[name="date"]').fill("2025-04-01");
  await form.locator('input[name="amount"]').fill("1195");
  await form.locator('input[name="quantity"]').fill("3");
  await form.locator('input[name="variant"]').fill("100g tube");
  await form.getByRole("button", { name: "Add to timeline" }).click();

  await page.getByRole("button", { name: "Log upkeep" }).click();
  form = page.locator(".detail-inline-form").filter({ has: page.getByRole("heading", { name: "Some upkeep." }) });
  await form.locator('input[name="date"]').fill("2026-04-01");
  await form.locator('textarea[name="note"]').fill("Routine service");
  await form.getByRole("button", { name: "Add to timeline" }).click();

  await page.getByRole("button", { name: "Add a note" }).click();
  form = page.locator(".detail-inline-form").filter({ has: page.getByRole("heading", { name: "A use note." }) });
  await form.locator('input[name="date"]').fill("2026-10-25");
  await form.locator('select[name="feeling"]').selectOption("loved");
  await form.locator('textarea[name="note"]').fill("Still comfortable after regular use.");
  await form.getByRole("button", { name: "Add to timeline" }).click();
  await page.reload({ waitUntil: "networkidle" });

  const bodyText = await page.locator("body").innerText();
  for (const expected of ["Everyday watch", "3 units", "1,195.00", "Routine service", "Loved it"]) {
    if (!bodyText.includes(expected)) throw new Error(`${view.name}: saved detail missing: ${expected}`);
  }
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (dimensions.scrollWidth > dimensions.width) throw new Error(`${view.name}: horizontal overflow (${dimensions.scrollWidth}px)`);

  await page.addScriptTag({ content: axe.source });
  const axeResults = await page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return result.violations.map(({ id, impact, help, nodes }) => ({ id, impact, help, count: nodes.length }));
  });
  await page.screenshot({ path: `work/review/${view.name}-record.png`, fullPage: true });
  await page.keyboard.press("Home");
  await page.keyboard.press("Tab");
  const firstFocus = await page.evaluate(() => document.activeElement?.textContent?.trim());
  if (!firstFocus?.includes("Skip to your things")) throw new Error(`${view.name}: skip link is not the first keyboard focus target`);
  reports.push({ view: view.name, reducedMotion: view.reducedMotion, dimensions, axeResults, errors });
  await context.close();
}

await browser.close();
console.log(JSON.stringify(reports, null, 2));
