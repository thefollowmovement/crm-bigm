import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

// Étape 49 : lien externe à usage unique → formulaire public → transmission
// EXTERNE en attente de validation côté compta.

test("la compta génère un lien externe, l'influenceur dépose sa facture, le lien meurt", async ({
  page,
}) => {
  // 1. Génération du lien par la compta.
  await login(page, ACCOUNTS.compta);
  await page.goto("/compta/transmissions");
  await page.getByTestId("new-invite-button").click();
  await page.getByTestId("invite-email").fill("lea@influence.fr");
  await page.getByTestId("invite-submit").click();
  await expect(page.getByTestId("invite-created")).toBeVisible();
  const url = (await page.getByTestId("invite-url").textContent())!.trim();
  expect(url).toContain("/transmission/");

  // 2. Le contact externe (anonyme) ouvre le lien et dépose sa facture.
  await page.context().clearCookies();
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Transmettre un document" })
  ).toBeVisible();
  await page.getByTestId("external-name").fill("Léa Influence");
  await page.getByTestId("external-subject").fill("Facture campagne e2e externe");
  await page.getByTestId("external-amount").fill("850,00");
  await page.getByTestId("external-files").setInputFiles({
    name: "facture.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 facture externe"),
  });
  await page.getByTestId("external-submit").click();
  await expect(page.getByTestId("external-success")).toBeVisible();

  // 3. Le lien est à usage unique : une seconde visite est refusée.
  await page.goto(url);
  await expect(page.getByTestId("external-invalid")).toBeVisible();

  // 4. Côté compta : transmission EXTERNE en attente, avec identité et PJ.
  await login(page, ACCOUNTS.compta);
  await page.goto("/compta/transmissions");
  await expect(page.getByTestId("transmissions-table")).toContainText(
    "campagne e2e externe"
  );
  await expect(page.getByTestId("transmissions-table")).toContainText("Externe");
  await page
    .getByRole("row")
    .filter({ hasText: "campagne e2e externe" })
    .getByRole("link")
    .first()
    .click();
  await expect(page.getByTestId("transmission-title")).toContainText(
    "campagne e2e externe"
  );
  await expect(page.getByText("lea@influence.fr")).toBeVisible();
  await expect(page.getByTestId("transmission-attachment")).toContainText(
    "facture.pdf"
  );
  // Le lien généré apparaît « Utilisé » dans la liste des liens externes.
  await page.goto("/compta/transmissions");
  await expect(page.getByTestId("invites-table")).toContainText("Utilisé");
});

test("un lien invalide affiche une réponse neutre, sans le CRM", async ({
  page,
}) => {
  await page.goto("/transmission/jeton-invente-000000000000");
  await expect(page.getByTestId("external-invalid")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/CRM|Big M/);
});
