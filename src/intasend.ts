export async function createIntaSendSignature(rawBody: string, apiKey: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(value: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Verify an IntaSend webhook using the raw request body and API key.
 * The raw body must be captured before JSON parsing or re-serialization.
 */
export async function verifyIntaSendWebhook(
  rawBody: string,
  signature: string | null | undefined,
  apiKey: string,
): Promise<boolean> {
  if (!signature || !apiKey) return false;

  const expected = hexToBytes(await createIntaSendSignature(rawBody, apiKey));
  const received = hexToBytes(signature.trim());
  if (!expected || !received) return false;

  return crypto.subtle.timingSafeEqual(expected, received);
}
