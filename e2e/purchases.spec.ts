import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("la compta saisit un achat DPS et lit le ratio achats/CA", async ({
  page,
}) => {
  await login(page, ACCOUNTS.compta);
  await page.goto("/achats");

  // Les achats du seed (BM-003 par défaut ? BM-001 en premier) : on filtre
  // sur BM-003 qui porte le CA + les achats de démonstration.
  await page.getByTestId("purchase-store-filter").click();
  await page.getByRole("option", { name: /BM-003/ }).click();
  await expect(page.getByTestId("purchase-total")).toContainText("1 520,50");

  // Saisie d'un nouvel achat sur BM-003.
  await page.getByTestId("new-purchase-button").click();
  await page.getByTestId("purchase-depot-select").click();
  await page.getByRole("option", { name: /DPS-PARIS/ }).click();
  await page.getByLabel("Date").fill("2026-08-15");
  await page.getByLabel("Référence (BL / facture)").fill("BL-E2E-1");
  await page.getByLabel("Montant (€)").fill("479,50");
  await page.getByTestId("purchase-submit").click();
  await expect(page.getByText("Achat enregistré.")).toBeVisible();
  await expect(page.getByTestId("purchase-total")).toContainText("2 000,00");

  // Ratio achats/CA affiché (CA seed BM-003 = 4 984,80).
  await expect(page.getByTestId("purchase-ratio-table")).toContainText("%");
  await expect(page.getByTestId("depot-summary")).toContainText("DPS-PARIS");
});

test("le franchisé consulte les achats de SA boutique sans saisie ni import", async ({
  page,
}) => {
  await login(page, ACCOUNTS.franchise);
  await page.goto("/achats");
  await expect(page.getByTestId("purchase-store-filter")).toBeVisible();
  await expect(page.getByTestId("new-purchase-button")).toHaveCount(0);
  await expect(page.getByTestId("purchase-csv-file-input")).toHaveCount(0);

  // Le filtre ne propose que ses boutiques.
  await page.getByTestId("purchase-store-filter").click();
  await expect(page.getByRole("option", { name: /BM-001/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /BM-003/ })).toHaveCount(0);
});

test("la gestion des dépôts est réservée à l'écriture compta/direction", async ({
  page,
}) => {
  await login(page, ACCOUNTS.animateur);
  await page.goto("/achats/depots");
  await expect(page.getByTestId("access-denied")).toBeVisible();

  await login(page, ACCOUNTS.admin);
  await page.goto("/achats/depots");
  await expect(page.getByTestId("depots-table")).toContainText("DPS-LYON");
});
