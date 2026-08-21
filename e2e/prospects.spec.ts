import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("développement : pipeline, création de prospect, statut journalisé", async ({
  page,
}) => {
  await login(page, ACCOUNTS.developpement);

  await page.goto("/developpement/prospects");
  // Seed : Karim Reprise (qualifié, à relancer) + Sonia Candidate (nouveau).
  await expect(page.getByTestId("prospects-table")).toContainText("Karim Reprise");
  await expect(page.getByTestId("prospects-table")).toContainText("à relancer");
  await expect(page.getByTestId("prospect-pipeline")).toContainText("Qualifié : 1");

  // Créer un prospect puis le faire avancer.
  await page.getByTestId("new-prospect-button").click();
  await page.locator("#pr-firstname").fill("Emma");
  await page.locator("#pr-lastname").fill("Essai (e2e)");
  await page.locator("#pr-city").fill("Valence");
  await page.getByTestId("prospect-submit").click();
  await expect(page.getByText("Prospect créé.")).toBeVisible();

  await page.getByRole("link", { name: /Emma Essai/ }).click();
  await expect(page.getByTestId("prospect-status")).toContainText("Nouveau");
  await page.getByTestId("prospect-status-select").click();
  await page.getByRole("option", { name: "Contacté" }).click();
  await page.getByTestId("prospect-status-note").fill("Premier appel (e2e)");
  await page.getByTestId("prospect-status-submit").click();
  await expect(page.getByTestId("prospect-status")).toContainText("Contacté");
  // L'événement STATUT est journalisé automatiquement.
  await expect(page.getByTestId("prospect-events")).toContainText(
    "Nouveau → Contacté"
  );

  // La base de locaux et la cession du seed sont visibles pour le pôle.
  await page.goto("/developpement/locaux");
  await expect(page.getByTestId("premises-table")).toContainText(
    "12 rue de la République"
  );
  await page.goto("/developpement/cessions");
  await expect(page.getByTestId("resales-table")).toContainText("BM-002");
});

test("modules prospection et cessions invisibles hors développement/direction", async ({
  page,
}) => {
  // L'animateur n'a ni l'entrée de menu ni l'accès aux pages.
  await login(page, ACCOUNTS.animateur);
  await expect(page.getByRole("link", { name: "Prospects", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Cessions", exact: true })).toHaveCount(0);
  await page.goto("/developpement/prospects");
  await expect(page.getByTestId("access-denied")).toBeVisible();
  await page.goto("/developpement/cessions");
  await expect(page.getByTestId("access-denied")).toBeVisible();

  // La direction voit tout (dont la cession confidentielle du seed).
  await login(page, ACCOUNTS.direction);
  await page.goto("/developpement/cessions");
  await expect(page.getByTestId("resales-table")).toContainText("Vente totale");
});
