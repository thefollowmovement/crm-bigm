import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { listNotifications } from "@/services/notifications.service";
import { Badge } from "@/components/ui/badge";

import { MarkAllReadButton, MarkReadButton } from "./notification-buttons";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const rows = await listNotifications(user, 100);

  const dateFormat = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Alertes qui vous sont adressées selon vos droits.
          </p>
        </div>
        <MarkAllReadButton />
      </div>

      <div className="space-y-2" data-testid="notification-list">
        {rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Aucune notification.
          </p>
        ) : (
          rows.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 rounded-lg border bg-card p-3 ${
                n.readAt ? "opacity-70" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {!n.readAt ? <Badge variant="brand">Nouveau</Badge> : null}
                  <span className="font-medium">
                    {n.link ? (
                      <Link href={n.link} className="hover:underline">
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}
                  </span>
                </div>
                {n.body ? (
                  <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {dateFormat.format(n.createdAt)}
                </p>
              </div>
              {!n.readAt ? <MarkReadButton notificationId={n.id} /> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
