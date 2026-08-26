import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { listSoftware } from "@/services/software.service";
import { listUsers } from "@/services/users.service";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { CreateSoftwareDialog, EditSoftwareDialog } from "./software-components";

export const metadata: Metadata = { title: "Registre des logiciels" };

export default async function SoftwarePage() {
  const user = await requireUser();
  if (!can(user, "software:read")) return <AccessDenied />;

  const canWrite = can(user, "software:write");
  const [software, members] = await Promise.all([
    listSoftware(user),
    canWrite ? listUsers(user) : Promise.resolve([]),
  ]);
  const memberOptions = members
    .filter((m) => m.isActive)
    .map((m) => ({ id: m.id, label: `${m.firstName} ${m.lastName}` }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Registre des logiciels</h1>
          <p className="text-sm text-muted-foreground">
            Qui utilise quoi, à quel niveau — les mots de passe restent dans le
            coffre-fort chiffré.
          </p>
        </div>
        {canWrite ? <CreateSoftwareDialog owners={memberOptions} /> : null}
      </div>

      <div className="rounded-xl border bg-card">
        <Table data-testid="software-table">
          <TableHeader>
            <TableRow>
              <TableHead>Logiciel</TableHead>
              <TableHead>Utilité</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Personnes autorisées</TableHead>
              <TableHead>Statut</TableHead>
              {canWrite ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {software.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Aucun logiciel recensé.
                </TableCell>
              </TableRow>
            ) : (
              software.map((sw) => (
                <TableRow key={sw.id}>
                  <TableCell>
                    <div className="font-medium">{sw.name}</div>
                    {sw.url ? (
                      <a
                        href={sw.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                      >
                        {sw.url}
                      </a>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {sw.purpose ?? "—"}
                  </TableCell>
                  <TableCell>
                    {sw.owner ? `${sw.owner.firstName} ${sw.owner.lastName}` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {sw.users.length === 0
                      ? "—"
                      : sw.users
                          .map((u) => `${u.user.firstName} ${u.user.lastName}`)
                          .join(", ")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={sw.isActive ? "success" : "secondary"}>
                      {sw.isActive ? "Utilisé" : "Décommissionné"}
                    </Badge>
                  </TableCell>
                  {canWrite ? (
                    <TableCell>
                      <EditSoftwareDialog
                        softwareId={sw.id}
                        isActive={sw.isActive}
                        owners={memberOptions}
                        members={memberOptions}
                        selectedUserIds={sw.users.map((u) => u.user.id)}
                        values={{
                          name: sw.name,
                          purpose: sw.purpose,
                          url: sw.url,
                          ownerId: sw.ownerId,
                          accessLevelNotes: sw.accessLevelNotes,
                        }}
                      />
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
