import type { Metadata } from "next";
import { headers } from "next/headers";

import { clientIpFromHeaders, rateLimit } from "@/lib/rate-limit";
import { findValidInvite } from "@/services/transmission-invites.service";

import { ExternalTransmissionForm } from "./external-form";

// Formulaire PUBLIC de transmission comptable (étape 49) : accessible par un
// lien à usage unique généré par la comptabilité — aucune session, aucune
// mention du CRM (metadata absolue), réponse neutre si le lien est invalide.
export const metadata: Metadata = {
  title: { absolute: "Dépôt de documents sécurisé" },
  robots: { index: false, follow: false },
};

function InvalidLink() {
  return (
    <div className="mx-auto max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
      <p className="text-lg font-semibold" data-testid="external-invalid">
        Ce lien n&apos;est plus valide.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Il a peut-être expiré ou déjà été utilisé. Contactez la personne qui
        vous l&apos;a envoyé pour en obtenir un nouveau.
      </p>
    </div>
  );
}

export default async function PublicTransmissionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ip = clientIpFromHeaders(await headers());

  const shell = (content: React.ReactNode) => (
    <main className="flex min-h-svh items-start justify-center bg-background px-4 py-12">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Dépôt sécurisé
          </p>
          <h1 className="text-2xl font-semibold">Transmettre un document</h1>
        </div>
        {content}
      </div>
    </main>
  );

  // Limitation de débit sur la consultation aussi (anti-énumération).
  if (!rateLimit(`tr-view:${ip}`, { limit: 60, windowMs: 10 * 60 * 1000 })) {
    return shell(<InvalidLink />);
  }

  const check = await findValidInvite(token);
  if (!check.valid) return shell(<InvalidLink />);

  return shell(
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <p className="mb-4 text-sm text-muted-foreground">
        Ce formulaire vous permet d&apos;envoyer une facture ou une demande à
        la comptabilité
        {check.invite.structure
          ? ` (structure ${check.invite.structure.name})`
          : ""}
        . Adresse associée : <strong>{check.invite.email}</strong>.
      </p>
      <ExternalTransmissionForm
        token={token}
        defaultName={check.invite.externalName ?? ""}
      />
    </div>
  );
}
