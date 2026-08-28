import { describe, expect, it } from "vitest";
import { copyText, type ClipboardLike } from "../../src/platform/clipboard/index";

describe("platform/clipboard / copyText", () => {
  it("resolves ok on success", async () => {
    let received: string | null = null;
    const clipboard: ClipboardLike = {
      async writeText(text: string) {
        received = text;
      },
    };
    const result = await copyText("hello", clipboard);
    expect(result.ok).toBe(true);
    expect(received).toBe("hello");
  });

  it("returns UNSUPPORTED when no clipboard is present", async () => {
    const result = await copyText("hello", null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("UNSUPPORTED");
  });

  it("returns DENIED for NotAllowedError name", async () => {
    const clipboard: ClipboardLike = {
      async writeText() {
        throw Object.assign(new Error("nope"), { name: "NotAllowedError" });
      },
    };
    const result = await copyText("x", clipboard);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("DENIED");
  });

  it("returns DENIED for SecurityError code 18", async () => {
    const clipboard: ClipboardLike = {
      async writeText() {
        throw Object.assign(new Error("nope"), { code: 18 });
      },
    };
    const result = await copyText("x", clipboard);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("DENIED");
  });

  it("returns WRITE_FAILED for arbitrary errors", async () => {
    const clipboard: ClipboardLike = {
      async writeText() {
        throw new Error("random");
      },
    };
    const result = await copyText("x", clipboard);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("WRITE_FAILED");
  });
});
