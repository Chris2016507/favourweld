import { describe, expect, it } from "vitest";
import { createIntaSendSignature, verifyIntaSendWebhook } from "../src/intasend";

describe("IntaSend webhook verification", () => {
  it("signs the exact raw request body with HMAC-SHA256", async () => {
    const body = '{"data":{"status":"paid","amount":1000}}';
    const signature = await createIntaSendSignature(body, "test-api-key");

    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    await expect(verifyIntaSendWebhook(body, signature, "test-api-key")).resolves.toBe(true);
  });

  it("rejects a changed body", async () => {
    const signature = await createIntaSendSignature(
      '{"data":{"status":"paid","amount":1000}}',
      "test-api-key",
    );

    await expect(
      verifyIntaSendWebhook(
        '{"data":{"status":"paid","amount":1001}}',
        signature,
        "test-api-key",
      ),
    ).resolves.toBe(false);
  });

  it("rejects missing, malformed, or wrong signatures", async () => {
    const body = '{"ok":true}';
    const valid = await createIntaSendSignature(body, "test-api-key");

    await expect(verifyIntaSendWebhook(body, null, "test-api-key")).resolves.toBe(false);
    await expect(verifyIntaSendWebhook(body, "not-a-signature", "test-api-key")).resolves.toBe(false);
    await expect(verifyIntaSendWebhook(body, valid, "wrong-api-key")).resolves.toBe(false);
  });
});
