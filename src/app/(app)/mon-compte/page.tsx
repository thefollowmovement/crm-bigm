import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { ROLE_LABELS } from "@/lib/labels";
import { getMyProfile } from "@/services/account.service";

import { EmailForm, PasswordForm, ProfileForm } from "./account-forms";

export const metadata: Metadata = { title: "Mon compte" };

// Accessible à TOUT utilisateur connecté (y compris SALARIE et FRANCHISE) :
// le périmètre est strictement le compte de la session.
export default async function MonComptePage() {
  const user = await requireUser();
  const profile = await getMyProfile(user);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mon compte</h1>
        <p className="text-sm text-muted-foreground">
          {profile.email} · {ROLE_LABELS[profile.role] ?? profile.role}
        </p>
      </div>

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <h2 className="font-medium">Mes coordonnées</h2>
        <ProfileForm
          profile={{
            firstName: profile.firstName,
            lastName: profile.lastName,
            phone: profile.phone,
          }}
        />
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <h2 className="font-medium">Adresse e-mail de connexion</h2>
        <p className="text-sm text-muted-foreground">
          Par sécurité, votre mot de passe actuel est demandé pour changer
          d&apos;adresse.
        </p>
        <EmailForm email={profile.email} />
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <h2 className="font-medium">Mot de passe</h2>
        <p className="text-sm text-muted-foreground">
          Au moins 10 caractères. Vos autres appareils seront déconnectés.
        </p>
        <PasswordForm />
      </section>
    </div>
  );
}
