import { requireUser } from "@/lib/auth/current-user";
import { can, type Permission } from "@/lib/authz/permissions";
import { ROLE_LABELS } from "@/lib/labels";
import { NAV_SECTIONS } from "@/components/app-shell/nav-config";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import { Sidebar } from "@/components/app-shell/sidebar";
import { UserMenu } from "@/components/app-shell/user-menu";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/(auth)/connexion/actions";
import { exitImpersonationAction } from "@/app/(app)/admin/utilisateurs/actions";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Vérification autoritaire de session pour toute la zone applicative.
  const user = await requireUser();

  const allowedHrefs = NAV_SECTIONS.flatMap((s) =>
    s.items
      .filter(
        (item) =>
          item.permission === null || can(user, item.permission as Permission)
      )
      .map((item) => item.href)
  );

  return (
    <div className="flex min-h-screen">
      <Sidebar allowedHrefs={allowedHrefs} />
      <div className="flex min-w-0 flex-1 flex-col">
        {user.impersonatorUserId ? (
          <div
            className="flex items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-sm font-medium text-amber-950"
            data-testid="impersonation-banner"
          >
            <span>
              Vous êtes connecté en tant que {user.firstName} {user.lastName}.
            </span>
            <form action={exitImpersonationAction}>
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="h-7 border-amber-950/30 bg-transparent hover:bg-amber-400"
                data-testid="impersonation-exit"
              >
                Revenir à mon compte
              </Button>
            </form>
          </div>
        ) : null}
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between bg-background/85 px-4 backdrop-blur md:px-8">
          <div className="text-sm font-semibold md:hidden">CRM Big M</div>
          <div className="flex-1" />
          <NotificationBell />
          <UserMenu
            name={`${user.firstName} ${user.lastName}`}
            roleLabel={ROLE_LABELS[user.role] ?? user.role}
            onLogout={logoutAction}
          />
        </header>
        <main className="flex-1 px-4 pb-10 pt-2 md:px-8">{children}</main>
      </div>
    </div>
  );
}
