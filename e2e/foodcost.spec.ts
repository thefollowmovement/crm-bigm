import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("la direction gère ingrédients, tarifs et recettes ; le coût matière varie par dépôt", async ({
  page,
}) => {
  await login(page, ACCOUNTS.direction);
  await page.goto("/foodcost");

  // Grille des tarifs du seed.
  await expect(page.getByTestId("ingredients-table")).toContainText("Steak haché");
  await expect(page.getByTestId("ingredients-table")).toContainText("9,8 €");

  // Synthèse : coûts distincts Lyon / Paris pour le Burger Classic.
  await page.getByTestId("tab-synthese").click();
  await expect(page.getByTestId("foodcost-board")).toContainText("1,38 €");
  await expect(page.getByTestId("foodcost-board")).toContainText("1,48 €");
  await expect(page.getByTestId("foodcost-board")).toContainText("% du PV");

  // Nouvel ingrédient + tarif Lyon uniquement.
  await page.getByTestId("new-ingredient-button").click();
  await page.getByLabel("Nom").fill("Salade");
  await page.getByTestId("ingredient-submit").click();
  await expect(page.getByText("Ingrédient créé.")).toBeVisible();

  await page.getByTestId("new-price-button").click();
  await page.getByTestId("price-ingredient-select").click();
  await page.getByRole("option", { name: /Salade/ }).click();
  await page.getByTestId("price-depot-select").click();
  await page.getByRole("option", { name: /DPS-LYON/ }).click();
  await page.getByLabel("Tarif unitaire (€)").fill("2,4");
  await page.getByLabel("Date d'effet").fill("2026-01-01");
  await page.getByTestId("price-submit").click();
  await expect(page.getByText("Tarif enregistré.")).toBeVisible();

  // Ajout de 10 g de salade à la recette du Burger Classic.
  await page.getByTestId("tab-recettes").click();
  const recipeCard = page.getByTestId("recipe-BURGER-CLASSIC");
  await recipeCard.getByTestId("item-ingredient-select").click();
  await page.getByRole("option", { name: "Salade" }).click();
  await recipeCard.getByTestId("item-quantity").fill("10");
  await recipeCard.getByTestId("item-submit").click();
  await expect(
    page.getByText("Ingrédient enregistré dans la recette.")
  ).toBeVisible();

  // Lyon recalculé (1,38 + 0,024 → 1,40) ; Paris incalculable (tarif manquant).
  await page.getByTestId("tab-synthese").click();
  await expect(page.getByTestId("foodcost-board")).toContainText("1,40 €");
  await expect(page.getByTestId("foodcost-board")).toContainText("tarif manquant");
});

test("le Food Cost est invisible pour un franchisé", async ({ page }) => {
  await login(page, ACCOUNTS.franchise);
  await page.goto("/foodcost");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});
