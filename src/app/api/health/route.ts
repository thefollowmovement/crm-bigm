import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Healthcheck Docker : vérifie que l'app répond et (dès que Prisma est en
// place) que la base est joignable. Le check DB est ajouté à l'étape 2.
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
