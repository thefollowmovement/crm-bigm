import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

const pdfBuffer = Buffer.from("%PDF-1.4\n% contenu e2e\n");

test("cycle documentaire : création, téléchargement, v2 applicable", async ({
  page,
}) => {
  await login(page, ACCOUNTS.admin);
  await page.goto("/documents");

  await page.getByTestId("new-document-button").click();
  await page.getByLabel("Titre").fill("Procédure E2E");
  await page.getByLabel("Fichier").setInputFiles({
    name: "procedure-v1.pdf",
    mimeType: "application/pdf",
    buffer: pdfBuffer,
  });
  await page.getByRole("button", { name: "Ajouter le document" }).click();
  await expect(page.getByText("Document « Procédure E2E » ajouté.")).toBeVisible();

  await page.getByRole("link", { name: "Procédure E2E" }).click();
  await expect(page.getByTestId("document-title")).toContainText("Procédure E2E");

  // Téléchargement v1 avec la session en cours
  const href = await page.getByTestId("download-v1").getAttribute("href");
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toContain("procedure-v1.pdf");

  // Ajout d'une v2 → devient applicable
  await page.getByTestId("add-version-button").click();
  await page.getByLabel("Fichier").setInputFiles({
    name: "procedure-v2.pdf",
    mimeType: "application/pdf",
    buffer: pdfBuffer,
  });
  await page.getByLabel("Motif de la nouvelle version").fill("Correction");
  await page.getByRole("button", { name: "Ajouter la version" }).click();
  await expect(page.getByText("Nouvelle version ajoutée", { exact: false })).toBeVisible();

  await expect(
    page.getByTestId("version-row-2").getByText("Applicable")
  ).toBeVisible();
  await expect(page.getByTestId("version-row-1")).not.toContainText("Applicable");

  // Sans session : 401
  const anonymous = await page.context().browser()!.newContext();
  const anonResponse = await anonymous.request.get(
    new URL(href!, page.url()).toString()
  );
  expect(anonResponse.status()).toBe(401);
  await anonymous.close();
});

test("dossiers : classement, navigation, déplacement, suppression à vide", async ({
  page,
}) => {
  await login(page, ACCOUNTS.direction);
  await page.goto("/documents");

  // Création d'un dossier à la racine.
  await page.getByTestId("new-folder-button").click();
  await page.getByTestId("folder-name-input").fill("Juridique 2026");
  await page.getByTestId("folder-submit").click();
  await expect(page.getByText("Dossier « Juridique 2026 » créé.")).toBeVisible();
  await page.getByTestId("folder-Juridique 2026").click();
  await expect(page.getByTestId("folder-breadcrumb")).toContainText("Juridique 2026");

  // Un document créé ICI est rangé dans le dossier (absent de la racine).
  await page.getByTestId("new-document-button").click();
  await page.getByLabel("Titre").fill("Bail type 2026");
  await page.getByLabel("Fichier").setInputFiles({
    name: "bail-type.pdf",
    mimeType: "application/pdf",
    buffer: pdfBuffer,
  });
  await page.getByRole("button", { name: "Ajouter le document" }).click();
  await expect(page.getByText("Document « Bail type 2026 » ajouté.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Bail type 2026" })).toBeVisible();

  await page.goto("/documents");
  await expect(page.getByRole("link", { name: "Bail type 2026" })).toHaveCount(0);

  // Impossible de supprimer un dossier non vide.
  await page.getByTestId("folder-Juridique 2026").click();
  await page.getByTestId("folder-delete-button").click();
  await expect(page.getByText(/n'est pas vide/)).toBeVisible();

  // Déplacement du document vers la racine depuis sa fiche.
  await page.getByRole("link", { name: "Bail type 2026" }).click();
  await page.getByTestId("move-select").click();
  await page.getByRole("option", { name: "Racine de la bibliothèque" }).click();
  await page.getByTestId("move-submit").click();
  await expect(page.getByText("Document déplacé.")).toBeVisible();

  // Renommage puis suppression du dossier (désormais vide).
  await page.goto("/documents");
  await page.getByTestId("folder-Juridique 2026").click();
  await page.getByTestId("folder-rename-button").click();
  await page.getByTestId("folder-rename-input").fill("Juridique (archives)");
  await page.getByTestId("folder-rename-submit").click();
  await expect(page.getByText("Dossier renommé.")).toBeVisible();
  await page.getByTestId("folder-delete-button").click();
  // Le dossier supprimé n'existe plus : la vue retombe à la racine, où le
  // document déplacé est bien présent.
  await expect(page.getByRole("link", { name: "Bail type 2026" })).toBeVisible();
  await expect(page.getByTestId("folder-Juridique (archives)")).toHaveCount(0);
});

test("la création de dossiers est refusée sans la permission document:folder", async ({
  page,
}) => {
  // La communication publie des documents mais ne gère pas les dossiers
  // (droit délégable via /hq-18b8ba/permissions).
  await login(page, ACCOUNTS.communication);
  await page.goto("/documents");
  await expect(page.getByTestId("new-document-button")).toBeVisible();
  await expect(page.getByTestId("new-folder-button")).toHaveCount(0);
});

test("un fichier d'un type interdit est refusé", async ({ page }) => {
  await login(page, ACCOUNTS.admin);
  await page.goto("/documents");

  await page.getByTestId("new-document-button").click();
  await page.getByLabel("Titre").fill("Fichier suspect");
  await page.getByLabel("Fichier").setInputFiles({
    name: "malware.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("PK"),
  });
  await page.getByRole("button", { name: "Ajouter le document" }).click();
  await expect(page.getByText("Type de fichier non autorisé", { exact: false })).toBeVisible();
});

test("le franchisé ne voit que les documents partagés avec lui", async ({ page }) => {
  // L'admin crée un document siège et un document partagé franchisés
  await login(page, ACCOUNTS.admin);
  await page.goto("/documents");

  await page.getByTestId("new-document-button").click();
  await page.getByLabel("Titre").fill("Interne siège E2E");
  await page.getByLabel("Fichier").setInputFiles({
    name: "interne.pdf",
    mimeType: "application/pdf",
    buffer: pdfBuffer,
  });
  await page.getByRole("button", { name: "Ajouter le document" }).click();
  await expect(page.getByText("Document « Interne siège E2E » ajouté.")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByTestId("new-document-button").click();
  await page.getByLabel("Titre").fill("Partagé franchisés E2E");
  await page.getByLabel("Fichier").setInputFiles({
    name: "partage.pdf",
    mimeType: "application/pdf",
    buffer: pdfBuffer,
  });
  await page.getByTestId("visibility-FRANCHISE").click();
  await page.getByRole("button", { name: "Ajouter le document" }).click();
  await expect(
    page.getByText("Document « Partagé franchisés E2E » ajouté.")
  ).toBeVisible();

  await page.context().clearCookies();
  await login(page, ACCOUNTS.franchise);
  await page.goto("/documents");
  await expect(page.getByText("Partagé franchisés E2E")).toBeVisible();
  await expect(page.getByText("Interne siège E2E")).toHaveCount(0);
});
