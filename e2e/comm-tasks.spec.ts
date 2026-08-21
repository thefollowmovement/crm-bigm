import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("cycle : demande franchisé → affectation pôle → terminé → validation du demandeur", async ({
  page,
}) => {
  await login(page, ACCOUNTS.franchise);

  // La tâche du seed (BM-001, boutique du franchisé) est visible.
  await page.goto("/communication");
  await expect(page.getByTestId("comm-tasks-table")).toContainText(
    "Campagne rentrée"
  );

  // Le franchisé ne peut créer qu'une « Demande boutique ».
  await page.getByTestId("new-comm-task-button").click();
  await page.getByTestId("comm-type-select").click();
  await expect(page.getByRole("option", { name: "Campagne" })).toHaveCount(0);
  await page.getByRole("option", { name: "Demande boutique" }).click();
  await page.getByLabel("Objet").fill("Affiche ouverture samedi (e2e)");
  await page.getByTestId("comm-store-select").click();
  await page.getByRole("option", { name: /BM-001/ }).click();
  await page.getByTestId("comm-task-submit").click();
  await expect(page.getByText(/Tâche COM-\d{6} créée\./)).toBeVisible();

  // Ouvrir la fiche : NOUVEAU, aucun bouton d'avancement pour le demandeur.
  await page
    .getByRole("row", { name: /Affiche ouverture samedi/ })
    .getByRole("link")
    .click();
  await expect(page.getByTestId("comm-task-status")).toContainText("Nouveau");
  await expect(page.getByTestId("comm-to-AFFECTE")).toHaveCount(0);
  await expect(page.getByTestId("comm-assign-select")).toHaveCount(0);
  const taskUrl = page.url();

  // Le pôle communication s'affecte la tâche et la mène à TERMINÉ.
  await login(page, ACCOUNTS.communication);
  await page.goto(taskUrl);
  await page.getByTestId("comm-assign-select").click();
  await page.getByRole("option", { name: /Chloé Communication/ }).click();
  await page.getByTestId("comm-assign-submit").click();
  await expect(page.getByTestId("comm-assignee")).toContainText("Chloé");
  await expect(page.getByTestId("comm-task-status")).toContainText("Affecté");

  await page.getByTestId("comm-to-EN_COURS").click();
  await expect(page.getByTestId("comm-task-status")).toContainText("En cours");
  await page.getByTestId("comm-to-TERMINE").click();
  await expect(page.getByTestId("comm-task-status")).toContainText("Terminé");
  // Le pôle (non demandeur) ne valide pas.
  await expect(page.getByTestId("comm-to-VALIDE")).toHaveCount(0);

  // Le demandeur valide, même sans droit d'écriture, puis commente.
  await login(page, ACCOUNTS.franchise);
  await page.goto(taskUrl);
  await page.getByTestId("comm-to-VALIDE").click();
  await expect(page.getByTestId("comm-task-status")).toContainText("Validé");

  await page.getByTestId("comm-comment-input").fill("Parfait, merci !");
  await page.getByTestId("comm-comment-submit").click();
  await expect(page.getByTestId("comm-comments")).toContainText("Parfait, merci !");
});

test("partenaires : notes internes réservées au pôle, module interdit au franchisé", async ({
  page,
}) => {
  // L'animateur lit la fiche sans les notes internes.
  await login(page, ACCOUNTS.animateur);
  await page.goto("/partenaires");
  await expect(page.getByTestId("partners-table")).toContainText("Studio Graphik");
  await page.getByRole("link", { name: "Studio Graphik" }).click();
  await expect(page.getByTestId("partner-title")).toContainText("Studio Graphik");
  await expect(page.getByTestId("partner-tasks")).toContainText("Campagne rentrée");
  await expect(page.getByTestId("partner-internal-notes")).toHaveCount(0);
  await expect(page.getByText(/Remise de 10/)).toHaveCount(0);
  const partnerUrl = page.url();

  // Le pôle communication voit et édite les notes internes.
  await login(page, ACCOUNTS.communication);
  await page.goto(partnerUrl);
  await expect(page.getByTestId("partner-internal-notes")).toHaveValue(
    /Remise de 10 % négociée/
  );

  // Le franchisé n'a ni l'entrée de menu ni l'accès à la page.
  await login(page, ACCOUNTS.franchise);
  await expect(page.getByRole("link", { name: "Partenaires", exact: true })).toHaveCount(
    0
  );
  await page.goto("/partenaires");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});
