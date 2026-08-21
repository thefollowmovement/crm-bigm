import "server-only";

import { asc, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { franchisees, users } from "@/db/schema";

// Options des selects du formulaire boutique.
export async function loadStoreFormOptions() {
  const [franchiseeRows, animateurRows] = await Promise.all([
    db.query.franchisees.findMany({
      orderBy: [asc(franchisees.companyName)],
      columns: { id: true, companyName: true },
    }),
    db.query.users.findMany({
      where: inArray(users.role, ["ANIMATION", "ADMIN", "DIRECTION"]),
      orderBy: [asc(users.lastName)],
      columns: { id: true, firstName: true, lastName: true, isActive: true },
    }),
  ]);
  return {
    franchisees: franchiseeRows.map((f) => ({ id: f.id, label: f.companyName })),
    animateurs: animateurRows
      .filter((u) => u.isActive)
      .map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName}` })),
  };
}
