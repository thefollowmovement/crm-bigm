import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import {
  buildEmailHtml,
  renderTemplate,
  TEMPLATE_VARIABLES,
} from "@/lib/email/render";
import {
  getEmailSettings,
  listEmailTemplates,
} from "@/services/email.service";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  EmailSettingsForm,
  EmailTemplateForm,
  TestEmailForm,
} from "./email-components";

export const metadata: Metadata = { title: "E-mails" };

// Valeurs d'exemple pour l'aperçu des modèles.
const SAMPLE_VARS = {
  contact_prenom: "Farid",
  contact_nom: "Franchisé",
  societe: "SARL Resto Lyon",
  boutique: "BM-001 — Big M Lyon Part-Dieu",
  facture_numero: "F2026-0042",
  facture_montant: "1 200,00 €",
  facture_echeance: "15/08/2026",
  niveau: "1",
};

// Modèles proposés par défaut tant que rien n'est enregistré.
const DEFAULT_TEMPLATES: Record<number, { subject: string; bodyHtml: string }> = {
  1: {
    subject: "Rappel — facture {{facture_numero}} ({{facture_montant}})",
    bodyHtml:
      "<p>Bonjour {{contact_prenom}} {{contact_nom}},</p>\n" +
      "<p>Sauf erreur de notre part, la facture {{facture_numero}} de {{facture_montant}}, " +
      "échue le {{facture_echeance}} pour la boutique {{boutique}}, reste impayée.</p>\n" +
      "<p>Merci de procéder au règlement dès que possible.</p>",
  },
  2: {
    subject: "Relance — facture {{facture_numero}} toujours impayée",
    bodyHtml:
      "<p>Bonjour {{contact_prenom}} {{contact_nom}},</p>\n" +
      "<p>Malgré notre premier rappel, la facture {{facture_numero}} de {{facture_montant}} " +
      "(échéance {{facture_echeance}}) demeure impayée.</p>\n" +
      "<p>Merci de régulariser sous 8 jours ou de nous contacter.</p>",
  },
  3: {
    subject: "Mise en demeure — facture {{facture_numero}}",
    bodyHtml:
      "<p>Bonjour {{contact_prenom}} {{contact_nom}},</p>\n" +
      "<p>La facture {{facture_numero}} de {{facture_montant}}, échue le {{facture_echeance}}, " +
      "reste impayée malgré nos relances. La présente vaut mise en demeure de payer sous 8 jours.</p>\n" +
      "<p>À défaut, nous nous réservons le droit d'engager toute procédure de recouvrement.</p>",
  },
};

export default async function EmailsPage() {
  const user = await requireUser();
  if (!can(user, "email:manage")) return <AccessDenied />;

  const [settings, templates] = await Promise.all([
    getEmailSettings(user),
    listEmailTemplates(user),
  ]);
  const byLevel = new Map(templates.map((t) => [t.level, t]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">E-mails</h1>
        <p className="text-sm text-muted-foreground">
          Paramètres SMTP, habillage (header, signature, footer) et modèles des
          relances de factures — le mot de passe SMTP est chiffré comme le
          coffre-fort.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Serveur SMTP &amp; habillage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <EmailSettingsForm settings={settings} />
          <div className="border-t pt-4">
            <TestEmailForm />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Variables disponibles dans les modèles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {TEMPLATE_VARIABLES.map((v) => (
              <span
                key={v.key}
                className="rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs"
                title={v.label}
              >
                {`{{${v.key}}}`}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Les variables sont remplacées à l&apos;envoi par les données de la
            facture et du franchisé ; une variable inconnue reste affichée telle
            quelle pour repérer les fautes de frappe.
          </p>
        </CardContent>
      </Card>

      {[1, 2, 3].map((level) => {
        const template = byLevel.get(level);
        const current = template ?? DEFAULT_TEMPLATES[level];
        const preview = buildEmailHtml({
          headerHtml: settings?.headerHtml ?? null,
          bodyHtml: renderTemplate(current.bodyHtml, SAMPLE_VARS, {
            escapeValues: true,
          }),
          signatureHtml: settings?.signatureHtml ?? null,
          footerHtml: settings?.footerHtml ?? null,
        });
        return (
          <Card key={level}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>
                Relance niveau {level}
                {level === 3 ? " (mise en demeure)" : ""}
              </CardTitle>
              {template ? (
                <Badge variant="success">Enregistré</Badge>
              ) : (
                <Badge variant="secondary">Modèle proposé — à enregistrer</Badge>
              )}
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-2">
              <EmailTemplateForm
                level={level}
                subject={current.subject}
                bodyHtml={current.bodyHtml}
              />
              <div className="space-y-1.5">
                <div className="text-sm font-medium">
                  Aperçu (données d&apos;exemple, habillage inclus)
                </div>
                <iframe
                  title={`Aperçu relance niveau ${level}`}
                  srcDoc={preview}
                  sandbox=""
                  className="h-80 w-full rounded-lg border bg-white"
                  data-testid={`template-preview-${level}`}
                />
                <p className="text-xs text-muted-foreground">
                  Sujet : {renderTemplate(current.subject, SAMPLE_VARS)}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
