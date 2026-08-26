import type { Metadata } from "next";
import { Download } from "lucide-react";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import {
  backupDir,
  formatBytes,
  ftpConfigFromEnv,
  retentionDays,
} from "@/lib/backup/config";
import { listBackups } from "@/services/backups.service";
import { AccessDenied } from "@/components/access-denied";
import { InfoHint } from "@/components/info-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { DeleteBackupButton, RunBackupButton } from "./backup-buttons";

export const metadata: Metadata = { title: "Sauvegardes" };

function statusBadge(status: string) {
  switch (status) {
    case "OK":
      return <Badge variant="success">OK</Badge>;
    case "EN_COURS":
      return <Badge variant="info">En cours</Badge>;
    default:
      return <Badge variant="destructive">Erreur</Badge>;
  }
}

export default async function SauvegardesPage() {
  const user = await requireUser();
  if (!can(user, "backup:manage")) return <AccessDenied />;

  const rows = await listBackups(user);
  const ftp = ftpConfigFromEnv(process.env);
  const dateFormat = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Europe/Paris",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Sauvegardes de la base</h1>
          <p className="text-sm text-muted-foreground">
            Sauvegarde automatique chaque nuit à 05h30 (rétention{" "}
            {retentionDays()} jours), ou à la demande ci-contre. Format
            pg_dump, restaurable avec pg_restore.
          </p>
        </div>
        <RunBackupButton />
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>
                Type{" "}
                <InfoHint
                  text={`Les sauvegardes planifiées de plus de ${retentionDays()} jours sont purgées automatiquement (variable d'environnement BACKUP_RETENTION_DAYS) ; les sauvegardes manuelles sont conservées jusqu'à suppression explicite.`}
                />
              </TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Taille</TableHead>
              <TableHead>Envoi FTP</TableHead>
              <TableHead>Par</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Aucune sauvegarde pour l&apos;instant.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((backup) => (
                <TableRow key={backup.id} data-testid={`backup-row-${backup.filename}`}>
                  <TableCell className="font-medium">
                    {dateFormat.format(backup.createdAt)}
                    <div className="font-mono text-xs text-muted-foreground">
                      {backup.filename}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {backup.kind === "MANUEL" ? "Manuelle" : "Planifiée"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {statusBadge(backup.status)}
                    {backup.error ? (
                      <div className="mt-1 max-w-64 text-xs text-destructive">
                        {backup.error}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatBytes(backup.sizeBytes)}
                  </TableCell>
                  <TableCell>
                    {backup.remoteStatus === "ENVOYE" ? (
                      <Badge variant="success">Envoyée</Badge>
                    ) : backup.remoteStatus === "ERREUR" ? (
                      <span title={backup.remoteError ?? undefined}>
                        <Badge variant="destructive">Échec</Badge>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {backup.createdBy
                      ? `${backup.createdBy.firstName} ${backup.createdBy.lastName}`
                      : "Automatique"}
                  </TableCell>
                  <TableCell className="text-right">
                    {backup.status === "OK" ? (
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={`/api/backups/${backup.id}`}
                          data-testid={`download-backup-${backup.filename}`}
                        >
                          <Download /> Télécharger
                        </a>
                      </Button>
                    ) : null}
                    <DeleteBackupButton backupId={backup.id} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Où vont les sauvegardes ?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Les fichiers sont écrits dans <code>{backupDir()}</code> sur le
            serveur (variable <code>BACKUP_DIR</code>). Les sauvegardes
            planifiées de plus de {retentionDays()} jours sont purgées
            automatiquement (<code>BACKUP_RETENTION_DAYS</code>) ; les
            sauvegardes manuelles sont conservées jusqu&apos;à suppression.
          </p>
          <p data-testid="ftp-status">
            Envoi distant FTP :{" "}
            {ftp ? (
              <>
                configuré vers <code>{ftp.host}</code> — chaque sauvegarde y est
                déposée automatiquement.
              </>
            ) : (
              <>
                non configuré. Renseignez <code>BACKUP_FTP_HOST</code>,{" "}
                <code>BACKUP_FTP_USER</code> et <code>BACKUP_FTP_PASSWORD</code>{" "}
                (voir .env.example) pour dupliquer chaque sauvegarde hors du
                serveur.
              </>
            )}
          </p>
          <p>
            Pour un « drive » type Google Drive : installez le client de
            synchronisation de votre choix (Google Drive pour ordinateur,
            rclone…) sur le serveur et pointez-le sur le dossier{" "}
            <code>{backupDir()}</code> — chaque nouveau fichier y sera
            répliqué. L&apos;envoi FTP ci-dessus reste la solution intégrée.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
