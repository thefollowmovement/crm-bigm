import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("l'admin planifie un créneau, l'animateur le voit et est notifié", async ({
  page,
}) => {
  await login(page, ACCOUNTS.admin);
  await page.goto("/animation/planning");
  await expect(page.getByTestId("planning-grid")).toBeVisible();

  // Le seed remplit lundi (2 créneaux) et mercredi (journée) : on ajoute au
  // jeudi via le premier bouton libre correspondant.
  await page.getByTestId(/add-entry-/).nth(3).click();
  await page.getByTestId("entry-activity").click();
  await page.getByRole("option", { name: "Formation" }).click();
  await page.getByLabel("Libellé").fill("Formation nouveaux produits");
  await page.getByLabel("Km estimés").fill("25,5");
  await page.getByTestId("entry-submit").click();
  await expect(page.getByText("Créneau enregistré.")).toBeVisible();

  // L'animateur retrouve le créneau et une notification de modification.
  await login(page, ACCOUNTS.animateur);
  await page.goto("/animation/planning");
  await expect(
    page.getByTestId("planning-entry").filter({ hasText: "Formation" }).first()
  ).toBeVisible();
  await page.goto("/notifications");
  await expect(
    page.getByTestId("notification-list").getByText(/planning .* modifié/i).first()
  ).toBeVisible();
});

test("vues jour et mois, puis déplacement d'un créneau par glisser-déposer", async ({
  page,
}) => {
  await login(page, ACCOUNTS.animateur);
  await page.goto("/animation/planning");
  await expect(page.getByTestId("planning-grid")).toBeVisible();
  // D'autres specs créent des animateurs : on raisonne sur la ligne d'Antoine.
  const antoineRow = page.getByRole("row").filter({ hasText: "Antoine" });
  await expect(antoineRow.getByTestId(/^day-cell-/)).toHaveCount(7);

  // Vue jour : une seule colonne.
  await page.getByTestId("view-jour").click();
  await expect(antoineRow.getByTestId(/^day-cell-/)).toHaveCount(1);

  // Vue mois : grille calendaire avec les créneaux du seed, cliquables.
  await page.getByTestId("view-mois").click();
  await expect(page.getByTestId("month-grid")).toBeVisible();
  const chip = page.getByTestId("month-grid").getByText("Antoine").first();
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page.getByTestId("planning-grid")).toBeVisible();

  // Glisser-déposer : la réunion du lundi après-midi part au mardi (vide).
  const reunion = page
    .getByTestId("planning-entry")
    .filter({ hasText: "Réunion" })
    .first();
  await reunion.dragTo(antoineRow.getByTestId(/^day-cell-/).nth(1));
  await expect(page.getByText("Créneau déplacé.")).toBeVisible();
  await expect(
    antoineRow.getByTestId(/^day-cell-/).nth(1).getByText("Réunion")
  ).toBeVisible();

  // Vers le mercredi (« Journée » d'audit) : conflit refusé.
  const visite = page
    .getByTestId("planning-entry")
    .filter({ hasText: "Visite" })
    .first();
  await visite.dragTo(antoineRow.getByTestId(/^day-cell-/).nth(2));
  await expect(
    page.getByText(/Impossible de déplacer : un créneau en conflit/)
  ).toBeVisible();
});

test("fiche animateur : profil du seed, statistiques et boutiques suivies", async ({
  page,
}) => {
  await login(page, ACCOUNTS.direction);
  await page.goto("/animation/animateurs");
  await expect(page.getByTestId("animateurs-table")).toContainText("Antoine");
  await page.getByRole("link", { name: /Antoine/ }).click();

  await expect(page.getByTestId("animateur-stats")).toContainText("Boutiques suivies");
  await expect(page.getByTestId("animateur-stats")).toContainText("km");
  // Coût estimé calculé à partir du profil du seed (0,45 €/km).
  await expect(page.getByTestId("animateur-stats")).toContainText("€");
  await expect(page.getByText("BM-001")).toBeVisible();
});

test("le planning est invisible pour un franchisé", async ({ page }) => {
  await login(page, ACCOUNTS.franchise);
  await page.goto("/animation/planning");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});
