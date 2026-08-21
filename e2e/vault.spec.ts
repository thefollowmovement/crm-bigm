import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("direction : registre logiciels et coffre-fort avec révélation auditée", async ({
  page,
}) => {
  await login(page, ACCOUNTS.direction);

  // Registre des logiciels (seed : Pack bureautique) + création.
  await page.goto("/admin/logiciels");
  await expect(page.getByTestId("software-table")).toContainText("Pack bureautique");
  await page.getByTestId("new-software-button").click();
  await page.locator("#sw-name").fill("Caisse tactile (e2e)");
  await page.locator("#sw-purpose").fill("Encaissement boutiques");
  await page.getByTestId("software-submit").click();
  await expect(page.getByTestId("software-table")).toContainText("Caisse tactile (e2e)");

  // Coffre-fort : créer un secret puis le révéler.
  await page.goto("/admin/coffre");
  await page.getByTestId("new-secret-button").click();
  await page.getByTestId("secret-label-input").fill("Wi-Fi siège (e2e)");
  await page.getByTestId("secret-value-input").fill("MotDePasse!2026");
  await page.getByTestId("secret-submit").click();
  await expect(page.getByTestId("vault-table")).toContainText("Wi-Fi siège (e2e)");
  // Le clair n'apparaît nulle part avant révélation.
  await expect(page.getByText("MotDePasse!2026")).toHaveCount(0);

  await page.getByTestId("secret-reveal").click();
  await expect(page.getByTestId("secret-value")).toHaveText("MotDePasse!2026");

  // La révélation est tracée dans le journal d'audit.
  await page.goto("/admin/audit");
  await expect(page.getByText("Révélation de secret").first()).toBeVisible();
});

test("le coffre est invisible hors direction ; le registre reste lisible du siège", async ({
  page,
}) => {
  await login(page, ACCOUNTS.compta);
  // Lecture du registre sans bouton de création.
  await page.goto("/admin/logiciels");
  await expect(page.getByTestId("software-table")).toBeVisible();
  await expect(page.getByTestId("new-software-button")).toHaveCount(0);

  // Aucun accès au coffre (ni menu, ni page).
  await expect(
    page.getByRole("link", { name: "Coffre-fort", exact: true })
  ).toHaveCount(0);
  await page.goto("/admin/coffre");
  await expect(page.getByTestId("access-denied")).toBeVisible();

  await login(page, ACCOUNTS.franchise);
  await page.goto("/admin/logiciels");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});
