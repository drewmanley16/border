import { createHash, randomBytes } from "node:crypto";

/**
 * Keys carry 256 bits of randomness, so a fast hash is the right tool: there's
 * nothing to brute force, and each request needs a cheap lookup. Password hashes
 * exist to protect low-entropy secrets, which these aren't.
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(environment: "sandbox" | "production" = "sandbox"): string {
  return `sf_${environment === "sandbox" ? "test" : "live"}_${randomBytes(32).toString("base64url")}`;
}

export function keyPrefix(key: string): string {
  return key.slice(0, 12);
}
