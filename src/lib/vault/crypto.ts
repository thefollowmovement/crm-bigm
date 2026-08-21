// Chiffrement du coffre-fort (cdc §21) : AES-256-GCM via node:crypto, zéro
// dépendance. Clé dans l'env VAULT_KEY (32 octets en base64) — AUCUN
// fallback : l'erreur se lève à l'usage, pas au build (l'app doit builder
// sans secrets). Format versionné "v1:<iv>:<tag>:<cipher>" (base64), IV de
// 12 octets aléatoire par secret, tag d'authentification vérifié au
// déchiffrement (toute altération lève).
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const VERSION = "v1";

export function vaultKeyVersion(): number {
  return 1;
}

function loadKey(): Buffer {
  const raw = process.env.VAULT_KEY;
  if (!raw) {
    throw new Error(
      "VAULT_KEY absent : définissez une clé de 32 octets en base64 pour utiliser le coffre-fort."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error("VAULT_KEY invalide : 32 octets en base64 attendus.");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  const key = loadKey();
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Secret illisible : format de chiffrement inconnu.");
  }
  const [, ivB64, tagB64, cipherB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  if (iv.length !== IV_BYTES) {
    throw new Error("Secret illisible : vecteur d'initialisation invalide.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(cipherB64, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    throw new Error(
      "Secret illisible : clé incorrecte ou données altérées (tag invalide)."
    );
  }
}
