/**
 * Behavioral unit tests for ST17 public profile page.
 *
 * Tests the pure helper functions extracted from the public profile page:
 *   - profileProjection: enforces the five-field allowlist (security-critical output guard)
 *
 * These tests are NON-VACUOUS: each one will FAIL if the behavior it covers regresses.
 * The profileProjection tests in particular protect the security invariant that
 * only the five permitted fields (username, displayName, avatar, bio, joinDate)
 * can reach the render layer.
 */

import { describe, expect, it } from "vitest";

import { profileProjection } from "./[username]/profile-projection";

// ---------------------------------------------------------------------------
// profileProjection — five-field allowlist enforcer
// ---------------------------------------------------------------------------

describe("profileProjection — security-critical output guard", () => {
  it("returns all five allowed fields when they are present", () => {
    const raw = {
      username: "alice",
      displayName: "Alice Smith",
      avatar: "/api/media/abc-123",
      bio: "Hello world",
      joinDate: "2025-01-01T00:00:00.000Z"
    };
    const result = profileProjection(raw);
    expect(result).not.toBeNull();
    expect(result!.username).toBe("alice");
    expect(result!.displayName).toBe("Alice Smith");
    expect(result!.avatar).toBe("/api/media/abc-123");
    expect(result!.bio).toBe("Hello world");
    expect(result!.joinDate).toBe("2025-01-01T00:00:00.000Z");
  });

  it("drops any extra fields not in the allowlist (output guard)", () => {
    const raw = {
      username: "alice",
      displayName: "Alice",
      avatar: null,
      bio: null,
      joinDate: "2025-01-01T00:00:00.000Z",
      // Extra fields that must be dropped
      email: "alice@example.com",
      globalRole: "admin",
      status: "active",
      id: "uuid-abc",
      passwordHash: "secret"
    };
    const result = profileProjection(raw);
    expect(result).not.toBeNull();
    // Verify only five keys exist
    expect(Object.keys(result!)).toHaveLength(5);
    expect(Object.keys(result!)).toEqual(
      expect.arrayContaining(["username", "displayName", "avatar", "bio", "joinDate"])
    );
    // Verify the extra fields are NOT present
    expect("email" in result!).toBe(false);
    expect("globalRole" in result!).toBe(false);
    expect("status" in result!).toBe(false);
    expect("id" in result!).toBe(false);
    expect("passwordHash" in result!).toBe(false);
  });

  it("returns null when username is missing", () => {
    const raw = {
      displayName: "Alice",
      avatar: null,
      bio: null,
      joinDate: "2025-01-01T00:00:00.000Z"
    };
    expect(profileProjection(raw)).toBeNull();
  });

  it("returns null when username is an empty string", () => {
    const raw = { username: "  ", displayName: null, avatar: null, bio: null, joinDate: "2025-01-01T00:00:00.000Z" };
    expect(profileProjection(raw)).toBeNull();
  });

  it("returns null when joinDate is missing", () => {
    const raw = { username: "alice", displayName: null, avatar: null, bio: null };
    expect(profileProjection(raw)).toBeNull();
  });

  it("returns null for non-object input (null)", () => {
    expect(profileProjection(null)).toBeNull();
  });

  it("returns null for non-object input (string)", () => {
    expect(profileProjection("alice")).toBeNull();
  });

  it("coerces non-string displayName to null", () => {
    const raw = { username: "bob", displayName: 42, avatar: null, bio: null, joinDate: "2025-01-01T00:00:00.000Z" };
    const result = profileProjection(raw);
    expect(result!.displayName).toBeNull();
  });

  it("coerces non-string avatar to null", () => {
    const raw = { username: "bob", displayName: null, avatar: 123, bio: null, joinDate: "2025-01-01T00:00:00.000Z" };
    const result = profileProjection(raw);
    expect(result!.avatar).toBeNull();
  });

  it("coerces empty-string avatar to null (no blank avatar URLs)", () => {
    const raw = { username: "bob", displayName: null, avatar: "   ", bio: null, joinDate: "2025-01-01T00:00:00.000Z" };
    const result = profileProjection(raw);
    expect(result!.avatar).toBeNull();
  });

  it("coerces non-string bio to null", () => {
    const raw = { username: "bob", displayName: null, avatar: null, bio: true, joinDate: "2025-01-01T00:00:00.000Z" };
    const result = profileProjection(raw);
    expect(result!.bio).toBeNull();
  });

  it("preserves a valid /api/media/ avatar URL verbatim", () => {
    const raw = {
      username: "carol",
      displayName: null,
      avatar: "/api/media/some-uuid",
      bio: null,
      joinDate: "2025-06-01T00:00:00.000Z"
    };
    const result = profileProjection(raw);
    expect(result!.avatar).toBe("/api/media/some-uuid");
  });
});
