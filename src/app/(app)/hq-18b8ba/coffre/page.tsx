import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { listSecrets } from "@/services/vault.service";
import { AccessDenied } from "@/components/access-denied";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  CreateSecretDialog,
  DeleteSecretButton,
  RevealSecretButton,
} from "./vault-components";

export const metadata: Metadata = { title: "Coffre-fort" };

export default async function VaultPage() {
  const user = await requireUser();
  if (!can(user, "vault:read")) return <AccessDenied />;

  const canWrite = can(user, "vault:write");
  const secrets = await listSecrets(user);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Coffre-fort</h1>
          <p className="text-sm text-muted-foreground">
            Secrets chiffrés AES-256-GCM — révélation à l&apos;unité, chaque
            lecture est journalisée dans l&apos;audit.
          </p>
        </div>
        {canWrite ? <CreateSecretDialog /> : null}
      </div>

      <div className="rounded-xl border bg-card">
        <Table data-testid="vault-table">
          <TableHeader>
            <TableRow>
              <TableHead>Libellé</TableHead>
              <TableHead>Identifiant</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Secret</TableHead>
              {canWrite ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {secrets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Aucun secret dans le coffre.
                </TableCell>
              </TableRow>
            ) : (
              secrets.map((secret) => (
                <TableRow key={secret.id}>
                  <TableCell>
                    <div className="font-medium">{secret.label}</div>
                    {secret.notes ? (
                      <div className="text-xs text-muted-foreground">
                        {secret.notes}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {secret.username ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {secret.url ?? "—"}
                  </TableCell>
                  <TableCell>
                    <RevealSecretButton secretId={secret.id} />
                  </TableCell>
                  {canWrite ? (
                    <TableCell>
                      <DeleteSecretButton secretId={secret.id} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
