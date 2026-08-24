import { Info } from "lucide-react";

// Icône d'information avec info-bulle native (title) : explique une valeur
// calculée ou un réglage défini hors de la page (variable d'environnement,
// job cron, autre module). Utilisable dans les composants serveur.
export function InfoHint({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <span
      tabIndex={0}
      title={text}
      aria-label={text}
      className={`inline-flex cursor-help align-middle text-muted-foreground hover:text-foreground focus:text-foreground ${className}`}
      data-testid="info-hint"
    >
      <Info className="size-3.5" aria-hidden="true" />
    </span>
  );
}
