import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

// Étape 53 : espace des clients comptables externes (rôle PRESTATAIRE,
// compte seed prestataire@ext.fr rattaché à la structure 401ORAN — qui porte
// la pièce CH-DEMO-2001 du journal).

test("le prestataire voit SES factures, discute avec la compta et dépose un document", async ({
  page,
}) => {
  await login(page, ACCOUNTS.prestataire);

  // Son accueil renvoie vers l'espace prestataire.
  await page.getByTestId("goto-prestataire").click();
  await expect(page.getByTestId("provider-title")).toContainText("Orangina");

  // Ses factures du journal (seed) — et rien d'autre.
  await expect(page.getByTestId("provider-invoices")).toContainText("CH-DEMO-2001");
  await expect(page.getByTestId("provider-invoices")).not.toContainText(
    "FA-DEMO-1001"
  );

  // Discussion sur la facture : message au fil, la compta le retrouve.
  await page.getByTestId("provider-invoice-CH-DEMO-2001").click();
  await expect(page.getByTestId("provider-invoice-title")).toContainText(
    "CH-DEMO-2001"
  );
  await page
    .getByTestId("provider-message-input")
    .fill("Bonjour, où en est le règlement ?");
  await page.getByTestId("provider-message-send").click();
  await expect(page.getByTestId("invoice-messages")).toContainText(
    "où en est le règlement"
  );

  // Dépôt d'une note de frais avec pièce jointe.
  await page.goto("/prestataire");
  await page.getByTestId("provider-deposit-button").click();
  await page.getByTestId("deposit-case").click();
  await page.getByRole("option", { name: "Note de frais" }).click();
  await page.getByTestId("deposit-subject").fill("Note de frais e2e prestataire");
  await page.getByTestId("deposit-amount").fill("120,50");
  await page.getByTestId("deposit-files").setInputFiles({
    name: "note-frais.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 note de frais e2e"),
  });
  await page.getByTestId("deposit-submit").click();
  await expect(page.getByText("Dépôt transmis à la comptabilité.")).toBeVisible();
  await expect(page.getByTestId("provider-deposits")).toContainText(
    "Note de frais e2e prestataire"
  );

  // Ticket vers la compta.
  await page.getByTestId("provider-ticket-button").click();
  await page.getByTestId("provider-ticket-title").fill("Question RIB e2e");
  await page
    .getByTestId("provider-ticket-description")
    .fill("Pouvez-vous confirmer le RIB utilisé pour les virements ?");
  await page.getByTestId("provider-ticket-submit").click();
  await expect(page.getByText("Ticket envoyé à la comptabilité.")).toBeVisible();
  await expect(page.getByTestId("provider-tickets")).toContainText("Question RIB e2e");

  // Cloisonnement : aucune page interne accessible.
  await page.goto("/compta/structures");
  await expect(page.getByTestId("access-denied")).toBeVisible();
  await page.goto("/boutiques");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});

test("la compta répond dans le fil, reçoit le dépôt, et gère les accès CRM", async ({
  page,
}) => {
  // Réponse de la compta sur la pièce du prestataire.
  await login(page, ACCOUNTS.compta);
  await page.goto("/compta/factures");
  await page.getByTestId("invoice-link-CH-DEMO-2001").click();
  await expect(page.getByTestId("invoice-detail-title")).toContainText(
    "CH-DEMO-2001"
  );
  await page.getByTestId("compta-message-input").fill("Virement prévu vendredi.");
  await page.getByTestId("compta-message-send").click();
  await expect(page.getByTestId("invoice-messages")).toContainText(
    "Virement prévu vendredi."
  );

  // Le prestataire voit la réponse dans son espace.
  await login(page, ACCOUNTS.prestataire);
  await page.goto("/prestataire");
  await page.getByTestId("provider-invoice-CH-DEMO-2001").click();
  await expect(page.getByTestId("invoice-messages")).toContainText(
    "Virement prévu vendredi."
  );

  // L'admin crée un accès CRM depuis la fiche du client comptable.
  await login(page, ACCOUNTS.admin);
  await page.goto("/compta/structures");
  await page.getByTestId("structure-link-401ORAN").click();
  await page.getByTestId("new-provider-account").click();
  await page.getByTestId("provider-account-firstname").fill("Nino");
  await page.getByTestId("provider-account-lastname").fill("Nouveau");
  await page.getByTestId("provider-account-email").fill("nino@ext.fr");
  await page.getByTestId("provider-account-password").fill("MotDePasse!42");
  await page.getByTestId("provider-account-submit").click();
  await expect(
    page.getByText("Accès prestataire créé pour nino@ext.fr.")
  ).toBeVisible();
  await expect(page.getByTestId("provider-accounts")).toContainText("nino@ext.fr");

  // Le nouveau compte se connecte et tombe sur l'espace de la structure.
  await login(page, { email: "nino@ext.fr", password: "MotDePasse!42" });
  await page.getByTestId("goto-prestataire").click();
  await expect(page.getByTestId("provider-title")).toContainText("Orangina");
});
