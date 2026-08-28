const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveHash(
  password: string,
  pepper: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`${password}\u0000${pepper}`),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new Uint8Array(salt).buffer,
      iterations
    },
    key,
    256
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export async function derivePasswordRecord(
  password: string,
  pepper: string,
  options: { iterations?: number; salt?: Uint8Array } = {}
): Promise<{ hash: string; salt: string; iterations: number }> {
  const iterations = options.iterations ?? 100_000;
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveHash(password, pepper, salt, iterations);
  return { hash: bytesToBase64(hash), salt: bytesToBase64(salt), iterations };
}

export async function verifyPassword(
  password: string,
  pepper: string,
  record: { hash: string; salt: string; iterations: number }
): Promise<boolean> {
  const actual = await deriveHash(
    password,
    pepper,
    base64ToBytes(record.salt),
    record.iterations
  );
  return constantTimeEqual(actual, base64ToBytes(record.hash));
}

export function generateSessionToken(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return bytesToBase64(new Uint8Array(digest))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
