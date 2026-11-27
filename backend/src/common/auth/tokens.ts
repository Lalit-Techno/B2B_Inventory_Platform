import { createHash, randomBytes } from 'node:crypto';

export const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

/** Random 32-byte token for the client; only its SHA-256 hash is ever stored. */
export function newOpaqueToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256(token) };
}
