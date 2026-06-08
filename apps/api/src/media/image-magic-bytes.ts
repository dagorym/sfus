/**
 * Magic-byte (content-sniffing) verification for image uploads.
 *
 * Reads the leading bytes of a file buffer and compares them against the known
 * byte signatures for each allowed image MIME type.  If the signature does not
 * match, the upload is rejected regardless of the client-supplied content-type.
 *
 * SVG (`image/svg+xml`) is intentionally excluded from the allow-list both here
 * and in the MIME allow-list because SVG files can embed executable content.
 *
 * Applies to every image resourceType handled by the shared media pipeline:
 *   blog-post, standalone-page, blog-comment
 * (and `avatar` once ST12 adds that resourceType).
 */

/** Minimum buffer length required to inspect magic bytes. */
const MIN_SNIFF_BYTES = 12;

interface MagicSignature {
  /** MIME type this signature identifies. */
  mimeType: string;
  /**
   * Leading byte sequence.  Each element is a byte value or `null` to skip
   * (wildcard) that position.
   */
  bytes: (number | null)[];
  /** Byte offset at which the signature starts (default 0). */
  offset?: number;
}

/**
 * Supported image signatures.  Ordered so that the most specific match wins
 * (e.g., JPEG before a shorter prefix, WebP after the RIFF prefix check).
 */
const IMAGE_SIGNATURES: MagicSignature[] = [
  // JPEG: FF D8 FF
  { mimeType: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { mimeType: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // GIF: 47 49 46 38 37 61 (GIF87a) or 47 49 46 38 39 61 (GIF89a)
  { mimeType: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },
  { mimeType: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] },
  // WebP: RIFF????WEBP — bytes 0-3 are RIFF, bytes 8-11 are WEBP
  // Checked via two separate partial matches below.
  {
    mimeType: "image/webp",
    bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50]
  }
];

/**
 * Tests whether `buf` matches `sig` at the specified offset.
 */
function matchesSignature(buf: Buffer, sig: MagicSignature): boolean {
  const offset = sig.offset ?? 0;
  if (buf.length < offset + sig.bytes.length) {
    return false;
  }
  return sig.bytes.every((b, i) => b === null || buf[offset + i] === b);
}

/**
 * Returns the MIME type inferred from `buf`'s magic bytes, or `null` when no
 * known signature matches.
 */
export function sniffImageMimeType(buf: Buffer): string | null {
  if (buf.length < MIN_SNIFF_BYTES) {
    return null;
  }
  for (const sig of IMAGE_SIGNATURES) {
    if (matchesSignature(buf, sig)) {
      return sig.mimeType;
    }
  }
  return null;
}

/**
 * Returns `true` when the leading bytes of `buf` are consistent with
 * `claimedMimeType`.  Returns `false` when the signature is absent or
 * belongs to a different type.
 *
 * Note: this function validates signatures for the four allowed image types
 * (JPEG, PNG, GIF, WebP) only.  Any other `claimedMimeType` automatically
 * returns `false` so that unrecognised types are always rejected.
 */
export function imageMagicBytesMatch(buf: Buffer, claimedMimeType: string): boolean {
  const detected = sniffImageMimeType(buf);
  return detected !== null && detected === claimedMimeType;
}
