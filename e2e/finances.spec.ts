import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("cycle facture : création échue, paiement partiel, relance, solde", async ({
  page,
}) => {
  await login(page, ACCOUNTS.compta);
  await page.goto("/finances");

  // Création d'une facture déjà échue → badge En retard
  await page.getByTestId("new-invoice-button").click();
  await page.getByTestId("invoice-store").click();
  await page.getByRole("option", { name: /BM-001/ }).click();
  await page.getByLabel("Libellé").fill("Redevance test e2e");
  await page.getByLabel("Montant HT (€)").fill("1000,00");
  await page.getByLabel("Émise le").fill("2026-01-01");
  await page.getByLabel("Échéance").fill("2026-01-31");
  await expect(page.getByTestId("ttc-preview")).toContainText("1");
  await page.getByRole("button", { name: "Créer la facture" }).click();
  await expect(page.getByText(/Facture F\d{4}-\d{4} créée\./)).toBeVisible();

  // Ouvre la facture créée (le lien est porté par le numéro de facture)
  await page
    .locator("tr", { hasText: "Redevance test e2e" })
    .getByRole("link")
    .first()
    .click();
  await expect(page.getByTestId("invoice-title")).toContainText("F");
  await expect(page.getByText("En retard").first()).toBeVisible();
  await expect(page.getByTestId("remaining-amount")).toContainText("1 200,00");

  // Paiement partiel
  await page.getByTestId("add-payment-button").click();
  await page.getByLabel("Montant (€)").fill("500,00");
  await page.getByLabel("Date", { exact: true }).fill("2026-02-10");
  await page.getByTestId("payment-submit").click();
  await expect(page.getByText("Paiement enregistré.")).toBeVisible();
  await expect(page.getByTestId("invoice-status")).toHaveText("Partiellement payée");
  await expect(page.getByTestId("remaining-amount")).toContainText("700,00");

  // Relance niveau 1
  await page.getByTestId("add-reminder-button").click();
  await page.getByLabel("Envoyée le").fill("2026-02-15");
  await page.getByTestId("reminder-submit").click();
  await expect(page.getByText("Relance niveau 1 enregistrée.")).toBeVisible();
  await expect(page.getByTestId("reminders-list")).toContainText("Niveau 1");

  // Paiement du solde → PAYEE, plus de badge retard
  await page.getByTestId("add-payment-button").click();
  await page.getByLabel("Montant (€)").fill("700,00");
  await page.getByLabel("Date", { exact: true }).fill("2026-02-20");
  await page.getByTestId("payment-submit").click();
  await expect(page.getByTestId("invoice-status")).toHaveText("Payée");
  await expect(page.getByTestId("remaining-amount")).toContainText("0,00");
});

test("les finances sont invisibles pour la communication", async ({ page }) => {
  await login(page, ACCOUNTS.communication);
  // pas d'entrée de menu
  await expect(page.getByRole("link", { name: "Factures & impayés" })).toHaveCount(0);
  // accès direct refusé
  await page.goto("/finances");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});

test("le job de retards alimente la cloche de la compta", async ({ page }) => {
  await login(page, ACCOUNTS.admin);
  // crée une facture échue via l'UI admin
  await page.goto("/finances");
  await page.getByTestId("new-invoice-button").click();
  await page.getByTestId("invoice-store").click();
  await page.getByRole("option", { name: /BM-002/ }).click();
  await page.getByLabel("Montant HT (€)").fill("250,00");
  await page.getByLabel("Émise le").fill("2026-01-01");
  await page.getByLabel("Échéance").fill("2026-01-15");
  await page.getByRole("button", { name: "Créer la facture" }).click();
  await expect(page.getByText(/créée\./)).toBeVisible();

  const response = await page.request.post("/api/admin/jobs/run", {
    data: { job: "invoice-overdue" },
  });
  expect(response.ok()).toBeTruthy();

  await page.context().clearCookies();
  await login(page, ACCOUNTS.compta);
  await expect(page.getByTestId("notification-badge")).toBeVisible();
  await page.goto("/notifications");
  await expect(
    page.getByTestId("notification-list").getByText(/en retard/).first()
  ).toBeVisible();
});
