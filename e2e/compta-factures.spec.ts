import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

// Étape 47 : journal factures/avoirs, import du journal, résultat comptable.

test("compta : saisie d'une pièce, import du journal et résultat CA − charges", async ({
  page,
}) => {
  await login(page, ACCOUNTS.compta);

  // Une structure pour rattacher les pièces.
  await page.goto("/compta/structures");
  await page.getByTestId("new-structure-button").click();
  await page.getByTestId("structure-code").fill("411E2E");
  await page.getByTestId("structure-name").fill("Structure journal");
  await page.getByTestId("structure-submit").click();
  await expect(page.getByText("Structure créée.")).toBeVisible();

  // Saisie manuelle d'une facture classe 7.
  await page.getByRole("link", { name: "Journal factures" }).click();
  await page.getByTestId("new-invoice-button").click();
  await page.getByTestId("invoice-number").fill("FAE2E-1");
  await page.getByTestId("invoice-class").click();
  await page.getByRole("option", { name: "7 — Produit" }).click();
  await page.getByTestId("invoice-structure").click();
  await page.getByRole("option", { name: /411E2E/ }).click();
  await page.getByTestId("invoice-date").fill("2026-07-01");
  await page.getByTestId("invoice-ht").fill("1000,00");
  await page.getByTestId("invoice-ttc").fill("1200,00");
  await page.getByTestId("invoice-submit").click();
  await expect(page.getByText("Pièce enregistrée.")).toBeVisible();
  await expect(page.getByTestId("invoices-table")).toContainText("FAE2E-1");

  // Import d'un journal d'achats (classe 6) avec une structure inconnue.
  await page.getByTestId("import-invoices-button").click();
  await page.getByTestId("invoices-class").click();
  await page.getByRole("option", { name: /6 — Charge/ }).click();
  await page.getByTestId("invoices-file").setInputFiles({
    name: "journal.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "Type de pièce;N° pièce;Date Pièce;Client;Total HT;Total TVA;Total TTC",
        "Facture;CHE2E-1;05/07/2026;411E2E;400,00;80,00;480,00",
        "Facture;CHE2E-2;06/07/2026;411ABSENT;50,00;10,00;60,00",
      ].join("\n"),
      "utf8"
    ),
  });
  await page.getByTestId("invoices-import-submit").click();
  await expect(page.getByTestId("invoices-import-report")).toContainText(
    "1 créée"
  );
  await expect(page.getByTestId("invoices-import-report")).toContainText(
    "411ABSENT"
  );
  await page.keyboard.press("Escape");

  // Résultat : 1000 (classe 7) − 400 (classe 6) = 600.
  await expect(page.getByTestId("result-revenue")).toContainText("1 000,00");
  await expect(page.getByTestId("result-expenses")).toContainText("400,00");
  await expect(page.getByTestId("result-total")).toContainText("600,00");

  // La compta passe la facture en « Payée » (statut manuel).
  await page.getByTestId("edit-invoice-FAE2E-1").click();
  await page.getByTestId("invoice-status-select").click();
  await page.getByRole("option", { name: "Payée", exact: true }).click();
  await page.getByTestId("invoice-update-submit").click();
  await expect(page.getByText("Pièce mise à jour.")).toBeVisible();
  await expect(page.getByTestId("invoices-table")).toContainText("Payée");

  // La liste des clients comptables agrège CA / charges / résultat.
  await page.goto("/compta/structures");
  const row = page.getByRole("row").filter({ hasText: "411E2E" });
  await expect(row).toContainText("600,00"); // résultat
});
