import { describe, expect, it } from "vitest";

import { imageMagicBytesMatch, sniffImageMimeType } from "./image-magic-bytes";

// ---------------------------------------------------------------------------
// Byte-level helpers used to build fixtures
// ---------------------------------------------------------------------------

/** Minimum buffer length required by the implementation (MIN_SNIFF_BYTES = 12). */
const MIN_SNIFF_BYTES = 12;

/** Pad a short byte array to at least MIN_SNIFF_BYTES with zero bytes. */
const padTo12 = (bytes: number[]): Buffer =>
  Buffer.from([...bytes, ...new Array(Math.max(0, MIN_SNIFF_BYTES - bytes.length)).fill(0)]);

// ---------------------------------------------------------------------------
// Canonical fixture buffers — one per supported format
// ---------------------------------------------------------------------------

/** Real JPEG JFIF header (FF D8 FF E0 00 10 4A 46 49 46 00 01). */
const JPEG_BUF = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

/** PNG magic bytes followed by enough zeros to reach 12 bytes. */
const PNG_BUF = padTo12([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** GIF87a magic bytes followed by zero filler. */
const GIF87A_BUF = padTo12([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);

/** GIF89a magic bytes followed by zero filler. */
const GIF89A_BUF = padTo12([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

/**
 * Minimal WebP RIFF container.
 * Format: RIFF <4-byte size wildcard> WEBP
 * Bytes: 52 49 46 46 xx xx xx xx 57 45 42 50
 */
const WEBP_BUF = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

// ---------------------------------------------------------------------------
// sniffImageMimeType — per-format classification tests
// ---------------------------------------------------------------------------

describe("sniffImageMimeType — per-format classification", () => {
  // Acceptance criterion: magic-byte signatures correctly identify each allowed
  // image type so that polyglot and mis-declared uploads can be caught.

  it("returns image/jpeg for a JPEG magic-byte buffer", () => {
    // Criterion: JPEG signature [FF D8 FF] is recognised.
    expect(sniffImageMimeType(JPEG_BUF)).toBe("image/jpeg");
  });

  it("returns image/png for a PNG magic-byte buffer", () => {
    // Criterion: PNG signature [89 50 4E 47 0D 0A 1A 0A] is recognised.
    expect(sniffImageMimeType(PNG_BUF)).toBe("image/png");
  });

  it("returns image/gif for a GIF87a magic-byte buffer", () => {
    // Criterion: GIF87a signature [47 49 46 38 37 61] is recognised.
    expect(sniffImageMimeType(GIF87A_BUF)).toBe("image/gif");
  });

  it("returns image/gif for a GIF89a magic-byte buffer", () => {
    // Criterion: GIF89a signature [47 49 46 38 39 61] is recognised.
    expect(sniffImageMimeType(GIF89A_BUF)).toBe("image/gif");
  });

  it("returns image/webp for a WebP RIFF magic-byte buffer", () => {
    // Criterion: WebP signature RIFF????WEBP is recognised (positions 4-7 are wildcard).
    expect(sniffImageMimeType(WEBP_BUF)).toBe("image/webp");
  });

  it("returns image/webp even when the RIFF size bytes vary (wildcard positions)", () => {
    // Criterion: the four size bytes at positions 4-7 must be treated as wildcard.
    const webpNonZeroSize = Buffer.from([
      0x52, 0x49, 0x46, 0x46,
      0xab, 0xcd, 0xef, 0x12, // non-zero size bytes — still valid WebP
      0x57, 0x45, 0x42, 0x50
    ]);
    expect(sniffImageMimeType(webpNonZeroSize)).toBe("image/webp");
  });

  it("returns null for a buffer that matches no signature", () => {
    // Criterion: unknown formats are not misclassified.
    const pdf = padTo12([0x25, 0x50, 0x44, 0x46]); // %PDF prefix
    expect(sniffImageMimeType(pdf)).toBeNull();
  });

  it("returns null for SVG-like text content (SVG is excluded from signatures)", () => {
    // Criterion: SVG must not be accepted anywhere in the pipeline.
    const svgBytes = Buffer.from("<svg xmlns=".padEnd(12, " "));
    expect(sniffImageMimeType(svgBytes)).toBeNull();
  });

  it("returns null for an all-zero buffer (no valid signature)", () => {
    const zeros = Buffer.alloc(MIN_SNIFF_BYTES, 0);
    expect(sniffImageMimeType(zeros)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// sniffImageMimeType — short-buffer boundary behaviour
// ---------------------------------------------------------------------------

describe("sniffImageMimeType — short-buffer boundary", () => {
  // Acceptance criterion: buffers shorter than MIN_SNIFF_BYTES (12) return null.

  it("returns null for an empty buffer", () => {
    expect(sniffImageMimeType(Buffer.alloc(0))).toBeNull();
  });

  it("returns null for a buffer one byte shorter than the minimum (11 bytes)", () => {
    // 11 bytes — exactly one byte below MIN_SNIFF_BYTES.
    const short = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
    expect(sniffImageMimeType(short)).toBeNull();
  });

  it("returns a result for exactly 12 bytes when the signature matches", () => {
    // 12 bytes — exactly at the threshold; JPEG header must be detected.
    expect(sniffImageMimeType(JPEG_BUF)).toBe("image/jpeg");
  });
});

// ---------------------------------------------------------------------------
// imageMagicBytesMatch — claimed-vs-actual agreement tests
// ---------------------------------------------------------------------------

describe("imageMagicBytesMatch — claimed MIME type matches actual magic bytes", () => {
  // Acceptance criterion: upload is accepted only when leading bytes are
  // consistent with the declared content-type.

  it("returns true when JPEG bytes match claimed image/jpeg", () => {
    expect(imageMagicBytesMatch(JPEG_BUF, "image/jpeg")).toBe(true);
  });

  it("returns true when PNG bytes match claimed image/png", () => {
    expect(imageMagicBytesMatch(PNG_BUF, "image/png")).toBe(true);
  });

  it("returns true when GIF87a bytes match claimed image/gif", () => {
    expect(imageMagicBytesMatch(GIF87A_BUF, "image/gif")).toBe(true);
  });

  it("returns true when GIF89a bytes match claimed image/gif", () => {
    expect(imageMagicBytesMatch(GIF89A_BUF, "image/gif")).toBe(true);
  });

  it("returns true when WebP bytes match claimed image/webp", () => {
    expect(imageMagicBytesMatch(WEBP_BUF, "image/webp")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// imageMagicBytesMatch — polyglot and cross-type mismatch rejection
// ---------------------------------------------------------------------------

describe("imageMagicBytesMatch — polyglot rejection (bytes do not match claimed type)", () => {
  // Acceptance criterion: a file with an allowed content-type header but
  // non-matching leading bytes is rejected — polyglot detection.

  it("returns false when PNG bytes are presented with claimed image/jpeg (polyglot)", () => {
    // This is the non-vacuous polyglot case: the MIME type is in the allow-list
    // but the leading bytes do not match that type.
    expect(imageMagicBytesMatch(PNG_BUF, "image/jpeg")).toBe(false);
  });

  it("returns false when JPEG bytes are presented with claimed image/png (polyglot)", () => {
    expect(imageMagicBytesMatch(JPEG_BUF, "image/png")).toBe(false);
  });

  it("returns false when JPEG bytes are presented with claimed image/gif (polyglot)", () => {
    expect(imageMagicBytesMatch(JPEG_BUF, "image/gif")).toBe(false);
  });

  it("returns false when JPEG bytes are presented with claimed image/webp (polyglot)", () => {
    expect(imageMagicBytesMatch(JPEG_BUF, "image/webp")).toBe(false);
  });

  it("returns false when WebP bytes are presented with claimed image/jpeg (polyglot)", () => {
    expect(imageMagicBytesMatch(WEBP_BUF, "image/jpeg")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// imageMagicBytesMatch — unrecognised claimed MIME type rejection
// ---------------------------------------------------------------------------

describe("imageMagicBytesMatch — unrecognised MIME types are always rejected", () => {
  // Acceptance criterion: imageMagicBytesMatch returns false for any claimedMimeType
  // not in IMAGE_SIGNATURES (catches SVG, PDF, and other unrecognised types).

  it("returns false for image/svg+xml (SVG excluded from IMAGE_SIGNATURES)", () => {
    // SVG must be rejected even if the buffer happened to start with SVG-like bytes.
    const svgBytes = Buffer.from("<svg xmlns=".padEnd(12, " "));
    expect(imageMagicBytesMatch(svgBytes, "image/svg+xml")).toBe(false);
  });

  it("returns false for application/pdf as claimed MIME type", () => {
    const pdfBytes = padTo12([0x25, 0x50, 0x44, 0x46]); // %PDF
    expect(imageMagicBytesMatch(pdfBytes, "application/pdf")).toBe(false);
  });

  it("returns false for an empty claimed MIME type string", () => {
    expect(imageMagicBytesMatch(JPEG_BUF, "")).toBe(false);
  });

  it("returns false for text/html as claimed MIME type", () => {
    const htmlBytes = Buffer.from("<!DOCTYPE html>".padEnd(12, " ").slice(0, 12));
    expect(imageMagicBytesMatch(htmlBytes, "text/html")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// imageMagicBytesMatch — short-buffer rejection
// ---------------------------------------------------------------------------

describe("imageMagicBytesMatch — short buffers are always rejected", () => {
  // Acceptance criterion: a buffer shorter than MIN_SNIFF_BYTES returns false
  // even when the claimed MIME type is in the allow-list.

  it("returns false for an empty buffer with claimed image/jpeg", () => {
    expect(imageMagicBytesMatch(Buffer.alloc(0), "image/jpeg")).toBe(false);
  });

  it("returns false for a 11-byte buffer with claimed image/jpeg", () => {
    const short = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
    expect(imageMagicBytesMatch(short, "image/jpeg")).toBe(false);
  });
});
