import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("saisie manuelle puis import CSV avec prévisualisation et idempotence", async ({
  page,
}) => {
  await login(page, ACCOUNTS.compta);
  await page.goto("/ca");

  // Saisie manuelle en tableau sur la première boutique (BM-001)
  await page.getByTestId("new-revenue-button").click();
  await page.getByLabel("Date").fill("2026-08-03");
  await page.getByTestId("revenue-gross-SUR_PLACE").fill("1500,00");
  await page.getByTestId("revenue-submit").click();
  await expect(
    page.getByText("Chiffre d'affaires enregistré (1 canal).")
  ).toBeVisible();

  await page.goto("/ca?mois=2026-08");
  await expect(page.getByTestId("revenue-total")).toContainText("1 500,00");

  // Import CSV : 2 lignes valides + 1 erreur de canal
  const csv =
    "boutique;date;canal;montant_brut;montant_net\n" +
    "BM-001;04/08/2026;Sur place;2 000,00;\n" +
    "BM-001;04/08/2026;Uber Eats;500,00;450,00\n" +
    "BM-001;05/08/2026;Fusée;100,00;\n";
  await page.getByTestId("csv-file-input").setInputFiles({
    name: "ca-aout.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("﻿" + csv),
  });
  await page.getByRole("button", { name: "Analyser le fichier" }).click();

  await expect(page.getByTestId("csv-preview")).toBeVisible();
  await expect(page.getByTestId("csv-errors")).toContainText("Canal inconnu");
  await page.getByTestId("csv-confirm").click();
  await expect(
    page.getByText("Import terminé : 2 lignes créées, 0 mise à jour.")
  ).toBeVisible();

  await expect(page.getByTestId("revenue-total")).toContainText("4 000,00");

  // Ré-import du même fichier → mises à jour, total inchangé
  await page.getByTestId("csv-file-input").setInputFiles({
    name: "ca-aout.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("﻿" + csv),
  });
  await page.getByRole("button", { name: "Analyser le fichier" }).click();
  await page.getByTestId("csv-confirm").click();
  await expect(
    page.getByText("Import terminé : 0 ligne créée, 2 mises à jour.")
  ).toBeVisible();
  await expect(page.getByTestId("revenue-total")).toContainText("4 000,00");

  // Comparatif réseau visible
  await expect(page.getByTestId("network-summary")).toContainText("BM-001");
});

test("le franchisé saisit le CA de sa boutique, sans import CSV", async ({
  page,
}) => {
  await login(page, ACCOUNTS.franchise);
  await page.goto("/ca");

  // Pas de carte d'import (revenue:import réservé compta/direction)
  await expect(page.getByTestId("csv-file-input")).toHaveCount(0);

  // Plusieurs canaux saisis d'un coup dans le tableau.
  await page.getByTestId("new-revenue-button").click();
  await page.getByLabel("Date").fill("2026-08-06");
  await page.getByTestId("revenue-gross-EMPORTE").fill("820,50");
  await page.getByTestId("revenue-gross-DELIVEROO").fill("300,00");
  await page.getByTestId("revenue-net-DELIVEROO").fill("270,00");
  await page.getByTestId("revenue-orders-EMPORTE").fill("45");
  await page.getByTestId("revenue-submit").click();
  await expect(
    page.getByText("Chiffre d'affaires enregistré (2 canaux).")
  ).toBeVisible();

  await page.goto("/ca?mois=2026-08");
  await expect(page.getByTestId("channel-totals")).toContainText("À emporter");
  await expect(page.getByTestId("channel-totals")).toContainText("Deliveroo");
});

test("l'animateur consulte sans pouvoir saisir", async ({ page }) => {
  await login(page, ACCOUNTS.animateur);
  await page.goto("/ca");
  await expect(page.getByTestId("ca-store-filter")).toBeVisible();
  await expect(page.getByTestId("new-revenue-button")).toHaveCount(0);
  await expect(page.getByTestId("csv-file-input")).toHaveCount(0);
});
