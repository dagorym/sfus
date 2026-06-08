/**
 * Behavioral unit tests for the UserAvatar component helpers (ST17).
 *
 * Tests the pure functions exported from user-avatar.tsx:
 *   - deriveInitials: avatar initials fallback resolver
 *   - resolveAvatarSrc: avatar src resolver (degrades on error/missing)
 *
 * These tests are NON-VACUOUS: each one will FAIL if the behavior it covers
 * regresses. The resolveAvatarSrc tests protect the security invariant that
 * a failed or missing image always degrades to the initials fallback (no
 * broken image displayed to users).
 */

import { describe, expect, it } from "vitest";

import { deriveInitials, resolveAvatarSrc } from "./user-avatar";

// ---------------------------------------------------------------------------
// deriveInitials — fallback initials from displayName / username
// ---------------------------------------------------------------------------

describe("deriveInitials — avatar initials fallback", () => {
  it("returns uppercase first letter of first two words from displayName", () => {
    expect(deriveInitials("Alice Smith", "alice")).toBe("AS");
  });

  it("returns first two characters from a single-word displayName", () => {
    expect(deriveInitials("Alice", "alice")).toBe("AL");
  });

  it("falls back to username when displayName is null", () => {
    expect(deriveInitials(null, "alice")).toBe("AL");
  });

  it("falls back to username when displayName is empty string", () => {
    expect(deriveInitials("", "bob")).toBe("BO");
  });

  it("falls back to username when displayName is whitespace only", () => {
    expect(deriveInitials("   ", "carol")).toBe("CA");
  });

  it("returns '?' when both displayName and username are empty", () => {
    expect(deriveInitials(null, "")).toBe("?");
  });

  it("returns '?' when both displayName and username are whitespace only", () => {
    expect(deriveInitials("  ", "  ")).toBe("?");
  });

  it("handles multi-word displayName (takes first letter of first two words only)", () => {
    expect(deriveInitials("Jean-Luc Picard Captain", "jlp")).toBe("JP");
  });

  it("upper-cases the result", () => {
    expect(deriveInitials("john doe", "jdoe")).toBe("JD");
  });

  it("handles single-character username", () => {
    expect(deriveInitials(null, "x")).toBe("X");
  });

  it("returns two characters from a two-character username", () => {
    expect(deriveInitials(null, "ab")).toBe("AB");
  });
});

// ---------------------------------------------------------------------------
// resolveAvatarSrc — returns gated URL or null (fallback trigger)
// ---------------------------------------------------------------------------

describe("resolveAvatarSrc — avatar src resolver with error degradation", () => {
  it("returns the avatarSrc when provided and no error", () => {
    expect(resolveAvatarSrc("/api/media/abc-123", false)).toBe("/api/media/abc-123");
  });

  it("returns null when avatarSrc is null (no avatar set)", () => {
    expect(resolveAvatarSrc(null, false)).toBeNull();
  });

  it("returns null when avatarSrc is empty string", () => {
    expect(resolveAvatarSrc("", false)).toBeNull();
  });

  it("returns null when hasError is true even if avatarSrc is provided (degradation)", () => {
    // This is the security/UX invariant: broken images must never be shown.
    // If the image fails to load the component must fall back to initials.
    expect(resolveAvatarSrc("/api/media/abc-123", true)).toBeNull();
  });

  it("returns null when both avatarSrc is null and hasError is true", () => {
    expect(resolveAvatarSrc(null, true)).toBeNull();
  });
});
