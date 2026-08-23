import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

// PNG 1×1 valide (base64) pour l'upload de photo.
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("photo de boutique : ajout, vignette en liste, accessible au franchisé", async ({
  page,
}) => {
  await login(page, ACCOUNTS.direction);
  await page.goto("/boutiques");
  await page
    .getByTestId("store-row-BM-001")
    .getByRole("link", { name: "BM-001" })
    .click();
  await expect(page.getByTestId("store-title")).toBeVisible();

  await expect(page.getByTestId("store-photo-empty")).toBeVisible();
  await page.getByTestId("store-photo-input").setInputFiles({
    name: "devanture.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_1PX, "base64"),
  });
  await page.getByTestId("store-photo-submit").click();
  await expect(page.getByText("Photo mise à jour.")).toBeVisible();
  await expect(page.getByTestId("store-photo")).toBeVisible();

  // La vignette apparaît dans la liste des boutiques.
  await page.goto("/boutiques");
  const thumb = page.getByTestId("store-photo-thumb-BM-001");
  await expect(thumb).toBeVisible();
  const src = await thumb.getAttribute("src");
  expect(src).toContain("/api/files/");

  // Servie par l'API authentifiée : accessible aussi au franchisé de la boutique.
  expect((await page.request.get(src!)).status()).toBe(200);
  await login(page, ACCOUNTS.franchise);
  expect((await page.request.get(src!)).status()).toBe(200);
});

test("coordonnées GPS : carte et lien OpenStreetMap sur la fiche", async ({
  page,
}) => {
  await login(page, ACCOUNTS.admin);

  // BM-001 a des coordonnées de seed : carte + lien visibles.
  await page.goto("/boutiques");
  await page
    .getByTestId("store-row-BM-001")
    .getByRole("link", { name: "BM-001" })
    .click();
  await expect(page.getByTestId("osm-map")).toBeVisible();
  await expect(page.getByTestId("osm-link")).toHaveAttribute(
    "href",
    /openstreetmap\.org\/\?mlat=45.7605/
  );

  // BM-002 n'en a pas : on les saisit dans le formulaire.
  await page.goto("/boutiques");
  await page
    .getByTestId("store-row-BM-002")
    .getByRole("link", { name: "BM-002" })
    .click();
  await expect(page.getByText("Coordonnées GPS non renseignées")).toBeVisible();
  await page.getByTestId("store-latitude").fill("45.771900");
  await page.getByTestId("store-longitude").fill("4.880100");
  await page.getByTestId("store-form-submit").click();
  await expect(page.getByText("Boutique mise à jour.")).toBeVisible();
  await expect(page.getByTestId("osm-map")).toBeVisible();
  await expect(page.getByTestId("osm-link")).toHaveAttribute(
    "href",
    /mlat=45.7719/
  );

  // Une coordonnée invalide est refusée.
  await page.getByTestId("store-latitude").fill("abc");
  await page.getByTestId("store-form-submit").click();
  await expect(page.getByText("Coordonnée invalide (ex. 45.764000)")).toBeVisible();
});
