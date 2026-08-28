import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("direction : paramètres SMTP, modèle de relance et aperçu avec variables", async ({
  page,
}) => {
  await login(page, ACCOUNTS.direction);
  await page.goto("/hq-18b8ba/emails");

  // Paramètres SMTP + signature.
  await page.getByTestId("smtp-host").fill("smtp.exemple.fr");
  await page.getByTestId("smtp-port").fill("587");
  await page.getByTestId("smtp-username").fill("crm@exemple.fr");
  await page.getByTestId("smtp-password").fill("Secret!123");
  await page.getByTestId("smtp-from-name").fill("Big M CIE");
  await page.getByTestId("smtp-from-email").fill("crm@exemple.fr");
  await page.getByTestId("smtp-signature").fill("<p>La comptabilité Big M</p>");
  await page.getByTestId("smtp-save").click();
  await expect(page.getByText("Paramètres e-mail enregistrés.")).toBeVisible();

  // Le mot de passe n'est jamais renvoyé : champ vide, marqué « défini ».
  await expect(page.getByTestId("smtp-password")).toHaveValue("");
  await expect(page.getByTestId("smtp-password")).toHaveAttribute(
    "placeholder",
    /défini/
  );

  // Modèle niveau 1 personnalisé avec variables.
  await page
    .getByTestId("template-1-subject")
    .fill("Rappel {{facture_numero}}");
  await page
    .getByTestId("template-1-body")
    .fill("<p>Bonjour {{contact_prenom}}, il reste {{facture_montant}} à régler.</p>");
  await page.getByTestId("template-1-save").click();
  await expect(
    page.getByText("Modèle de relance niveau 1 enregistré.")
  ).toBeVisible();

  // Aperçu : variables remplacées par les données d'exemple + signature.
  const preview = page.frameLocator('[data-testid="template-preview-1"]');
  await expect(preview.locator("body")).toContainText("Bonjour Farid");
  await expect(preview.locator("body")).toContainText("La comptabilité Big M");
  await expect(page.getByText("Sujet : Rappel F2026-0042")).toBeVisible();
});

test("page réservée ; relance e-mail sur une pièce du journal (étape 52)", async ({
  page,
}) => {
  // La compta n'a pas email:manage : page refusée, entrée de menu absente.
  await login(page, ACCOUNTS.compta);
  await expect(page.getByRole("link", { name: "E-mails", exact: true })).toHaveCount(0);
  await page.goto("/hq-18b8ba/emails");
  await expect(page.getByTestId("access-denied")).toBeVisible();

  // Mais elle relance les pièces non soldées du journal : la pièce impayée du
  // seed (FA-DEMO-1002) porte un bouton de relance, la payée (FA-DEMO-1001)
  // n'en a pas.
  await page.goto("/compta/factures");
  await expect(page.getByTestId("remind-invoice-FA-DEMO-1001")).toHaveCount(0);
  await page.getByTestId("remind-invoice-FA-DEMO-1002").click();
  await expect(page.getByTestId("reminder-level")).toBeVisible();
  await expect(page.getByTestId("reminder-send")).toBeEnabled();
});
