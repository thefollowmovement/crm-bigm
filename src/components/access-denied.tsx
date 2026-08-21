import { ShieldAlert } from "lucide-react";

// Affiché par les pages quand l'utilisateur n'a pas la permission requise.
// Les e2e s'appuient sur data-testid="access-denied".
export function AccessDenied() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-24 text-center"
      data-testid="access-denied"
    >
      <ShieldAlert className="h-10 w-10 text-muted-foreground" />
      <h1 className="text-lg font-semibold">Accès refusé</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Vous n&apos;avez pas les droits nécessaires pour consulter cette page.
        Contactez un administrateur si vous pensez qu&apos;il s&apos;agit d&apos;une erreur.
      </p>
    </div>
  );
}
