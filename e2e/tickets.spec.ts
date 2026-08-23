import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("cycle de vie complet d'un ticket entre deux pôles", async ({ page }) => {
  // 1. La compta ouvre un ticket vers le pôle RH
  await login(page, ACCOUNTS.compta);
  await page.goto("/tickets");
  await page.getByTestId("new-ticket-button").click();
  await page.getByLabel("Objet").fill("Contrat apprenti boutique Lyon");
  await page
    .getByLabel("Description")
    .fill("Merci de préparer le contrat d'apprentissage pour BM-001.");
  await page.getByTestId("ticket-topole").click();
  await page.getByRole("option", { name: "Ressources humaines" }).click();
  await page.getByRole("button", { name: "Créer le ticket" }).click();
  await expect(page.getByText(/Ticket T-\d+ créé\./)).toBeVisible();

  // 2. Le pôle RH est notifié, s'affecte le ticket et le traite
  await page.context().clearCookies();
  await login(page, ACCOUNTS.rh);
  await expect(page.getByTestId("notification-badge")).toBeVisible();

  await page.goto("/tickets?vue=pole");
  await page.getByRole("link", { name: "Contrat apprenti boutique Lyon" }).click();

  await page.getByTestId("assignee-select").click();
  await page.getByRole("option", { name: "Rachid Ressources" }).click();
  await page.getByTestId("assign-submit").click();
  await expect(page.getByText("Ticket affecté.")).toBeVisible();
  await expect(page.getByTestId("ticket-status")).toHaveText("Affecté");

  await page.getByTestId("transition-EN_COURS").click();
  await expect(page.getByTestId("ticket-status")).toHaveText("En cours");

  await page.getByTestId("comment-body").fill("Contrat préparé, envoyé à la signature.");
  await page.getByTestId("comment-submit").click();
  await expect(page.getByText("Commentaire ajouté.")).toBeVisible();

  await page.getByTestId("transition-TERMINE").click();
  await expect(page.getByTestId("ticket-status")).toHaveText("Terminé");
  // Le RH (non demandeur) ne voit pas le bouton Valider
  await expect(page.getByTestId("transition-VALIDE")).toHaveCount(0);

  // 3. Le demandeur valide
  await page.context().clearCookies();
  await login(page, ACCOUNTS.compta);
  await expect(page.getByTestId("notification-badge")).toBeVisible();
  await page.goto("/tickets?vue=mine");
  await page.getByRole("link", { name: "Contrat apprenti boutique Lyon" }).click();
  await page.getByTestId("transition-VALIDE").click();
  await expect(page.getByTestId("ticket-status")).toHaveText("Validé");
});

test("un ticket confié à une personne précise naît affecté et la notifie", async ({
  page,
}) => {
  // La RH crée un ticket vers la communication, confié directement à
  // l'animateur — l'assignation n'est plus limitée au pôle destinataire.
  await login(page, ACCOUNTS.rh);
  await page.goto("/tickets");
  await page.getByTestId("new-ticket-button").click();
  await page.getByLabel("Objet").fill("Affiche recrutement saisonnier");
  await page
    .getByLabel("Description")
    .fill("Merci de préparer l'affiche, Antoine a les photos.");
  await page.getByTestId("ticket-topole").click();
  await page.getByRole("option", { name: "Communication" }).click();
  await page.getByTestId("ticket-assignee").click();
  await page.getByRole("option", { name: "Antoine Animateur" }).click();
  await page.getByRole("button", { name: "Créer le ticket" }).click();
  await expect(page.getByText(/Ticket T-\d+ créé\./)).toBeVisible();

  // Le ticket est directement « Affecté » au bon responsable.
  const row = page.locator("tr", { hasText: "Affiche recrutement saisonnier" });
  await expect(row.getByText("Affecté", { exact: true })).toBeVisible();
  await expect(row.getByText("Antoine Animateur")).toBeVisible();

  // L'animateur retrouve le ticket dans « Mes tickets » et est notifié.
  await login(page, ACCOUNTS.animateur);
  await page.goto("/tickets?vue=mine");
  await expect(
    page.getByRole("link", { name: "Affiche recrutement saisonnier" })
  ).toBeVisible();
  await page.goto("/notifications");
  await expect(page.getByText(/affecté à vous/).first()).toBeVisible();
});

test("un ticket avec échéance passée est marqué en retard", async ({ page }) => {
  await login(page, ACCOUNTS.direction);
  await page.goto("/tickets");
  await page.getByTestId("new-ticket-button").click();
  await page.getByLabel("Objet").fill("Ticket en retard e2e");
  await page.getByLabel("Description").fill("Test du badge de retard.");
  await page.getByLabel("Échéance").fill("2020-01-01");
  await page.getByRole("button", { name: "Créer le ticket" }).click();
  await expect(page.getByText(/créé\./)).toBeVisible();

  await expect(
    page
      .locator("tr", { hasText: "Ticket en retard e2e" })
      .getByText("En retard", { exact: true })
  ).toBeVisible();
});
