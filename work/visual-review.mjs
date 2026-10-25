import { chromium } from "playwright";
import axe from "axe-core";
import { mkdir } from "node:fs/promises";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4400";
const outputs = [];
await mkdir("work/review", { recursive: true });
const browser = await chromium.launch({ headless: true });

for (const view of [
  { name: "desktop", viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" },
  { name: "mobile", viewport: { width: 390, height: 844 }, reducedMotion: "reduce" },
]) {
  const context = await browser.newContext({ viewport: view.viewport, reducedMotion: view.reducedMotion });
  await context.addInitScript(() => {
    window.__keptVitals = { lcp: 0, cls: 0 };
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length) window.__keptVitals.lcp = entries.at(-1).startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__keptVitals.cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Things have stories." }).waitFor();
  await page.screenshot({ path: `work/review/${view.name}-empty.png`, fullPage: true });

  await page.getByRole("button", { name: "Add a thing" }).click();
  const newItem = page.getByRole("dialog");
  await newItem.locator('input[name="name"]').fill("Everyday watch");
  await newItem.getByRole("button", { name: "Save this thing" }).click();
  await page.getByRole("heading", { name: "Everyday watch" }).waitFor();
  if (!(await page.getByText("Date not added").count())) throw new Error(`${view.name}: name-only item did not retain unknown date state`);

  await page.getByRole("button", { name: "Add purchase" }).click();
  let entry = page.getByRole("dialog");
  await entry.locator('input[name="date"]').fill("2025-04-01");
  await entry.locator('input[name="amount"]').fill("9000");
  await entry.getByRole("button", { name: "Add to timeline" }).click();

  await page.getByRole("button", { name: "Add purchase" }).click();
  entry = page.getByRole("dialog");
  await entry.locator('input[name="date"]').fill("2026-02-25");
  await entry.locator('input[name="amount"]').fill("9000");
  await entry.getByRole("button", { name: "Add to timeline" }).click();

  await page.getByRole("button", { name: "Log upkeep" }).click();
  entry = page.getByRole("dialog");
  await entry.locator('input[name="date"]').fill("2026-04-01");
  await entry.locator('input[name="amount"]').fill("1200");
  await entry.locator('textarea[name="note"]').fill("Routine service");
  await entry.getByRole("button", { name: "Add to timeline" }).click();

  await page.getByRole("button", { name: "Add a note" }).click();
  entry = page.getByRole("dialog");
  await entry.locator('input[name="date"]').fill("2026-10-25");
  await entry.locator('select[name="feeling"]').selectOption("loved");
  await entry.locator('textarea[name="note"]').fill("Still comfortable after regular use.");
  await entry.getByRole("button", { name: "Add to timeline" }).click();
  await page.reload({ waitUntil: "networkidle" });

  const bodyText = await page.locator("body").innerText();
  for (const expected of ["Everyday watch", "2 times", "19,200.00", "Routine service", "♥ Loved it"]) {
    if (!bodyText.includes(expected)) throw new Error(`${view.name}: expected saved record detail missing: ${expected}`);
  }
  const layout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    nav: performance.getEntriesByType("navigation").map((entry) => ({
      domContentLoaded: Math.round(entry.domContentLoadedEventEnd),
      load: Math.round(entry.loadEventEnd),
      responseStart: Math.round(entry.responseStart),
    })),
    vitals: window.__keptVitals,
  }));
  if (layout.pageWidth > layout.viewportWidth) throw new Error(`${view.name}: horizontal overflow (${layout.pageWidth}px > ${layout.viewportWidth}px)`);

  await page.addScriptTag({ content: axe.source });
  const accessibility = await page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return { violations: result.violations.map((violation) => ({ id: violation.id, impact: violation.impact, help: violation.help, nodes: violation.nodes.length })) };
  });
  await page.screenshot({ path: `work/review/${view.name}-record.png`, fullPage: true });

  await page.keyboard.press("Home");
  await page.keyboard.press("Tab");
  const skipFocused = await page.evaluate(() => document.activeElement?.textContent?.includes("Skip to your things") ?? false);
  if (!skipFocused) throw new Error(`${view.name}: skip link was not the first keyboard focus target`);
  outputs.push({ view: view.name, reducedMotion: view.reducedMotion, layout, accessibility, consoleErrors });
  await context.close();
}

await browser.close();
console.log(JSON.stringify(outputs, null, 2));
