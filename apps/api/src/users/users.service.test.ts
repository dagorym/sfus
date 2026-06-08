/**
 * users.service.test.ts
 *
 * Unit tests for UsersService (ST14).
 *
 * Acceptance criteria validated:
 * AC-SERVICE-SUGGEST-FIELDS: suggestByPrefix returns ONLY username/displayName/avatarUrl — never email, role, status, id.
 * AC-SERVICE-SUGGEST-ACTIVE: Only ACTIVE users are returned; inactive users are excluded.
 * AC-SERVICE-SUGGEST-CAP: Results are capped at SUGGEST_RESULT_CAP (10).
 * AC-SERVICE-SUGGEST-AVATAR: avatarUrl is /api/media/<id> when set, null when not.
 * AC-SERVICE-PROFILE-FIELDS: findPublicProfile returns EXACTLY 5 fields.
 * AC-SERVICE-PROFILE-INACTIVE: Returns null for inactive users (uniform null — no enumeration oracle).
 * AC-SERVICE-PROFILE-NOTFOUND: Returns null for nonexistent users.
 * AC-SERVICE-PROFILE-AVATAR: avatar is /api/media/<id> when set, null when not.
 */

import { describe, expect, it, vi } from "vitest";

import { UserEntity } from "./entities/user.entity";
import { UsersService } from "./users.service";

// ---------------------------------------------------------------------------
// Repository mock factory
// ---------------------------------------------------------------------------

/**
 * Minimal TypeORM-like repository mock for UsersService tests.
 * Only mocks the methods used by UsersService: findOne and find.
 */
const makeRepository = (overrides?: {
  findOneResult?: UserEntity | null;
  findResult?: UserEntity[];
}) => ({
  findOne: vi.fn().mockResolvedValue(overrides?.findOneResult ?? null),
  find: vi.fn().mockResolvedValue(overrides?.findResult ?? [])
});

/** Build a minimal UserEntity with all fields the service reads. */
const makeUserEntity = (overrides?: Partial<UserEntity>): UserEntity => ({
  id: "uid-1",
  username: "alice",
  email: "alice@example.com",
  displayName: "Alice Smith",
  globalRole: "user",
  status: "active",
  emailVerifiedAt: null,
  bio: "Hello there",
  avatarMediaId: null,
  createdAt: new Date("2024-01-15T00:00:00.000Z"),
  updatedAt: new Date("2024-01-15T00:00:00.000Z"),
  authIdentities: [],
  passwordAuthenticators: [],
  sessions: [],
  emailVerifications: [],
  totpSecrets: [],
  recoveryCodes: [],
  authorizationGrants: [],
  avatarMedia: null,
  ...overrides
} as UserEntity);

// ---------------------------------------------------------------------------
// suggestByPrefix
// ---------------------------------------------------------------------------

describe("UsersService.suggestByPrefix: field exposure (AC-SERVICE-SUGGEST-FIELDS)", () => {
  it("returns items with ONLY username, displayName, avatarUrl — no email, role, status, id", async () => {
    const user = makeUserEntity({
      email: "alice@example.com",
      globalRole: "admin",
      status: "active",
      id: "uid-secret"
    });
    const repo = makeRepository({ findResult: [user] });
    const service = new UsersService(repo as never);
    const results = await service.suggestByPrefix("al");

    expect(results).toHaveLength(1);
    const item = results[0];

    // Present.
    expect(item).toHaveProperty("username", "alice");
    expect(item).toHaveProperty("displayName", "Alice Smith");
    expect(item).toHaveProperty("avatarUrl");

    // Absent — the allowlist must exclude these.
    expect(item).not.toHaveProperty("email");
    expect(item).not.toHaveProperty("globalRole");
    expect(item).not.toHaveProperty("status");
    expect(item).not.toHaveProperty("id");
    expect(item).not.toHaveProperty("createdAt");
    expect(item).not.toHaveProperty("updatedAt");
    expect(item).not.toHaveProperty("bio");
    expect(item).not.toHaveProperty("emailVerifiedAt");
  });

  it("returns EXACTLY three keys per item", async () => {
    const user = makeUserEntity();
    const repo = makeRepository({ findResult: [user] });
    const service = new UsersService(repo as never);
    const results = await service.suggestByPrefix("al");
    expect(Object.keys(results[0])).toHaveLength(3);
    expect(Object.keys(results[0])).toEqual(
      expect.arrayContaining(["username", "displayName", "avatarUrl"])
    );
  });
});

describe("UsersService.suggestByPrefix: active-only (AC-SERVICE-SUGGEST-ACTIVE)", () => {
  it("passes status='active' to the find query", async () => {
    const repo = makeRepository({ findResult: [] });
    const service = new UsersService(repo as never);
    await service.suggestByPrefix("alice");

    expect(repo.find).toHaveBeenCalledOnce();
    const callArg = repo.find.mock.calls[0][0];
    // The where clause must include status: 'active'.
    expect(callArg.where).toMatchObject({ status: "active" });
  });
});

describe("UsersService.suggestByPrefix: count cap (AC-SERVICE-SUGGEST-CAP)", () => {
  it("passes take=10 to the repository query (SUGGEST_RESULT_CAP)", async () => {
    const repo = makeRepository({ findResult: [] });
    const service = new UsersService(repo as never);
    await service.suggestByPrefix("u");
    const callArg = repo.find.mock.calls[0][0];
    expect(callArg.take).toBe(10);
  });
});

describe("UsersService.suggestByPrefix: avatar URL resolution (AC-SERVICE-SUGGEST-AVATAR)", () => {
  it("sets avatarUrl to /api/media/<id> when avatarMediaId is set", async () => {
    const user = makeUserEntity({ avatarMediaId: "media-abc" });
    const repo = makeRepository({ findResult: [user] });
    const service = new UsersService(repo as never);
    const results = await service.suggestByPrefix("al");
    expect(results[0].avatarUrl).toBe("/api/media/media-abc");
  });

  it("sets avatarUrl to null when avatarMediaId is null", async () => {
    const user = makeUserEntity({ avatarMediaId: null });
    const repo = makeRepository({ findResult: [user] });
    const service = new UsersService(repo as never);
    const results = await service.suggestByPrefix("al");
    expect(results[0].avatarUrl).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findPublicProfile
// ---------------------------------------------------------------------------

describe("UsersService.findPublicProfile: exact 5-field shape (AC-SERVICE-PROFILE-FIELDS)", () => {
  it("returns EXACTLY {username, displayName, avatar, bio, joinDate} for an active user", async () => {
    const user = makeUserEntity({
      username: "alice",
      displayName: "Alice",
      bio: "Hi",
      avatarMediaId: null,
      status: "active",
      createdAt: new Date("2024-03-01T00:00:00.000Z")
    });
    const repo = makeRepository({ findOneResult: user });
    const service = new UsersService(repo as never);
    const profile = await service.findPublicProfile("alice");

    expect(profile).not.toBeNull();

    // Present.
    expect(profile).toHaveProperty("username", "alice");
    expect(profile).toHaveProperty("displayName", "Alice");
    expect(profile).toHaveProperty("bio", "Hi");
    expect(profile).toHaveProperty("avatar");
    expect(profile).toHaveProperty("joinDate");

    // Absent.
    expect(profile).not.toHaveProperty("email");
    expect(profile).not.toHaveProperty("globalRole");
    expect(profile).not.toHaveProperty("status");
    expect(profile).not.toHaveProperty("id");
    expect(profile).not.toHaveProperty("createdAt");
    expect(profile).not.toHaveProperty("updatedAt");
    expect(profile).not.toHaveProperty("emailVerifiedAt");
  });

  it("returns EXACTLY five keys", async () => {
    const user = makeUserEntity({ status: "active" });
    const repo = makeRepository({ findOneResult: user });
    const service = new UsersService(repo as never);
    const profile = await service.findPublicProfile("alice");
    expect(profile).not.toBeNull();
    expect(Object.keys(profile!)).toHaveLength(5);
    expect(Object.keys(profile!)).toEqual(
      expect.arrayContaining(["username", "displayName", "avatar", "bio", "joinDate"])
    );
  });

  it("joinDate is an ISO-8601 string", async () => {
    const createdAt = new Date("2024-01-15T12:00:00.000Z");
    const user = makeUserEntity({ createdAt, status: "active" });
    const repo = makeRepository({ findOneResult: user });
    const service = new UsersService(repo as never);
    const profile = await service.findPublicProfile("alice");
    expect(profile!.joinDate).toBe(createdAt.toISOString());
  });
});

describe("UsersService.findPublicProfile: uniform null for nonexistent/inactive (AC-SERVICE-PROFILE-INACTIVE)", () => {
  it("returns null when user does not exist (repository returns null)", async () => {
    const repo = makeRepository({ findOneResult: null });
    const service = new UsersService(repo as never);
    const result = await service.findPublicProfile("nobody");
    expect(result).toBeNull();
  });

  it("passes username AND status='active' to findOne — inactive users not found", async () => {
    const repo = makeRepository({ findOneResult: null });
    const service = new UsersService(repo as never);
    await service.findPublicProfile("inactiveuser");
    expect(repo.findOne).toHaveBeenCalledOnce();
    const callArg = repo.findOne.mock.calls[0][0];
    expect(callArg.where).toMatchObject({ username: "inactiveuser", status: "active" });
  });

  it("returns null when findOne returns null (covers both nonexistent and inactive paths equally)", async () => {
    // The service returns null unconditionally when findOne returns null,
    // making nonexistent vs inactive indistinguishable to callers.
    const repo = makeRepository({ findOneResult: null });
    const service = new UsersService(repo as never);
    const resultNonexistent = await service.findPublicProfile("nobody");
    const resultInactive = await service.findPublicProfile("inactiveuser");
    // Both return null — identical, no oracle.
    expect(resultNonexistent).toBeNull();
    expect(resultInactive).toBeNull();
  });
});

describe("UsersService.findPublicProfile: avatar URL resolution (AC-SERVICE-PROFILE-AVATAR)", () => {
  it("sets avatar to /api/media/<id> when avatarMediaId is set", async () => {
    const user = makeUserEntity({ avatarMediaId: "media-xyz", status: "active" });
    const repo = makeRepository({ findOneResult: user });
    const service = new UsersService(repo as never);
    const profile = await service.findPublicProfile("alice");
    expect(profile!.avatar).toBe("/api/media/media-xyz");
  });

  it("sets avatar to null when avatarMediaId is null", async () => {
    const user = makeUserEntity({ avatarMediaId: null, status: "active" });
    const repo = makeRepository({ findOneResult: user });
    const service = new UsersService(repo as never);
    const profile = await service.findPublicProfile("alice");
    expect(profile!.avatar).toBeNull();
  });
});
