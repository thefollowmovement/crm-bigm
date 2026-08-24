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

test("création d'un dépôt à la volée depuis le formulaire de tarif + infobulles", async ({
  page,
}) => {
  await login(page, ACCOUNTS.direction);
  await page.goto("/foodcost");

  // « + Créer un dépôt… » directement dans le formulaire de tarif.
  await page.getByTestId("new-price-button").click();
  await page.getByTestId("price-ingredient-select").click();
  await page.getByRole("option", { name: /Steak haché/ }).click();
  await page.getByTestId("price-depot-select").click();
  await page.getByTestId("depot-option-new").click();
  await page.getByTestId("new-depot-code").fill("DPS-EST");
  await page.getByTestId("new-depot-name").fill("DPS Strasbourg");
  await page.getByLabel("Tarif unitaire (€)").fill("10,2");
  await page.getByLabel("Date d'effet").fill("2026-01-01");
  await page.getByTestId("price-submit").click();
  await expect(page.getByText("Dépôt créé et tarif enregistré.")).toBeVisible();

  // La colonne du nouveau dépôt apparaît avec le tarif saisi.
  await expect(page.getByTestId("ingredients-table")).toContainText("DPS-EST");
  await expect(page.getByTestId("ingredients-table")).toContainText("10,2 €");

  // Le dépôt rejoint le référentiel des achats.
  await page.goto("/achats/depots");
  await expect(page.getByTestId("depots-table")).toContainText("DPS Strasbourg");

  // Icônes d'information : seuils d'alerte et valeurs dérivées.
  await page.goto("/foodcost");
  await page.getByTestId("tab-ecart").click();
  await expect(page.getByTestId("info-hint").first()).toBeVisible();
  await page.goto("/achats");
  await expect(page.getByTestId("info-hint").first()).toBeVisible();
});

test("le Food Cost est invisible pour un franchisé", async ({ page }) => {
  await login(page, ACCOUNTS.franchise);
  await page.goto("/foodcost");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});
