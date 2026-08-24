// Rendu des e-mails de relance — fichier PUR, testé en unit.
//
// Les modèles (sujet + corps HTML) contiennent des variables {{…}} remplacées
// à l'envoi. Les VALEURS des variables sont échappées dans le HTML (le modèle
// lui-même est du HTML de confiance, rédigé par l'admin).

export const TEMPLATE_VARIABLES = [
  { key: "contact_prenom", label: "Prénom du contact franchisé" },
  { key: "contact_nom", label: "Nom du contact franchisé" },
  { key: "societe", label: "Raison sociale du franchisé" },
  { key: "boutique", label: "Boutique (code — nom)" },
  { key: "facture_numero", label: "Numéro de la facture" },
  { key: "facture_montant", label: "Montant TTC de la facture" },
  { key: "facture_echeance", label: "Date d'échéance" },
  { key: "niveau", label: "Niveau de relance (1, 2 ou 3)" },
] as const;

export type TemplateVariables = Partial<
  Record<(typeof TEMPLATE_VARIABLES)[number]["key"], string>
>;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Remplace {{cle}} par sa valeur (échappée si escapeValues). Une variable
// inconnue reste visible telle quelle — l'admin repère ainsi ses fautes de
// frappe dans l'aperçu.
export function renderTemplate(
  template: string,
  vars: TemplateVariables,
  options: { escapeValues?: boolean } = {}
): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) => {
    const value = (vars as Record<string, string | undefined>)[key];
    if (value === undefined) return match;
    return options.escapeValues ? escapeHtml(value) : value;
  });
}

// Assemble l'e-mail complet : header + corps + signature + footer, dans une
// mise en page simple compatible clients mail (tables, styles inline).
export function buildEmailHtml(input: {
  headerHtml: string | null;
  bodyHtml: string;
  signatureHtml: string | null;
  footerHtml: string | null;
}): string {
  const section = (html: string | null) => (html ? `${html}\n` : "");
  return [
    `<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#f4f4f4;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">`,
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2933;">`,
    `<tr><td style="padding:24px 32px;">`,
    section(input.headerHtml),
    `${input.bodyHtml}\n`,
    section(input.signatureHtml),
    `</td></tr>`,
    input.footerHtml
      ? `<tr><td style="padding:16px 32px;border-top:1px solid #e4e7eb;font-size:12px;color:#6b7280;">${input.footerHtml}</td></tr>`
      : "",
    `</table></td></tr></table></body></html>`,
  ].join("");
}
