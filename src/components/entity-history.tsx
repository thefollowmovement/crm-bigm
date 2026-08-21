import { AUDIT_ACTION_LABELS } from "@/lib/labels";
import { listRecordHistory } from "@/services/audit.service";
import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/permissions";
import { AuditDiff } from "@/components/audit-diff";
import { Badge } from "@/components/ui/badge";

// Onglet « Historique » des fiches : dernières actions sur l'enregistrement.
// Visible uniquement avec audit:read (le composant rend null sinon).
export async function EntityHistory({
  user,
  tableName,
  recordId,
}: {
  user: SessionUser;
  tableName: string;
  recordId: string;
}) {
  if (!can(user, "audit:read")) return null;
  const logs = await listRecordHistory(user, tableName, recordId);

  const dateFormat = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });

  if (logs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Aucune action tracée pour cet enregistrement.
      </p>
    );
  }

  return (
    <ol className="space-y-3" data-testid="entity-history">
      {logs.map((log) => (
        <li key={log.id} className="rounded-lg border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">
              {AUDIT_ACTION_LABELS[log.action] ?? log.action}
            </Badge>
            <span className="font-medium">
              {log.user ? `${log.user.firstName} ${log.user.lastName}` : "Système"}
            </span>
            <span className="text-muted-foreground">
              {dateFormat.format(log.createdAt)}
            </span>
          </div>
          {log.action === "UPDATE" ? (
            <div className="mt-2">
              <AuditDiff changes={log.changes} />
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
