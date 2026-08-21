import { expect, test } from "@playwright/test";

test("la page d'accueil répond en français", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
});

test("le healthcheck répond ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toMatchObject({ status: "ok" });
});
