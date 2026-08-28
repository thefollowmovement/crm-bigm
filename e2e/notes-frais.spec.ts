import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

// Étape 54 : compte rendu riche + pièces jointes titrées + notes de frais
// (validation direction → file compta avec badge → remboursement).

test("visite : compte rendu riche, PJ titrée, note de frais jusqu'au remboursement", async ({
  page,
}) => {
  await login(page, ACCOUNTS.animateur);

  // 1. Visite de courtoisie (pas de grille exigée) sur BM-002.
  await page.goto("/animation/visites");
  await page.getByTestId("new-visit-button").click();
  await page.getByTestId("visit-store-select").click();
  await page.getByRole("option", { name: /BM-002/ }).click();
  await page.getByTestId("visit-type-select").click();
  await page.getByRole("option", { name: "Visite de courtoisie" }).click();
  await page.getByLabel("Date").fill("2026-08-19");
  await page.getByTestId("visit-submit").click();
  await expect(
    page.getByText("Visite créée — complétez-la puis finalisez-la.")
  ).toBeVisible();

  await page.getByTestId("visit-store-filter").click();
  await page.getByRole("option", { name: /BM-002/ }).click();
  await page.getByRole("link", { name: "19/08/2026" }).first().click();

  // 2. PJ avec TITRE : affichée sous son titre, pas sous le nom de fichier.
  await page.locator("#visit-files").setInputFiles({
    name: "IMG_0042.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    ),
  });
  await page.getByTestId("visit-files-title").fill("Façade avant travaux");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.getByText("1 pièce jointe ajoutée.")).toBeVisible();
  await expect(page.getByTestId("visit-attachments")).toContainText(
    "Façade avant travaux"
  );

  // 3. Compte rendu RICHE : texte mis en gras + image insérée par référence.
  const editor = page.getByTestId("visit-report-input");
  await editor.fill("Constat général très positif.");
  await editor.press("ControlOrMeta+a");
  await page.getByTestId("rte-bold").click();
  // Replie la sélection en fin de texte avant d'insérer l'image (sinon
  // insertHTML remplacerait le texte sélectionné).
  await editor.press("End");
  await page.getByTestId("rte-image-select").click();
  await page.getByRole("option", { name: "Façade avant travaux" }).click();
  await page.getByTestId("visit-report-submit").click();
  await expect(page.getByText("Compte rendu enregistré.")).toBeVisible();

  // 4. Note de frais avec justificatif.
  await page.getByTestId("claim-title").fill("VHR — nuit d'hôtel");
  await page.getByTestId("claim-amount").fill("89,50");
  await page.getByTestId("claim-note").fill("Visite éloignée, nuit sur place.");
  await page.getByTestId("claim-files").setInputFiles({
    name: "facture-hotel.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 facture hotel e2e"),
  });
  await page.getByTestId("claim-submit").click();
  await expect(
    page.getByText("Note de frais enregistrée — en attente de validation.")
  ).toBeVisible();
  await expect(page.getByTestId("visit-claims")).toContainText("VHR — nuit d'hôtel");
  await expect(page.getByTestId("visit-claims")).toContainText(
    "En attente de validation"
  );

  // 5. Finalisation : le compte rendu s'affiche en riche (gras + image).
  await page.getByTestId("finalize-visit").click();
  await expect(page.getByTestId("visit-status")).toContainText("Finalisée");
  await expect(
    page.getByTestId("visit-report").locator("strong")
  ).toContainText("Constat général");
  await expect(page.getByTestId("visit-report").locator("img")).toBeVisible();

  // 6. La direction valide la note de frais.
  await login(page, ACCOUNTS.direction);
  await page.goto("/animation/visites");
  await page.getByTestId("visit-store-filter").click();
  await page.getByRole("option", { name: /BM-002/ }).click();
  await page.getByRole("link", { name: "19/08/2026" }).first().click();
  await page
    .getByTestId("visit-claims")
    .getByRole("button", { name: "Valider", exact: true })
    .click();
  // Le succès remplace les boutons par le badge de statut (le toast peut être
  // perdu quand le composant est démonté par le rafraîchissement serveur) :
  // on vérifie l'état durable.
  await expect(page.getByTestId("visit-claims")).toContainText(
    "Validée — à rembourser"
  );

  // 7. Côté compta : badge de compteur dans la nav + file de remboursement.
  await login(page, ACCOUNTS.compta);
  await expect(page.getByTestId("nav-badge-compta-notes-de-frais")).toHaveText("1");
  await page.getByRole("link", { name: "Notes de frais" }).click();
  await expect(page.getByTestId("claims-table")).toContainText("VHR — nuit d'hôtel");
  await expect(page.getByTestId("claims-table")).toContainText("89,50");
  await expect(page.getByTestId("claims-table")).toContainText(
    "facture-hotel.pdf"
  );
  await page.getByRole("button", { name: "Marquer remboursée" }).click();
  // Même logique qu'à la validation : le bouton disparaît au rafraîchissement
  // (toast perdu au démontage), on vérifie l'état durable de la ligne.
  await expect(
    page.getByTestId("claims-table").getByRole("row").filter({ hasText: "VHR" })
  ).toContainText("Remboursée");
  await expect(page.getByTestId("nav-badge-compta-notes-de-frais")).toHaveCount(0);
});
