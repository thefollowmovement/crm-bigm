import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE, validateSessionToken } from "@/lib/auth/session";
import { can } from "@/lib/authz/permissions";
import { JOBS, safeRun } from "@/lib/jobs/scheduler";

export const dynamic = "force-dynamic";

// Exécution manuelle d'un job planifié (admin) — aussi utilisée par les tests.
export async function POST(request: Request) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const user = token ? await validateSessionToken(token) : null;
  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (!can(user, "user:manage")) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  let job: string | undefined;
  try {
    const body = (await request.json()) as { job?: string };
    job = body.job;
  } catch {
    // corps absent ou invalide
  }
  if (!job || !(job in JOBS)) {
    return NextResponse.json(
      { error: `Job inconnu. Jobs disponibles : ${Object.keys(JOBS).join(", ")}.` },
      { status: 400 }
    );
  }

  const result = await safeRun(job as keyof typeof JOBS);
  return NextResponse.json({ job, result });
}
