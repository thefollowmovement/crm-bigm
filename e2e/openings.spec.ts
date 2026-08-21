import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("développement : frise des jalons, avancement, checklist", async ({ page }) => {
  await login(page, ACCOUNTS.developpement);

  await page.goto("/developpement/ouvertures");
  await expect(page.getByTestId("openings-table")).toContainText("BM-004");
  await page.getByRole("link", { name: /BM-004/ }).click();

  await expect(page.getByTestId("opening-title")).toContainText("BM-004");
  // Seed : DIP terminé, CONTRAT en cours → 1/8.
  await expect(page.getByTestId("step-status-DIP")).toContainText("Terminée");
  await expect(page.getByTestId("opening-progress")).toContainText("1/8");

  // Terminer le jalon CONTRAT → 2/8.
  await page
    .getByTestId("step-CONTRAT")
    .getByTestId("step-to-TERMINEE")
    .click();
  await expect(page.getByTestId("step-status-CONTRAT")).toContainText("Terminée");
  await expect(page.getByTestId("opening-progress")).toContainText("2/8");

  // Ajouter un item de checklist pour son pôle.
  await page.getByTestId("checklist-label-input").fill("Commande enseigne (e2e)");
  await page.getByTestId("checklist-add-submit").click();
  await expect(page.getByTestId("checklist-DEVELOPPEMENT")).toContainText(
    "Commande enseigne (e2e)"
  );
});

test("checklist par pôle : la communication coche ses items, lecture seule ailleurs", async ({
  page,
}) => {
  await login(page, ACCOUNTS.communication);
  await page.goto("/developpement/ouvertures");
  await page.getByRole("link", { name: /BM-004/ }).click();

  // Pas d'actions sur les jalons ni de création de projet pour ce rôle.
  await expect(page.getByTestId("step-to-TERMINEE")).toHaveCount(0);

  // L'item COMMUNICATION du seed est modifiable…
  await page
    .getByTestId("checklist-COMMUNICATION")
    .getByTestId("checklist-status-select")
    .click();
  await page.getByRole("option", { name: "Terminé", exact: true }).click();
  await expect(page.getByText("Checklist mise à jour.")).toBeVisible();

  // …mais l'item COMPTABILITE reste en lecture seule (badge, pas de select).
  await expect(
    page.getByTestId("checklist-COMPTABILITE").getByTestId("checklist-status-select")
  ).toHaveCount(0);

  // Le franchisé voit SON projet (BM-004 appartient à son enseigne), sans édition.
  await login(page, ACCOUNTS.franchise);
  await page.goto("/developpement/ouvertures");
  await page.getByRole("link", { name: /BM-004/ }).click();
  await expect(page.getByTestId("opening-title")).toContainText("BM-004");
  await expect(page.getByTestId("checklist-add-submit")).toHaveCount(0);
  await expect(page.getByTestId("step-to-EN_COURS")).toHaveCount(0);

  // Bandeau « ouverture en cours » sur la fiche boutique.
  await page.goto("/boutiques");
  await page.getByRole("link", { name: "BM-004" }).click();
  await expect(page.getByTestId("opening-banner")).toBeVisible();
});
