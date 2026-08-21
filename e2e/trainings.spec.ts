import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("cycle formation : planification animateur, CR, réalisation, validation RH, document signé", async ({
  page,
}) => {
  await login(page, ACCOUNTS.animateur);

  // Planifier une formation sur BM-002.
  await page.goto("/animation/formations");
  await page.getByTestId("new-training-button").click();
  await page.getByTestId("training-store-select").click();
  await page.getByRole("option", { name: /BM-002/ }).click();
  await page.getByLabel("Date").fill("2026-08-19");
  await page.getByTestId("training-submit").click();
  await expect(page.getByText("Formation planifiée.")).toBeVisible();

  // Ouvrir la fiche, participants + compte rendu, puis RÉALISÉE.
  await page.getByRole("link", { name: "19/08/2026" }).first().click();
  await page.getByTestId("participant-input").fill("Léa (équipière)");
  await page.getByTestId("participant-submit").click();
  await expect(page.getByTestId("participants-list")).toContainText("Léa");

  await page.getByTestId("training-report-input").fill("Formation e2e réalisée.");
  await page.getByTestId("training-report-submit").click();
  await expect(page.getByText("Compte rendu enregistré.")).toBeVisible();

  // Document signé rattaché.
  await page.getByTestId("training-docs-input").setInputFiles({
    name: "attestation-e2e.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 attestation e2e"),
  });
  await page.getByTestId("training-docs-kind").click();
  await page.getByRole("option", { name: "Document signé" }).click();
  await page.getByTestId("training-docs-submit").click();
  await expect(page.getByTestId("docs-signes")).toContainText("attestation-e2e.pdf");

  await page.getByTestId("training-to-REALISEE").click();
  await expect(page.getByTestId("training-status")).toContainText("Réalisée");
  // L'animateur ne peut pas valider : le bouton VALIDEE n'apparaît pas.
  await expect(page.getByTestId("training-to-VALIDEE")).toHaveCount(0);

  // La RH valide.
  const url = page.url();
  await login(page, ACCOUNTS.rh);
  await page.goto(url);
  await page.getByTestId("training-to-VALIDEE").click();
  await expect(page.getByTestId("training-status")).toContainText("Validée");

  // Le document signé remonte sur la fiche du franchisé (BM-002 → SARL Resto
  // Lyon) — vérifié par la direction (la RH n'a pas franchisee:read).
  await login(page, ACCOUNTS.direction);
  await page.goto("/franchises");
  await page.getByRole("link", { name: /SARL Resto Lyon/ }).first().click();
  await expect(page.getByTestId("signed-training-docs")).toContainText(
    "attestation-e2e.pdf"
  );
});

test("le franchisé voit les formations de ses boutiques, en lecture seule", async ({
  page,
}) => {
  await login(page, ACCOUNTS.franchise);
  await page.goto("/animation/formations");
  // La formation du seed (BM-001, boutique du franchisé) est visible.
  await expect(page.getByTestId("trainings-table")).toContainText("BM-001");
  await expect(page.getByTestId("new-training-button")).toHaveCount(0);
});
