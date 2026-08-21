import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { AUDIT_ACTION_LABELS } from "@/lib/labels";
import { listAuditLogs, listAuditedTables } from "@/services/audit.service";
import { AccessDenied } from "@/components/access-denied";
import { AuditDiff } from "@/components/audit-diff";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { AuditFilters } from "./audit-filters";

export const metadata: Metadata = { title: "Journal d'audit" };

const ACTION_VALUES = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "DOWNLOAD",
  "IMPORT",
] as const;

function actionBadgeVariant(action: string) {
  switch (action) {
    case "CREATE":
      return "success" as const;
    case "UPDATE":
      return "info" as const;
    case "DELETE":
    case "LOGIN_FAILED":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "audit:read")) return <AccessDenied />;

  const params = await searchParams;
  const tableName =
    typeof params.table === "string" && params.table !== "" ? params.table : undefined;
  const actionParam =
    typeof params.action === "string" &&
    (ACTION_VALUES as readonly string[]).includes(params.action)
      ? (params.action as (typeof ACTION_VALUES)[number])
      : undefined;
  const recordId =
    typeof params.record === "string" && params.record !== "" ? params.record : undefined;
  const page = typeof params.page === "string" ? Number(params.page) || 1 : 1;

  const [{ rows, pageCount, total }, tables] = await Promise.all([
    listAuditLogs(user, { tableName, action: actionParam, recordId, page }),
    listAuditedTables(user),
  ]);

  const dateFormat = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Europe/Paris",
  });

  const baseQuery = new URLSearchParams();
  if (tableName) baseQuery.set("table", tableName);
  if (actionParam) baseQuery.set("action", actionParam);
  if (recordId) baseQuery.set("record", recordId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Journal d&apos;audit</h1>
        <p className="text-sm text-muted-foreground">
          {total} action{total > 1 ? "s" : ""} tracée{total > 1 ? "s" : ""} — qui a
          fait quoi, quand, avec les valeurs avant/après.
        </p>
      </div>

      <AuditFilters
        tables={tables}
        current={{ table: tableName, action: actionParam, record: recordId }}
      />

      <div className="rounded-xl border bg-card" data-testid="audit-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Date</TableHead>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>Détail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Aucune entrée ne correspond à ces filtres.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {dateFormat.format(log.createdAt)}
                  </TableCell>
                  <TableCell>
                    {log.user
                      ? `${log.user.firstName} ${log.user.lastName}`
                      : "Système"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={actionBadgeVariant(log.action)}>
                      {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {log.tableName}
                    <div className="max-w-40 truncate text-xs" title={log.recordId}>
                      {log.recordId}
                    </div>
                  </TableCell>
                  <TableCell>
                    {log.action === "UPDATE" ? (
                      <AuditDiff changes={log.changes} />
                    ) : log.snapshot ? (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          Voir les valeurs
                        </summary>
                        <pre className="mt-1 max-w-xl overflow-x-auto rounded bg-muted p-2">
                          {JSON.stringify(log.snapshot, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-center gap-2">
          {page > 1 ? (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/admin/audit?${new URLSearchParams({ ...Object.fromEntries(baseQuery), page: String(page - 1) })}`}
              >
                Précédent
              </Link>
            </Button>
          ) : null}
          <span className="text-sm text-muted-foreground">
            Page {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/admin/audit?${new URLSearchParams({ ...Object.fromEntries(baseQuery), page: String(page + 1) })}`}
              >
                Suivant
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
