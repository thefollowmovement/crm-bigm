import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default function ConnexionPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-xl font-bold text-brand-foreground">
            M
          </div>
          <h1 className="text-2xl font-semibold">CRM Big M</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plateforme interne de pilotage du réseau
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
