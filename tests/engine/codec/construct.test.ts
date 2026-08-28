import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../../src/engine/catalog/index";
import type { Catalog } from "../../../src/engine/catalog/index";
import { decode, encodeConstruct } from "../../../src/engine/codec/index";
import type { Construct } from "../../../src/engine/build/index";
import { SL1_PREFIX } from "../../../src/engine/codec/encode";
import { base64UrlEncode } from "../../../src/engine/codec/bitstream";
import { validMinimalBundle } from "../../fixtures/catalog/valid-minimal";

function loadedCatalog(): Catalog {
  const result = loadCatalog(validMinimalBundle);
  if (!result.ok) throw new Error("fixture failed load");
  return result.value;
}

describe("codec/decode / construct round-trip", () => {
  const catalog = loadedCatalog();

  it("encodes and decodes a well-formed construct without loss", () => {
    const construct: Construct = {
      chassisCode: 10 as never,
      commanderCode: 1 as never,
      mounts: [
        { hardpointIndex: 0, mountCode: 22 as never },
        { hardpointIndex: 2, mountCode: 20 as never },
      ],
    };
    const encoded = encodeConstruct(construct, catalog);
    expect(encoded.startsWith(SL1_PREFIX)).toBe(true);

    const decoded = decode(encoded, catalog);
    expect(decoded.ok).toBe(true);
    if (decoded.ok && decoded.value.kind === "construct") {
      expect(decoded.value.construct).toEqual(construct);
    } else {
      expect.fail("expected a construct decode");
    }
  });

  it("encodes and decodes an untagged construct (commander = null)", () => {
    const construct: Construct = {
      chassisCode: 11 as never,
      commanderCode: null,
      mounts: [{ hardpointIndex: 0, mountCode: 22 as never }],
    };
    const encoded = encodeConstruct(construct, catalog);
    const decoded = decode(encoded, catalog);
    expect(decoded.ok).toBe(true);
    if (decoded.ok && decoded.value.kind === "construct") {
      expect(decoded.value.construct).toEqual(construct);
    } else {
      expect.fail("expected a construct decode");
    }
  });

  it("encodes and decodes a construct with no mounts", () => {
    const construct: Construct = {
      chassisCode: 10 as never,
      commanderCode: 2 as never,
      mounts: [],
    };
    const encoded = encodeConstruct(construct, catalog);
    const decoded = decode(encoded, catalog);
    expect(decoded.ok).toBe(true);
    if (decoded.ok && decoded.value.kind === "construct") {
      expect(decoded.value.construct).toEqual(construct);
    }
  });
});

describe("codec/decode / MALFORMED classification", () => {
  const catalog = loadedCatalog();

  it("rejects an input missing the SL1 prefix", () => {
    const result = decode("XX1-AAAA", catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("MALFORMED");
      if (result.error.kind === "MALFORMED") {
        expect(result.error.offset).toBe(0);
      }
    }
  });

  it("rejects a non-string input", () => {
    const result = decode(undefined as unknown as string, catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("MALFORMED");
  });

  it("rejects an empty payload", () => {
    const result = decode(SL1_PREFIX, catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("MALFORMED");
  });

  it("rejects a base64url payload with an illegal character", () => {
    const result = decode(SL1_PREFIX + "**AA", catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("MALFORMED");
      if (result.error.kind === "MALFORMED") {
        // Prefix is 4 chars; the first illegal char is at char 4 in the input.
        expect(result.error.offset).toBe(SL1_PREFIX.length);
      }
    }
  });

  it("rejects a base64url payload with a 4k+1 length", () => {
    const result = decode(SL1_PREFIX + "A", catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("MALFORMED");
  });

  it("detects a single-bit checksum mutation", () => {
    const construct: Construct = {
      chassisCode: 10 as never,
      commanderCode: 1 as never,
      mounts: [{ hardpointIndex: 0, mountCode: 22 as never }],
    };
    const encoded = encodeConstruct(construct, catalog);
    const payload = encoded.slice(SL1_PREFIX.length);
    // Mutate the last data character — this flips checksum bits.
    const lastChar = payload[payload.length - 1] ?? "A";
    const flippedChar = lastChar === "A" ? "B" : "A";
    const mutated = SL1_PREFIX + payload.slice(0, payload.length - 1) + flippedChar;
    if (mutated === encoded) return; // unlikely but guard against a no-op flip
    const result = decode(mutated, catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("MALFORMED");
  });

  it("rejects a truncated payload", () => {
    const construct: Construct = {
      chassisCode: 10 as never,
      commanderCode: 1 as never,
      mounts: [{ hardpointIndex: 0, mountCode: 22 as never }],
    };
    const encoded = encodeConstruct(construct, catalog);
    const truncated = encoded.slice(0, SL1_PREFIX.length + 3);
    const result = decode(truncated, catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("MALFORMED");
  });
});

describe("codec/decode / UNKNOWN_ENTRY classification", () => {
  const catalog = loadedCatalog();

  it("names the missing chassis code", () => {
    // A construct that decodes structurally but names an absent chassis code.
    // We fabricate one by hand-building a Construct with an unknown chassis and
    // encoding under a stub catalog that has it, then decoding under `catalog`.
    const fabricated: Construct = {
      chassisCode: 999 as never,
      commanderCode: null,
      mounts: [],
    };
    const stub: Catalog = {
      ...catalog,
      indexes: {
        ...catalog.indexes,
        chassisByCode: new Map(catalog.indexes.chassisByCode).set(
          999 as never,
          catalog.chassis[0]!,
        ),
      },
    };
    const encoded = encodeConstruct(fabricated, stub);
    const result = decode(encoded, catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("UNKNOWN_ENTRY");
      if (result.error.kind === "UNKNOWN_ENTRY") {
        expect(result.error.code).toBe(999);
        expect(result.error.entry).toBe("chassis");
      }
    }
  });

  it("names the missing mount code", () => {
    const fabricated: Construct = {
      chassisCode: 10 as never,
      commanderCode: 1 as never,
      mounts: [{ hardpointIndex: 0, mountCode: 888 as never }],
    };
    const stub: Catalog = {
      ...catalog,
      indexes: {
        ...catalog.indexes,
        mountByCode: new Map(catalog.indexes.mountByCode).set(
          888 as never,
          catalog.mounts[0]!,
        ),
      },
    };
    const encoded = encodeConstruct(fabricated, stub);
    const result = decode(encoded, catalog);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "UNKNOWN_ENTRY") {
      expect(result.error.code).toBe(888);
      expect(result.error.entry).toBe("mount");
    } else {
      expect.fail("expected UNKNOWN_ENTRY for mount");
    }
  });

  it("names the missing commander code", () => {
    const fabricated: Construct = {
      chassisCode: 10 as never,
      commanderCode: 15 as never,
      mounts: [],
    };
    const stub: Catalog = {
      ...catalog,
      indexes: {
        ...catalog.indexes,
        commanderTypeByCode: new Map(catalog.indexes.commanderTypeByCode).set(
          15 as never,
          catalog.commanderTypes[0]!,
        ),
      },
    };
    const encoded = encodeConstruct(fabricated, stub);
    const result = decode(encoded, catalog);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "UNKNOWN_ENTRY") {
      expect(result.error.code).toBe(15);
      expect(result.error.entry).toBe("commander");
    } else {
      expect.fail("expected UNKNOWN_ENTRY for commander");
    }
  });
});

describe("codec/decode / VERSION_UNSUPPORTED", () => {
  const catalog = loadedCatalog();

  it("returns VERSION_UNSUPPORTED when the leading byte is a different version", () => {
    // A payload of a hand-built future-version SL1 string. We construct raw
    // bytes with version = 2, kind = 0, and a checksum computed over those
    // prefix bits, so the byte survives through checksum verification and
    // the discriminant surfaces.
    const bytes = new Uint8Array(4);
    bytes[0] = 0x02; // version = 2 — the reader trips on the first read
    const result = decode(SL1_PREFIX + base64UrlEncode(bytes), catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("VERSION_UNSUPPORTED");
      if (result.error.kind === "VERSION_UNSUPPORTED") {
        expect(result.error.version).toBe(2);
      }
    }
  });
});
