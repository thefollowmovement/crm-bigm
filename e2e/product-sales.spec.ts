import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("référentiel produits puis import CSV des ventes, idempotent", async ({
  page,
}) => {
  await login(page, ACCOUNTS.admin);

  // Créer une famille et un produit dans le référentiel.
  await page.goto("/admin/produits");
  await page.getByTestId("new-family-button").click();
  await page.getByLabel("Nom").fill("Menus E2E");
  await page.getByTestId("family-submit").click();
  await expect(page.getByText("Famille créée.")).toBeVisible();

  await page.getByTestId("new-product-button").click();
  await page.getByLabel("Code").fill("menu-e2e");
  await page.getByTestId("product-family-select").click();
  await page.getByRole("option", { name: "Menus E2E" }).click();
  await page.getByLabel("Nom").fill("Menu E2E");
  await page.getByTestId("product-submit").click();
  await expect(page.getByText("Produit créé.")).toBeVisible();
  await expect(page.getByTestId("products-table")).toContainText("MENU-E2E");

  // Import CSV : 2 lignes valides + 1 code produit inconnu.
  await page.goto("/ca?vue=produits");
  const csv =
    "boutique;date;produit;quantite;montant\n" +
    "BM-001;05/08/2026;MENU-E2E;12;144,00\n" +
    "BM-001;06/08/2026;menu-e2e;8;96,00\n" +
    "BM-001;05/08/2026;INCONNU-999;3;\n";
  await page.getByTestId("product-csv-file-input").setInputFiles({
    name: "ventes-produits.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("﻿" + csv),
  });
  await page.getByRole("button", { name: "Analyser le fichier" }).click();
  await expect(page.getByTestId("product-csv-preview")).toBeVisible();
  await page.getByTestId("product-csv-confirm").click();
  await expect(
    page.getByText("Import partiel : 2 lignes créées, 0 mise à jour — Code produit inconnu : « INCONNU-999 » (à créer dans le référentiel).")
  ).toBeVisible();

  // Ré-import du même fichier → mises à jour, aucun doublon.
  await page.getByTestId("product-csv-file-input").setInputFiles({
    name: "ventes-produits.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("﻿" + csv),
  });
  await page.getByRole("button", { name: "Analyser le fichier" }).click();
  await page.getByTestId("product-csv-confirm").click();
  await expect(
    page.getByText(/Import partiel : 0 ligne créée, 2 mises à jour/)
  ).toBeVisible();
});

test("les meilleures ventes du seed s'affichent pour la compta", async ({
  page,
}) => {
  await login(page, ACCOUNTS.compta);
  await page.goto("/ca?vue=produits");
  await expect(page.getByTestId("top-products")).toContainText("BURGER-CLASSIC");
  await expect(page.getByTestId("family-breakdown")).toBeVisible();
  // Panier moyen du seed visible sur l'onglet mois (BM-003 sélectionnée).
});

test("le référentiel est interdit hors compta/direction/admin", async ({
  page,
}) => {
  await login(page, ACCOUNTS.animateur);
  await page.goto("/admin/produits");
  await expect(page.getByTestId("access-denied")).toBeVisible();

  // L'onglet Produits reste lisible, mais sans carte d'import.
  await page.goto("/ca?vue=produits");
  await expect(page.getByTestId("product-csv-file-input")).toHaveCount(0);
});
