import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { notifications, transmissionInvites } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import { canDownloadFile } from "@/lib/files/access";
import {
  createInvite,
  findValidInvite,
  revokeInvite,
  submitExternalTransmission,
} from "@/services/transmission-invites.service";
import { getTransmission } from "@/services/transmissions.service";
import { createStructure } from "@/services/acct-structures.service";
import { resetDb } from "./setup/reset-db";
import { createTestUser } from "../helpers/factories";

function asSession(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: SessionUser["role"];
  pole: SessionUser["pole"];
  franchiseeId: string | null;
}): SessionUser {
  return { ...user };
}

function pdfFile(name = "facture.pdf"): File {
  return new File([Buffer.from("%PDF-1.4 justificatif externe")], name, {
    type: "application/pdf",
  });
}

const SUBMISSION = {
  type: "FACTURE" as const,
  caseType: "FACTURE_INFLUENCEUR" as const,
  externalName: "Léa Influence",
  subject: "Facture campagne juillet",
  amount: "850.00",
};

describe("accès externe par lien à usage unique", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("création réservée à la compta ; le jeton n'est stocké que haché", async () => {
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );
    const rh = asSession(await createTestUser({ role: "RH", pole: "RH" }));
    await expect(
      createInvite(rh, {
        email: "lea@influence.fr",
        category: "INFLUENCEUR",
        expiresInDays: 14,
      })
    ).rejects.toThrow(ForbiddenError);

    const { invite, token } = await createInvite(compta, {
      email: "lea@influence.fr",
      externalName: "Léa Influence",
      category: "INFLUENCEUR",
      expiresInDays: 14,
    });
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(invite.tokenHash).not.toContain(token);

    const check = await findValidInvite(token);
    expect(check.valid).toBe(true);
    expect((await findValidInvite("jeton-invente-0123456789")).valid).toBe(false);
  });

  it("soumission externe : transmission EXTERNE tracée (IP, e-mail), jeton consommé", async () => {
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );
    const structure = await createStructure(compta, {
      code: "411INF",
      name: "Influenceurs",
      type: "PARTENAIRE",
    });
    const { token } = await createInvite(compta, {
      email: "lea@influence.fr",
      category: "INFLUENCEUR",
      structureId: structure.id,
      expiresInDays: 7,
    });

    const transmission = await submitExternalTransmission(
      token,
      SUBMISSION,
      [pdfFile()],
      "203.0.113.7"
    );
    expect(transmission.origin).toBe("EXTERNE");
    expect(transmission.emitterUserId).toBeNull();
    expect(transmission.externalEmail).toBe("lea@influence.fr");
    expect(transmission.submittedIp).toBe("203.0.113.7");
    expect(transmission.structureId).toBe(structure.id);
    expect(transmission.status).toBe("EN_ATTENTE");

    // Jeton à usage unique : une seconde soumission est refusée.
    await expect(
      submitExternalTransmission(token, SUBMISSION, [], "203.0.113.7")
    ).rejects.toThrow(/plus valide/);

    // La compta est notifiée, voit la PJ (uploadeur null) ; l'événement
    // initial est « système ».
    const detail = await getTransmission(compta, transmission.id);
    expect(detail?.attachments).toHaveLength(1);
    expect(detail?.attachments[0].uploadedById).toBeNull();
    expect(detail?.events[0].userId).toBeNull();
    expect(
      (await canDownloadFile(compta, detail!.attachments[0])).allowed
    ).toBe(true);
    const notifs = await db.query.notifications.findMany({
      where: and(
        eq(notifications.userId, compta.id),
        eq(notifications.type, "COMPTABILITE")
      ),
    });
    expect(notifs.some((n) => n.title.includes("externe"))).toBe(true);
  });

  it("validation stricte des fichiers externes (extension, nombre)", async () => {
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );
    const bad = await createInvite(compta, {
      email: "x@y.fr",
      category: "AUTRE",
      expiresInDays: 7,
    });
    await expect(
      submitExternalTransmission(
        bad.token,
        SUBMISSION,
        [new File([Buffer.from("MZ...")], "script.exe")],
        null
      )
    ).rejects.toThrow(/non autorisé/);

    const tooMany = await createInvite(compta, {
      email: "x2@y.fr",
      category: "AUTRE",
      expiresInDays: 7,
    });
    await expect(
      submitExternalTransmission(
        tooMany.token,
        SUBMISSION,
        Array.from({ length: 6 }, (_, i) => pdfFile(`f${i}.pdf`)),
        null
      )
    ).rejects.toThrow(/maximum/);
  });

  it("expiration et révocation invalident le lien", async () => {
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );
    const expired = await createInvite(compta, {
      email: "vieux@lien.fr",
      category: "AUTRE",
      expiresInDays: 1,
    });
    await db
      .update(transmissionInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(transmissionInvites.id, expired.invite.id));
    expect((await findValidInvite(expired.token)).valid).toBe(false);

    const revoked = await createInvite(compta, {
      email: "revoque@lien.fr",
      category: "AUTRE",
      expiresInDays: 7,
    });
    await revokeInvite(compta, revoked.invite.id);
    expect((await findValidInvite(revoked.token)).valid).toBe(false);
    await expect(
      submitExternalTransmission(revoked.token, SUBMISSION, [], null)
    ).rejects.toThrow(/plus valide/);
  });
});
