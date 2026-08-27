import { describe, expect, it } from "vitest";

import { PERMISSIONS, can, type Permission, type Role } from "@/lib/authz/permissions";

const ROLES: Role[] = [
  "ADMIN",
  "DIRECTION",
  "COMPTABILITE",
  "RH",
  "ANIMATION",
  "COMMUNICATION",
  "DEVELOPPEMENT",
  "FRANCHISE",
  "SALARIE",
];

const SENSITIVE: Permission[] = ["finance:read", "finance:write", "user:manage", "audit:read"];

describe("matrice de permissions", () => {
  it("chaque rôle a une entrée dans la matrice", () => {
    for (const role of ROLES) {
      expect(PERMISSIONS[role]).toBeDefined();
    }
  });

  it("ADMIN et DIRECTION ont toutes les permissions métier", () => {
    for (const role of ["ADMIN", "DIRECTION"] as const) {
      for (const perm of PERMISSIONS.DIRECTION) {
        expect(can({ role }, perm)).toBe(true);
      }
    }
  });

  it("l'usurpation « se connecter en tant que » est réservée au seul ADMIN", () => {
    for (const role of ROLES) {
      expect(can({ role }, "user:impersonate")).toBe(role === "ADMIN");
    }
  });

  it("la gestion des droits d'accès est réservée au seul ADMIN", () => {
    for (const role of ROLES) {
      expect(can({ role }, "permission:manage")).toBe(role === "ADMIN");
    }
  });

  it("les dossiers documentaires : direction par défaut (délégable via overrides)", () => {
    for (const role of ROLES) {
      const expected = role === "ADMIN" || role === "DIRECTION";
      expect(can({ role }, "document:folder")).toBe(expected);
    }
    expect(
      can(
        { role: "COMMUNICATION", permissionOverrides: { "document:folder": true } },
        "document:folder"
      )
    ).toBe(true);
  });

  it("écarts dynamiques : retrait, octroi, retour au défaut, ADMIN immunisé", () => {
    // Retrait d'une permission que la matrice accorde.
    expect(
      can(
        { role: "ANIMATION", permissionOverrides: { "visit:write": false } },
        "visit:write"
      )
    ).toBe(false);
    // Octroi d'une permission que la matrice refuse.
    expect(
      can(
        { role: "COMMUNICATION", permissionOverrides: { "finance:read": true } },
        "finance:read"
      )
    ).toBe(true);
    // Sans écart pour cette permission : la matrice par défaut s'applique.
    expect(
      can(
        { role: "COMMUNICATION", permissionOverrides: { "finance:read": true } },
        "finance:write"
      )
    ).toBe(false);
    // Le rôle ADMIN n'est jamais restreint par un écart.
    expect(
      can(
        { role: "ADMIN", permissionOverrides: { "user:manage": false } },
        "user:manage"
      )
    ).toBe(true);
  });

  // Exigence du cahier des charges : « certaines informations doivent être
  // totalement invisibles aux utilisateurs non autorisés ».
  it.each([
    ["RH", SENSITIVE],
    ["ANIMATION", SENSITIVE],
    ["COMMUNICATION", [...SENSITIVE, "store:read_internal_notes", "franchisee:read"]],
    ["DEVELOPPEMENT", SENSITIVE],
    ["FRANCHISE", [...SENSITIVE, "store:read_internal_notes", "ticket:read", "user:manage"]],
  ] as [Role, Permission[]][])(
    "%s n'a PAS accès aux permissions sensibles interdites",
    (role, denied) => {
      for (const perm of denied) {
        expect(can({ role }, perm), `${role} ne doit pas avoir ${perm}`).toBe(false);
      }
    }
  );

  it("la comptabilité gère les finances, l'import de CA et le référentiel produits", () => {
    for (const perm of [
      "finance:read",
      "finance:write",
      "revenue:read",
      "revenue:write",
      "revenue:import",
      "product:manage",
    ] as Permission[]) {
      expect(can({ role: "COMPTABILITE" }, perm)).toBe(true);
    }
    expect(can({ role: "COMPTABILITE" }, "user:manage")).toBe(false);
  });

  it("les visites terrain : lecture siège, écriture animation/direction, rien pour le franchisé", () => {
    for (const role of ROLES) {
      const writeExpected =
        role === "ADMIN" || role === "DIRECTION" || role === "ANIMATION";
      expect(can({ role }, "visit:write")).toBe(writeExpected);
      expect(can({ role }, "visit:read")).toBe(
        role !== "FRANCHISE" && role !== "SALARIE"
      );
    }
    // Le franchisé suit les plans d'action de SES boutiques (scopé), sans
    // voir les comptes rendus de visite internes.
    expect(can({ role: "FRANCHISE" }, "actionplan:read")).toBe(true);
    expect(can({ role: "FRANCHISE" }, "actionplan:write")).toBe(false);
  });

  it("le planning : lecture siège, écriture animation/direction, invisible au franchisé", () => {
    for (const role of ROLES) {
      expect(can({ role }, "planning:read")).toBe(
        role !== "FRANCHISE" && role !== "SALARIE"
      );
      const writeExpected =
        role === "ADMIN" || role === "DIRECTION" || role === "ANIMATION";
      expect(can({ role }, "planning:write")).toBe(writeExpected);
    }
  });

  it("les achats DPS : lecture compta/animation/franchisé (scopé), écriture et import compta", () => {
    for (const role of ROLES) {
      const readExpected = ["ADMIN", "DIRECTION", "COMPTABILITE", "ANIMATION", "FRANCHISE"].includes(role);
      const writeExpected = ["ADMIN", "DIRECTION", "COMPTABILITE"].includes(role);
      expect(can({ role }, "purchase:read")).toBe(readExpected);
      expect(can({ role }, "purchase:write")).toBe(writeExpected);
      expect(can({ role }, "purchase:import")).toBe(writeExpected);
    }
  });

  it("les formations : lecture pour tous (franchisé scopé), écriture animation/RH/direction", () => {
    for (const role of ROLES) {
      expect(can({ role }, "training:read")).toBe(role !== "SALARIE");
      const writeExpected = ["ADMIN", "DIRECTION", "ANIMATION", "RH"].includes(role);
      expect(can({ role }, "training:write")).toBe(writeExpected);
    }
  });

  it("le Food Cost est invisible du franchisé, modifiable par la seule direction", () => {
    for (const role of ROLES) {
      const readExpected = ["ADMIN", "DIRECTION", "COMPTABILITE", "ANIMATION"].includes(role);
      expect(can({ role }, "foodcost:read")).toBe(readExpected);
      expect(can({ role }, "foodcost:write")).toBe(role === "ADMIN" || role === "DIRECTION");
    }
  });

  it("le référentiel produits est réservé à la compta et à la direction", () => {
    for (const role of ROLES) {
      const expected =
        role === "ADMIN" || role === "DIRECTION" || role === "COMPTABILITE";
      expect(can({ role }, "product:manage")).toBe(expected);
    }
  });

  it("le franchisé peut lire ses données et saisir son CA, sans import ni finances", () => {
    expect(can({ role: "FRANCHISE" }, "store:read")).toBe(true);
    expect(can({ role: "FRANCHISE" }, "contract:read")).toBe(true);
    expect(can({ role: "FRANCHISE" }, "exchange:write")).toBe(true);
    expect(can({ role: "FRANCHISE" }, "revenue:write")).toBe(true);
    expect(can({ role: "FRANCHISE" }, "revenue:import")).toBe(false);
    expect(can({ role: "FRANCHISE" }, "store:write")).toBe(false);
  });

  it("le rôle SALARIE n'a QUE la pointeuse et les congés en self-service", () => {
    const salariePerms = [...PERMISSIONS.SALARIE].sort();
    expect(salariePerms).toEqual(["self:clock", "self:leave"]);
  });

  it("le dossier RH est réservé à la RH et à la direction", () => {
    for (const role of ROLES) {
      const expected = role === "ADMIN" || role === "DIRECTION" || role === "RH";
      expect(can({ role }, "hr:read")).toBe(expected);
      expect(can({ role }, "hr:write")).toBe(expected);
    }
  });

  it("les ouvertures : lecture réseau (franchisé scopé), écriture développement/direction, checklist siège", () => {
    for (const role of ROLES) {
      expect(can({ role }, "opening:read")).toBe(role !== "SALARIE");
      const writeExpected = ["ADMIN", "DIRECTION", "DEVELOPPEMENT"].includes(role);
      expect(can({ role }, "opening:write")).toBe(writeExpected);
      expect(can({ role }, "opening:checklist")).toBe(
        role !== "FRANCHISE" && role !== "SALARIE"
      );
    }
  });

  it("prospection et cessions : invisibles hors développement/direction", () => {
    for (const role of ROLES) {
      const expected = ["ADMIN", "DIRECTION", "DEVELOPPEMENT"].includes(role);
      expect(can({ role }, "development:read")).toBe(expected);
      expect(can({ role }, "development:write")).toBe(expected);
      expect(can({ role }, "resale:read")).toBe(expected);
      expect(can({ role }, "resale:write")).toBe(expected);
    }
  });

  it("la rentabilité des succursales : compta et direction, pas l'animation", () => {
    for (const role of ROLES) {
      const expected = ["ADMIN", "DIRECTION", "COMPTABILITE"].includes(role);
      expect(can({ role }, "branch:read")).toBe(expected);
      expect(can({ role }, "branch:write")).toBe(expected);
    }
  });

  it("les finances Big M CIE : compta et direction uniquement", () => {
    for (const role of ROLES) {
      const expected = ["ADMIN", "DIRECTION", "COMPTABILITE"].includes(role);
      expect(can({ role }, "company-finance:read")).toBe(expected);
      expect(can({ role }, "company-finance:write")).toBe(expected);
    }
  });

  it("registre logiciels lisible du siège ; coffre-fort réservé à ADMIN/DIRECTION", () => {
    for (const role of ROLES) {
      expect(can({ role }, "software:read")).toBe(
        role !== "FRANCHISE" && role !== "SALARIE"
      );
      const adminOnly = role === "ADMIN" || role === "DIRECTION";
      expect(can({ role }, "software:write")).toBe(adminOnly);
      expect(can({ role }, "vault:read")).toBe(adminOnly);
      expect(can({ role }, "vault:write")).toBe(adminOnly);
    }
  });

  it("seuls ADMIN et DIRECTION gèrent les utilisateurs, l'audit, le cockpit et les sauvegardes", () => {
    for (const role of ROLES) {
      const expected = role === "ADMIN" || role === "DIRECTION";
      expect(can({ role }, "user:manage")).toBe(expected);
      expect(can({ role }, "audit:read")).toBe(expected);
      expect(can({ role }, "direction:cockpit")).toBe(expected);
      expect(can({ role }, "backup:manage")).toBe(expected);
      expect(can({ role }, "email:manage")).toBe(expected);
    }
  });
  it("la comptabilité (structures, journal, imports) est réservée à la compta et la direction", () => {
    for (const role of ROLES) {
      const expected =
        role === "ADMIN" || role === "DIRECTION" || role === "COMPTABILITE";
      expect(can({ role }, "accounting:read")).toBe(expected);
      expect(can({ role }, "accounting:write")).toBe(expected);
      expect(can({ role }, "accounting:import")).toBe(expected);
    }
  });
  it("transmissions : tout le monde soumet sauf SALARIE, la compta traite", () => {
    for (const role of ROLES) {
      expect(can({ role }, "transmission:create")).toBe(role !== "SALARIE");
      const manage =
        role === "ADMIN" || role === "DIRECTION" || role === "COMPTABILITE";
      expect(can({ role }, "transmission:manage")).toBe(manage);
    }
  });
});
