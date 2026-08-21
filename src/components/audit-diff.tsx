// Rendu lisible d'un diff d'audit { champ: { old, new } }.
export function AuditDiff({ changes }: { changes: unknown }) {
  if (!changes || typeof changes !== "object") return null;
  const entries = Object.entries(changes as Record<string, { old: unknown; new: unknown }>);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-0.5 text-xs">
      {entries.map(([field, { old: oldV, new: newV }]) => (
        <div key={field} className="flex flex-wrap items-baseline gap-1.5">
          <span className="font-medium">{field}</span>
          <span className="rounded bg-destructive/10 px-1 text-destructive line-through">
            {formatValue(oldV)}
          </span>
          <span aria-hidden>→</span>
          <span className="rounded bg-emerald-500/10 px-1 text-emerald-700 dark:text-emerald-400">
            {formatValue(newV)}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "∅";
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
