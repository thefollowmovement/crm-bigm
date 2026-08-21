import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE, validateSessionToken } from "@/lib/auth/session";
import { listNotifications, unreadCount } from "@/services/notifications.service";

export const dynamic = "force-dynamic";

// Alimente la cloche de notifications (polling léger côté client).
export async function GET() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const user = token ? await validateSessionToken(token) : null;
  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const [unread, recent] = await Promise.all([
    unreadCount(user),
    listNotifications(user, 8),
  ]);

  return NextResponse.json({
    unread,
    recent: recent.map((n) => ({
      id: n.id,
      title: n.title,
      link: n.link,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
  });
}
