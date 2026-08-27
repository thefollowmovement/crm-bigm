import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

// Étape 48 : transmissions comptables internes (demandes/factures, PJ,
// historique de statuts, conversion en facture du journal).

test("parcours complet : l'animateur transmet, la compta valide puis convertit", async ({
  page,
}) => {
  // 1. L'animateur envoie une facture d'influenceur avec une pièce jointe.
  await login(page, ACCOUNTS.animateur);
  await page.getByRole("link", { name: "Transmissions", exact: true }).click();
  await page.getByTestId("new-transmission-button").click();
  await page.getByTestId("transmission-case").click();
  await page.getByRole("option", { name: "Facture influenceur" }).click();
  await page
    .getByTestId("transmission-subject")
    .fill("Facture influenceur — campagne e2e");
  await page.getByTestId("transmission-amount").fill("850,00");
  await page.getByTestId("transmission-files").setInputFiles({
    name: "facture-influenceur.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 facture de test"),
  });
  await page.getByTestId("transmission-submit").click();
  await expect(page.getByText("Transmission envoyée.")).toBeVisible();
  await expect(page.getByTestId("transmissions-table")).toContainText(
    "campagne e2e"
  );
  await expect(page.getByTestId("transmissions-table")).toContainText(
    "En attente"
  );

  // 2. La compta prépare une structure puis retrouve la transmission.
  await login(page, ACCOUNTS.compta);
  await page.goto("/compta/structures");
  await page.getByTestId("new-structure-button").click();
  await page.getByTestId("structure-code").fill("411TRE2E");
  await page.getByTestId("structure-name").fill("Influenceurs e2e");
  await page.getByTestId("structure-submit").click();
  await expect(page.getByText("Structure créée.")).toBeVisible();

  await page.goto("/compta/transmissions");
  await page
    .getByRole("link", { name: /^TR-\d{6}$/ })
    .first()
    .click();
  await expect(page.getByTestId("transmission-title")).toContainText(
    "campagne e2e"
  );
  await expect(page.getByTestId("transmission-attachment")).toContainText(
    "facture-influenceur.pdf"
  );
  await page.getByTestId("transmission-status-select").click();
  await page.getByRole("option", { name: "Validée" }).click();
  await page.getByTestId("transmission-status-submit").click();
  await expect(page.getByText("Statut mis à jour.")).toBeVisible();
  await expect(page.getByTestId("transmission-history")).toContainText(
    "En attente → Validée"
  );

  // 3. Conversion en facture du journal (source « Transmission »).
  await expect(page.getByTestId("convert-card")).toBeVisible();
  await page.getByTestId("convert-piece-number").fill("TRE2E-1");
  await page.getByTestId("convert-structure").click();
  await page.getByRole("option", { name: /411TRE2E/ }).click();
  await page.getByTestId("convert-ht").fill("708,33");
  await page.getByTestId("convert-submit").click();
  // La revalidation retire le formulaire : on vérifie le résultat durable
  // (statut Traitée + lien vers la pièce) plutôt que le toast.
  await expect(page.getByTestId("transmission-title")).toContainText("Traitée");
  await expect(page.getByRole("link", { name: "TRE2E-1" })).toBeVisible();

  await page.goto("/compta/factures");
  await expect(page.getByTestId("invoices-table")).toContainText("TRE2E-1");
  await expect(page.getByTestId("invoices-table")).toContainText(
    "Transmission externe validée"
  );
});

test("le franchisé transmet pour sa boutique et ne voit que ses transmissions", async ({
  page,
}) => {
  await login(page, ACCOUNTS.franchise);
  await page.getByRole("link", { name: "Transmissions", exact: true }).click();
  // La liste du franchisé ne contient pas la transmission de l'animateur.
  await expect(page.getByTestId("transmissions-table")).not.toContainText(
    "campagne e2e"
  );

  await page.getByTestId("new-transmission-button").click();
  await page.getByTestId("transmission-type").click();
  await page.getByRole("option", { name: "Demande", exact: true }).click();
  await page.getByTestId("transmission-case").click();
  await page.getByRole("option", { name: "Autre", exact: true }).click();
  // Boutique imposée : uniquement les siennes dans la liste.
  await page.getByTestId("transmission-store").click();
  await page.getByRole("option").first().click();
  await page
    .getByTestId("transmission-subject")
    .fill("Demande de remboursement e2e");
  await page.getByTestId("transmission-submit").click();
  await expect(page.getByText("Transmission envoyée.")).toBeVisible();
  await expect(page.getByTestId("transmissions-table")).toContainText(
    "remboursement e2e"
  );
});
