import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("parcours animateur : audit noté puis finalisé, plan d'action jusqu'à validation", async ({
  page,
}) => {
  await login(page, ACCOUNTS.animateur);

  // 1. Créer une visite d'audit sur BM-002 (BM-001 porte celle du seed).
  await page.goto("/animation/visites");
  await page.getByTestId("new-visit-button").click();
  await page.getByTestId("visit-store-select").click();
  await page.getByRole("option", { name: /BM-002/ }).click();
  await page.getByLabel("Date").fill("2026-08-18");
  await page.getByTestId("visit-submit").click();
  await expect(
    page.getByText("Visite créée — complétez-la puis finalisez-la.")
  ).toBeVisible();

  // 2. Ouvrir la visite (première ligne du 18/08 sur BM-002).
  await page.getByTestId("visit-store-filter").click();
  await page.getByRole("option", { name: /BM-002/ }).click();
  await page.getByRole("link", { name: "18/08/2026" }).first().click();
  await expect(page.getByTestId("audit-grid")).toBeVisible();

  // 3. Noter deux critères (grille du seed), dont une non-conformité.
  await page.getByTestId("score-0").fill("9");
  await page.getByTestId("score-1").fill("6");
  await page.getByTestId("compliant-1").click();
  await page.getByTestId("audit-grid-submit").click();
  await expect(page.getByText("Grille d'audit enregistrée.")).toBeVisible();

  // 4. Compte rendu puis finalisation.
  await page.getByTestId("visit-report-input").fill("Audit e2e : deux points contrôlés.");
  await page.getByTestId("visit-report-submit").click();
  await expect(page.getByText("Compte rendu enregistré.")).toBeVisible();
  await page.getByTestId("finalize-visit").click();
  await expect(page.getByTestId("visit-status")).toContainText("Finalisée");
  await expect(page.getByTestId("visit-score")).toContainText("75");

  // 5. Plan d'action : création, EN_COURS, TERMINE puis validation (créateur).
  await page.goto("/animation/plans-action");
  await page.getByTestId("new-plan-button").click();
  await page.getByTestId("plan-store-select").click();
  await page.getByRole("option", { name: /BM-002/ }).click();
  await page.getByLabel("Titre").fill("Corriger la signalétique");
  await page.getByLabel("Échéance").fill("2026-09-30");
  await page.getByTestId("plan-submit").click();
  await expect(page.getByText(/Plan d'action PA-\d+ créé\./)).toBeVisible();

  await page
    .getByRole("row", { name: /Corriger la signalétique/ })
    .getByRole("link")
    .click();
  await page.getByTestId("plan-to-EN_COURS").click();
  await expect(page.getByTestId("plan-status")).toContainText("En cours");
  await page.getByTestId("plan-to-TERMINE").click();
  await expect(page.getByTestId("plan-status")).toContainText("Terminé");
  await page.getByTestId("plan-to-VALIDE").click();
  await expect(page.getByTestId("plan-status")).toContainText("Validé");

  // 6. Commentaire.
  await page.getByTestId("plan-comment-input").fill("Vérifié sur place.");
  await page.getByTestId("plan-comment-submit").click();
  await expect(page.getByTestId("plan-comments")).toContainText("Vérifié sur place.");
});

test("le franchisé suit ses plans d'action mais pas les visites internes", async ({
  page,
}) => {
  await login(page, ACCOUNTS.franchise);

  // Visites : accès refusé.
  await page.goto("/animation/visites");
  await expect(page.getByTestId("access-denied")).toBeVisible();

  // Plans d'action : il voit celui du seed (sa boutique BM-001), en lecture.
  await page.goto("/animation/plans-action");
  await expect(page.getByTestId("plans-table")).toContainText(
    "Mettre à jour l'affichage des allergènes"
  );
  await expect(page.getByTestId("new-plan-button")).toHaveCount(0);

  // Fiche boutique : onglet Animation sans la section visites.
  await page.goto("/boutiques");
  await page.getByRole("link", { name: /BM-001/ }).first().click();
  await page.getByRole("tab", { name: "Animation" }).click();
  await expect(page.getByTestId("store-animation-tab")).toContainText(
    "Plans d'action en cours"
  );
  await expect(page.getByText("Dernières visites")).toHaveCount(0);
});
