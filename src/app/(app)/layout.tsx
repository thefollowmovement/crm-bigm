import { requireUser } from "@/lib/auth/current-user";
import { can, type Permission } from "@/lib/authz/permissions";
import { ROLE_LABELS } from "@/lib/labels";
import { NAV_SECTIONS } from "@/components/app-shell/nav-config";
import { Sidebar } from "@/components/app-shell/sidebar";
import { UserMenu } from "@/components/app-shell/user-menu";
import { logoutAction } from "@/app/(auth)/connexion/actions";

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
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-card px-4">
          <div className="text-sm text-muted-foreground md:hidden">CRM Big M</div>
          <div className="flex-1" />
          <UserMenu
            name={`${user.firstName} ${user.lastName}`}
            roleLabel={ROLE_LABELS[user.role] ?? user.role}
            onLogout={logoutAction}
          />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
