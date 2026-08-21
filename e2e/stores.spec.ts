import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("l'admin crée une boutique, la retrouve et voit son historique", async ({
  page,
}) => {
  await login(page, ACCOUNTS.admin);
  await page.goto("/boutiques");
  await page.getByTestId("new-store-button").click();

  await page.getByLabel("Code boutique").fill("BM-090");
  await page.getByLabel("Nom").fill("Big M Test E2E");
  await page.getByLabel("Ville").fill("Grenoble");
  await page.getByTestId("store-form-submit").click();

  await expect(page).toHaveURL(/\/boutiques$/);
  await expect(page.getByTestId("store-row-BM-090")).toBeVisible();

  await page.getByRole("link", { name: "BM-090" }).click();
  await expect(page.getByTestId("store-title")).toContainText("Big M Test E2E");

  // L'historique montre la création
  await page.getByRole("tab", { name: "Historique" }).click();
  await expect(page.getByTestId("entity-history")).toContainText("Création");
});

test("la modification d'une boutique apparaît dans l'historique avec le diff", async ({
  page,
}) => {
  await login(page, ACCOUNTS.admin);
  await page.goto("/boutiques");
  await page.getByRole("link", { name: "BM-002" }).click();

  await page.getByLabel("Ville").fill("Villeurbanne Centre");
  await page.getByTestId("store-form-submit").click();
  await expect(page.getByText("Boutique mise à jour.")).toBeVisible();

  await page.getByRole("tab", { name: "Historique" }).click();
  await expect(page.getByTestId("entity-history")).toContainText("Villeurbanne Centre");
});

test("le franchisé ne voit que ses boutiques et jamais les notes internes", async ({
  page,
  context,
}) => {
  // Récupère l'URL d'une boutique hors périmètre (succursale BM-003) via l'admin.
  await login(page, ACCOUNTS.admin);
  await page.goto("/boutiques");
  const forbiddenHref = await page
    .getByTestId("store-row-BM-003")
    .getByRole("link")
    .first()
    .getAttribute("href");
  await context.clearCookies();

  await login(page, ACCOUNTS.franchise);
  await page.goto("/boutiques");
  await expect(page.getByTestId("store-row-BM-001")).toBeVisible();
  await expect(page.getByTestId("store-row-BM-002")).toBeVisible();
  await expect(page.getByTestId("store-row-BM-003")).toHaveCount(0);
  // Pas de bouton de création sans store:write
  await expect(page.getByTestId("new-store-button")).toHaveCount(0);

  // La fiche d'une boutique autorisée ne contient PAS les notes internes
  await page.getByRole("link", { name: "BM-001" }).click();
  await expect(page.getByTestId("store-title")).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain("Notes internes");
  expect(html).not.toContain("Notes internes siège (démo).");

  // Accès direct à la boutique interdite → refus
  await page.goto(forbiddenHref!);
  await expect(page.getByTestId("access-denied")).toBeVisible();
});

test("l'admin voit les notes internes sur la fiche boutique", async ({ page }) => {
  await login(page, ACCOUNTS.admin);
  await page.goto("/boutiques");
  await page.getByRole("link", { name: "BM-001" }).click();
  await expect(page.getByText("Notes internes siège (démo).").first()).toBeVisible();
});

test("le franchisé voit sa fiche société mais pas celle d'un autre", async ({
  page,
}) => {
  await login(page, ACCOUNTS.franchise);
  await page.goto("/boutiques");
  await page.getByRole("link", { name: "BM-001" }).click();
  // Depuis sa boutique, il accède à sa fiche société
  await page.getByRole("link", { name: "SARL Resto Lyon" }).click();
  await expect(page.getByTestId("franchisee-title")).toContainText("SARL Resto Lyon");
  const html = await page.content();
  expect(html).not.toContain("Franchisé historique");
});
