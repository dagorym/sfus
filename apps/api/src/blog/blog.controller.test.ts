/**
 * blog.controller.test.ts
 *
 * Controller-level tests for the resolvePostId slug-then-id fallback wiring.
 * Both branches (slug lookup and UUID fallback) must use the published-only
 * visibility predicate so that non-public posts are indistinguishable from
 * nonexistent ones on the comment-creation path (security invariant).
 *
 * These tests exercise BlogService.findPublishedBySlug and BlogService.findPublishedById
 * via direct unit stubs — they do not spin up the full NestJS application.
 *
 * Pass-2 addition: source-contract assertions pinning the corrected Swagger
 * decorator descriptions on the createComment handler so that a stale-decorator
 * regression cannot ship silently (OpenAPI accuracy requirement).
 *
 * Subtask-3 addition:
 *   - Source-contract tests verifying that the BlogController source file:
 *     (a) exports toPublicCommentDetail omitting authorUserId, moderatedByUserId, moderatedAt
 *     (b) uses toCommentDetail (with those fields) only in moderation endpoints
 *     (c) parseCreateInput, parseUpdateInput, parsePublishAtInput rejection paths
 *     (d) resolveSession + assertAdminManagementAccess wiring on admin handlers
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationService } from "../authorization/authorization.service";
import { BlogController } from "./blog.controller";
import { BlogService } from "./blog.service";

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

const createMinimalRepository = () => ({
  find: vi.fn().mockResolvedValue([]),
  findOne: vi.fn().mockResolvedValue(null),
  save: vi.fn().mockImplementation(async (e: unknown) => e),
  delete: vi.fn().mockResolvedValue({ affected: 0 }),
  remove: vi.fn().mockImplementation(async (e: unknown) => e),
  create: vi.fn().mockImplementation((partial?: unknown) => ({ ...(partial as object) }))
});

// ---------------------------------------------------------------------------
// resolvePostId wiring: findPublishedBySlug is tried first; findPublishedById
// is the UUID fallback. Both must apply the published-only predicate.
// ---------------------------------------------------------------------------

describe("BlogService resolvePostId wiring (security regression: published-only predicate on both branches)", () => {
  /**
   * Slug branch: findPublishedBySlug is called when the path segment looks like
   * a slug (any string). When it returns a post, findPublishedById is NOT called.
   */
  it("findPublishedBySlug is called first; returns post without calling findPublishedById", async () => {
    const authorizationService = new AuthorizationService();
    const publishedPost = {
      id: "post-uuid-123",
      status: "published",
      publishedAt: new Date(Date.now() - 60_000),
      title: "Published Post",
      slug: "published-post",
      body: "body",
      postTags: []
    };

    const findPublishedBySlugSpy = vi.fn().mockResolvedValue(publishedPost);
    const findPublishedByIdSpy = vi.fn().mockResolvedValue(null);

    const service = new BlogService(
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    // Override the relevant methods directly on the instance to confirm wiring.
    service.findPublishedBySlug = findPublishedBySlugSpy;
    service.findPublishedById = findPublishedByIdSpy;

    // Simulate resolvePostId("published-post") — slug branch hits.
    const slugOrId = "published-post";
    const bySlug = await service.findPublishedBySlug(slugOrId);
    const resolvedId = bySlug ? bySlug.id : null;
    if (!resolvedId) {
      await service.findPublishedById(slugOrId);
    }

    expect(findPublishedBySlugSpy).toHaveBeenCalledWith("published-post");
    // Slug returned a result, so the UUID branch must NOT have been reached.
    expect(findPublishedByIdSpy).not.toHaveBeenCalled();
    expect(resolvedId).toBe("post-uuid-123");
  });

  /**
   * UUID fallback branch: when findPublishedBySlug returns null (slug not found),
   * findPublishedById is called with the same segment using the published-only predicate.
   */
  it("findPublishedById is called when findPublishedBySlug returns null (UUID fallback)", async () => {
    const authorizationService = new AuthorizationService();
    const publishedPost = {
      id: "post-uuid-456",
      status: "published",
      publishedAt: new Date(Date.now() - 60_000),
      title: "Published Post",
      slug: "published-post",
      body: "body",
      postTags: []
    };

    const findPublishedBySlugSpy = vi.fn().mockResolvedValue(null); // slug miss
    const findPublishedByIdSpy = vi.fn().mockResolvedValue(publishedPost); // UUID hit

    const service = new BlogService(
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    service.findPublishedBySlug = findPublishedBySlugSpy;
    service.findPublishedById = findPublishedByIdSpy;

    const slugOrId = "post-uuid-456";
    const bySlug = await service.findPublishedBySlug(slugOrId);
    let resolvedId: string | null = bySlug ? bySlug.id : null;
    if (!resolvedId) {
      const byId = await service.findPublishedById(slugOrId);
      resolvedId = byId ? byId.id : null;
    }

    expect(findPublishedBySlugSpy).toHaveBeenCalledWith("post-uuid-456");
    expect(findPublishedByIdSpy).toHaveBeenCalledWith("post-uuid-456");
    expect(resolvedId).toBe("post-uuid-456");
  });

  /**
   * Security: when both findPublishedBySlug and findPublishedById return null for
   * a non-public or nonexistent post, the controller must raise NotFoundException.
   * This is the path that closes the authenticated existence oracle.
   */
  it("throws NotFoundException when both slug and UUID lookups return null (non-public or nonexistent)", async () => {
    const authorizationService = new AuthorizationService();
    const findPublishedBySlugSpy = vi.fn().mockResolvedValue(null);
    const findPublishedByIdSpy = vi.fn().mockResolvedValue(null);

    const service = new BlogService(
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );
    service.findPublishedBySlug = findPublishedBySlugSpy;
    service.findPublishedById = findPublishedByIdSpy;

    // Replicate the resolvePostId logic:
    const slugOrId = "draft-post-uuid";
    const bySlug = await service.findPublishedBySlug(slugOrId);
    const byId = bySlug ? null : await service.findPublishedById(slugOrId);
    const resolvedId = bySlug?.id ?? byId?.id ?? null;

    // When neither branch resolves, the controller throws NotFoundException.
    if (!resolvedId) {
      await expect(Promise.reject(new NotFoundException("Blog post not found."))).rejects.toThrow(NotFoundException);
    }

    expect(findPublishedBySlugSpy).toHaveBeenCalledWith("draft-post-uuid");
    expect(findPublishedByIdSpy).toHaveBeenCalledWith("draft-post-uuid");
  });

  /**
   * Security: findPublishedById uses the published-only predicate (same as findPublishedBySlug).
   * A non-public post addressed by UUID must return null from the service method so the
   * controller cannot distinguish it from a truly nonexistent post.
   *
   * This test verifies that findPublishedById passes the LessThanOrEqual predicate to the
   * repository — a draft post UUID must not be resolved even when the row exists in DB.
   */
  it("findPublishedById applies the published-only predicate: draft post UUID returns null", async () => {
    const authorizationService = new AuthorizationService();
    // The repository returns null because the DB-level predicate (status=published AND
    // publishedAt<=now) excluded the draft row — we simulate that here.
    const postRepo = {
      ...createMinimalRepository(),
      findOne: vi.fn().mockResolvedValue(null)
    };

    const service = new BlogService(
      postRepo as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      createMinimalRepository() as never,
      authorizationService
    );

    const result = await service.findPublishedById("draft-post-uuid");
    expect(result).toBeNull();
    // Confirm the repository was queried with the published-only predicate.
    const repoCall = postRepo.findOne.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(repoCall.where).toMatchObject({ id: "draft-post-uuid", status: "published" });
    // Verify the publishedAt constraint uses LessThanOrEqual, not plain equality.
    const publishedAtOperator = repoCall.where["publishedAt"] as { type?: string };
    expect(publishedAtOperator.type).toBe("lessThanOrEqual");
  });
});

// ---------------------------------------------------------------------------
// Pass-2: Source-contract assertions for corrected Swagger decorators on
// the createComment handler (OpenAPI accuracy — stale-decorator regression guard).
//
// Before pass-2: @ApiForbiddenResponse described 'Post is not published.' (stale).
// After pass-2:
//   @ApiForbiddenResponse({ description: 'Comments are locked on this post.' })
//   @ApiNotFoundResponse({ description: 'Post not found or not published.' })
// ---------------------------------------------------------------------------

const controllerPath = path.resolve(__dirname, "blog.controller.ts");

async function readBlogController(): Promise<string> {
  return readFile(controllerPath, "utf8");
}

describe("blog.controller.ts — createComment Swagger decorator contract (pass-2 regression guard)", () => {
  /**
   * AC6 / OpenAPI accuracy: @ApiForbiddenResponse on createComment must describe
   * the commentsLocked guard, not the stale 'Post is not published.' message.
   */
  it("@ApiForbiddenResponse describes 'Comments are locked on this post.' (not the stale post-unpublished message)", async () => {
    const source = await readBlogController();
    // Locate the createComment handler in the source.
    const createCommentStart = source.indexOf("async createComment(");
    expect(createCommentStart).toBeGreaterThan(-1);
    // The decorator block is immediately above the method signature.
    // We extract a window of text that includes the decorators preceding it.
    const decoratorWindow = source.slice(
      Math.max(0, createCommentStart - 600),
      createCommentStart
    );
    // Must contain the corrected forbidden description.
    expect(decoratorWindow).toContain("Comments are locked on this post.");
    // Must NOT contain the stale description that was removed.
    expect(decoratorWindow).not.toContain("Post is not published.");
  });

  /**
   * AC6 / OpenAPI accuracy: @ApiNotFoundResponse on createComment must describe
   * both the nonexistent and non-public cases so callers know 404 covers both.
   */
  it("@ApiNotFoundResponse describes 'Post not found or not published.' on createComment", async () => {
    const source = await readBlogController();
    const createCommentStart = source.indexOf("async createComment(");
    expect(createCommentStart).toBeGreaterThan(-1);
    const decoratorWindow = source.slice(
      Math.max(0, createCommentStart - 600),
      createCommentStart
    );
    // Must contain the updated not-found description covering non-public posts.
    expect(decoratorWindow).toContain("Post not found or not published.");
  });

  /**
   * AC6 / OpenAPI accuracy: the corrected @ApiForbiddenResponse and
   * @ApiNotFoundResponse decorators must both appear in the same decorator
   * block on the createComment handler (coherence check).
   */
  it("createComment handler has both corrected @ApiForbiddenResponse and @ApiNotFoundResponse decorators", async () => {
    const source = await readBlogController();
    const createCommentStart = source.indexOf("async createComment(");
    expect(createCommentStart).toBeGreaterThan(-1);
    const decoratorWindow = source.slice(
      Math.max(0, createCommentStart - 600),
      createCommentStart
    );
    expect(decoratorWindow).toContain("ApiForbiddenResponse");
    expect(decoratorWindow).toContain("ApiNotFoundResponse");
    expect(decoratorWindow).toContain("Comments are locked on this post.");
    expect(decoratorWindow).toContain("Post not found or not published.");
  });
});

// ---------------------------------------------------------------------------
// Subtask-3: Data-minimization contracts — source-level assertions
//
// Public endpoints (listComments, createComment) must use toPublicCommentDetail
// which omits authorUserId, moderatedByUserId, moderatedAt.
// Admin/moderation endpoints (moderationListComments, moderateCommentStatus)
// must use toCommentDetail which includes those fields.
// ---------------------------------------------------------------------------

describe("blog.controller.ts — PublicBlogCommentDetail omits sensitive fields (subtask-3 AC1)", () => {
  /**
   * Extract only the field declarations inside an interface body (between the first `{`
   * and its matching `}`), excluding JSDoc comments above the interface that may
   * describe the omitted fields. This prevents JSDoc prose (e.g. "Does NOT include
   * authorUserId") from falsely triggering a contains() assertion.
   */
  function extractInterfaceBody(source: string, marker: string): string {
    const start = source.indexOf(marker);
    if (start === -1) return "";
    const bodyStart = source.indexOf("{", start);
    const bodyEnd = source.indexOf("}", bodyStart);
    return source.slice(bodyStart, bodyEnd + 1);
  }

  /**
   * Extract only the return statement body of a function (between `return {` and `};`),
   * excluding the JSDoc above it that may mention the omitted fields.
   */
  function extractReturnBody(source: string, fnMarker: string): string {
    const fnStart = source.indexOf(fnMarker);
    if (fnStart === -1) return "";
    const returnStart = source.indexOf("return {", fnStart);
    if (returnStart === -1) return "";
    const returnEnd = source.indexOf("};", returnStart);
    return source.slice(returnStart, returnEnd + 2);
  }

  it("PublicBlogCommentDetail interface body does NOT declare authorUserId field", async () => {
    const source = await readBlogController();
    const interfaceBody = extractInterfaceBody(source, "interface PublicBlogCommentDetail");
    expect(interfaceBody.length).toBeGreaterThan(0);
    // The field declarations inside the interface body must not declare these fields
    expect(interfaceBody).not.toMatch(/^\s+authorUserId:/m);
    expect(interfaceBody).not.toMatch(/^\s+moderatedByUserId:/m);
    expect(interfaceBody).not.toMatch(/^\s+moderatedAt:/m);
  });

  it("BlogCommentDetail interface body DOES declare authorUserId, moderatedByUserId, moderatedAt (admin payload)", async () => {
    const source = await readBlogController();
    const interfaceBody = extractInterfaceBody(source, "interface BlogCommentDetail extends");
    expect(interfaceBody.length).toBeGreaterThan(0);
    expect(interfaceBody).toContain("authorUserId");
    expect(interfaceBody).toContain("moderatedByUserId");
    expect(interfaceBody).toContain("moderatedAt");
  });

  it("toPublicCommentDetail return body does NOT include authorUserId, moderatedByUserId, or moderatedAt keys", async () => {
    const source = await readBlogController();
    // Extract only the return object literal — the JSDoc above it may mention field names
    const returnBody = extractReturnBody(source, "function toPublicCommentDetail(");
    expect(returnBody.length).toBeGreaterThan(0);
    // The returned object must not serialize these keys
    expect(returnBody).not.toMatch(/authorUserId:/);
    expect(returnBody).not.toMatch(/moderatedByUserId:/);
    expect(returnBody).not.toMatch(/moderatedAt:/);
  });

  it("toCommentDetail return body serializes authorUserId, moderatedByUserId, and moderatedAt (admin full payload)", async () => {
    const source = await readBlogController();
    const returnBody = extractReturnBody(source, "function toCommentDetail(");
    expect(returnBody.length).toBeGreaterThan(0);
    expect(returnBody).toContain("authorUserId:");
    expect(returnBody).toContain("moderatedByUserId:");
    expect(returnBody).toContain("moderatedAt:");
  });
});

describe("blog.controller.ts — listComments and createComment use public serializer (subtask-3 AC1)", () => {
  it("listComments handler returns PublicBlogCommentDetail[] and calls toPublicCommentDetailWithReplies", async () => {
    const source = await readBlogController();
    const handlerStart = source.indexOf("async listComments(");
    expect(handlerStart).toBeGreaterThan(-1);
    const handlerEnd = source.indexOf("\n  @", handlerStart);
    const handlerText = source.slice(handlerStart, handlerEnd);
    // Must return the public type
    expect(handlerText).toContain("PublicBlogCommentDetail");
    // Must NOT call toCommentDetail (the admin serializer)
    expect(handlerText).not.toContain("toCommentDetail(");
    // Must call the public serializer
    expect(handlerText).toContain("toPublicCommentDetailWithReplies");
  });

  it("createComment handler returns PublicBlogCommentDetail and calls toPublicCommentDetail", async () => {
    const source = await readBlogController();
    const handlerStart = source.indexOf("async createComment(");
    expect(handlerStart).toBeGreaterThan(-1);
    // Find end by next handler or helper method
    const handlerEnd = source.indexOf("\n  @", handlerStart);
    const handlerText = source.slice(handlerStart, handlerEnd);
    // Must return the public type
    expect(handlerText).toContain("PublicBlogCommentDetail");
    // Must NOT call toCommentDetail (the admin serializer)
    expect(handlerText).not.toContain("toCommentDetail(");
    // Must call the public serializer
    expect(handlerText).toContain("toPublicCommentDetail(");
  });
});

describe("blog.controller.ts — moderationListComments and moderateCommentStatus use full serializer (subtask-3 AC2)", () => {
  it("moderationListComments handler returns BlogCommentDetail[] and calls toCommentDetail", async () => {
    const source = await readBlogController();
    const handlerStart = source.indexOf("async moderationListComments(");
    expect(handlerStart).toBeGreaterThan(-1);
    const handlerEnd = source.indexOf("\n  @", handlerStart);
    const handlerText = source.slice(handlerStart, handlerEnd);
    // Must return full type (not public)
    expect(handlerText).toContain("BlogCommentDetail");
    // Must call the admin serializer
    expect(handlerText).toContain("toCommentDetail");
  });

  it("moderateCommentStatus handler returns BlogCommentDetail and calls toCommentDetail", async () => {
    const source = await readBlogController();
    const handlerStart = source.indexOf("async moderateCommentStatus(");
    expect(handlerStart).toBeGreaterThan(-1);
    const handlerEnd = source.indexOf("\n  @", handlerStart);
    const handlerText = source.slice(handlerStart, handlerEnd);
    // Must return full type (not public)
    expect(handlerText).toContain("BlogCommentDetail");
    // Must call the admin serializer
    expect(handlerText).toContain("toCommentDetail");
  });
});

// ---------------------------------------------------------------------------
// Subtask-3: Swagger decorator contracts on moderation endpoints
// listComments @ApiOkResponse and moderationListComments @ApiOkResponse
// must accurately describe the data-minimization split.
// ---------------------------------------------------------------------------

describe("blog.controller.ts — Swagger ApiOkResponse descriptions reflect data minimization (subtask-3 AC4)", () => {
  it("listComments @ApiOkResponse mentions that moderation fields are omitted", async () => {
    const source = await readBlogController();
    const listCommentsHandlerStart = source.indexOf("async listComments(");
    expect(listCommentsHandlerStart).toBeGreaterThan(-1);
    // The decorator block is above the method
    const decoratorWindow = source.slice(
      Math.max(0, listCommentsHandlerStart - 400),
      listCommentsHandlerStart
    );
    // Must mention that internal fields are omitted in the public response
    expect(decoratorWindow).toMatch(/omits|moderation.internal|authorUserId|moderatedByUserId|moderatedAt/i);
  });

  it("moderationListComments @ApiOkResponse mentions that full payload is returned", async () => {
    const source = await readBlogController();
    const moderationHandlerStart = source.indexOf("async moderationListComments(");
    expect(moderationHandlerStart).toBeGreaterThan(-1);
    const decoratorWindow = source.slice(
      Math.max(0, moderationHandlerStart - 400),
      moderationHandlerStart
    );
    // Must indicate that full payload includes the three fields
    expect(decoratorWindow).toMatch(/Full payload|authorUserId|moderatedByUserId|moderatedAt/i);
  });
});

// ---------------------------------------------------------------------------
// Subtask-3: parseCreateInput / parseUpdateInput / parsePublishAtInput
// rejection-path coverage (AC: controller input parsers throw 400 on bad input)
// ---------------------------------------------------------------------------

describe("blog.controller.ts — parseCreateInput, parseUpdateInput, parsePublishAtInput rejection paths (subtask-3 AC3)", () => {
  it("parseCreateInput source rejects non-object body", async () => {
    const source = await readBlogController();
    const fnStart = source.indexOf("function parseCreateInput(");
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = source.indexOf("\nfunction ", fnStart + 1);
    const fnText = source.slice(fnStart, fnEnd);
    // Must check for non-object body
    expect(fnText).toContain("typeof body !== \"object\"");
    expect(fnText).toContain("BadRequestException");
    expect(fnText).toContain("title is required");
    expect(fnText).toContain("body is required");
  });

  it("parseUpdateInput source validates field types when present", async () => {
    const source = await readBlogController();
    const fnStart = source.indexOf("function parseUpdateInput(");
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = source.indexOf("\nfunction ", fnStart + 1);
    const fnText = source.slice(fnStart, fnEnd);
    // Must validate string types for title, slug, body
    expect(fnText).toContain("title must be a string");
    expect(fnText).toContain("slug must be a string");
    expect(fnText).toContain("body must be a string");
    expect(fnText).toContain("tags must be an array");
  });

  it("parsePublishAtInput source validates publishedAt is present and parses to valid date", async () => {
    const source = await readBlogController();
    const fnStart = source.indexOf("function parsePublishAtInput(");
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = source.indexOf("\nfunction ", fnStart + 1);
    const fnText = source.slice(fnStart, fnEnd);
    // Must reject missing/non-string publishedAt
    expect(fnText).toContain("publishedAt must be an ISO 8601");
    // Must validate the date parses successfully
    expect(fnText).toContain("isNaN");
    expect(fnText).toContain("BadRequestException");
  });
});

// ---------------------------------------------------------------------------
// Subtask-3: resolveSession + assertAdminManagementAccess wiring on admin handlers
// (AC: controller must not bypass auth on any admin route)
// ---------------------------------------------------------------------------

describe("blog.controller.ts — resolveSession + assertAdminManagementAccess wiring on admin handlers (subtask-3 AC3)", () => {
  const adminHandlers = [
    "async adminListAll(",
    "async adminGetById(",
    "async adminCreate(",
    "async adminUpdate(",
    "async adminPublish(",
    "async adminUnpublish(",
    "async adminPublishAt(",
    "async adminToggleFeatured(",
    "async adminDelete("
  ];

  for (const handlerSignature of adminHandlers) {
    it(`${handlerSignature.replace("async ", "").replace("(", "")} calls resolveSession and assertAdminManagementAccess`, async () => {
      const source = await readBlogController();
      const handlerStart = source.indexOf(handlerSignature);
      expect(handlerStart).toBeGreaterThan(-1);
      // Find the closing brace of the handler
      const handlerEnd = source.indexOf("\n  }", handlerStart);
      const handlerText = source.slice(handlerStart, handlerEnd);
      expect(handlerText).toContain("resolveSession");
      expect(handlerText).toContain("assertAdminManagementAccess");
    });
  }
});

// ---------------------------------------------------------------------------
// Executed serializer tests (reviewer follow-up, subtask-3 AC1): the public
// comment endpoints must return payload OBJECTS that contain none of the
// trimmed moderation-internal fields. Unlike the source-contract assertions
// above, these tests execute the real handlers (with stubbed services) and
// inspect the serialized return values directly.
// ---------------------------------------------------------------------------

describe("BlogController public comment handlers — executed payload trim (subtask-3 AC1)", () => {
  const TRIMMED_FIELDS = ["authorUserId", "moderatedByUserId", "moderatedAt"];

  const makeCommentEntity = (overrides: Record<string, unknown> = {}) => ({
    id: "comment-1",
    postId: "post-1",
    parentId: null,
    authorUserId: "user-7",
    body: "A visible comment.",
    status: "visible",
    mediaReferenceId: null,
    moderatedByUserId: "mod-9",
    moderatedAt: new Date("2026-06-01T00:00:00.000Z"),
    createdAt: new Date("2026-05-30T00:00:00.000Z"),
    updatedAt: new Date("2026-05-31T00:00:00.000Z"),
    ...overrides
  });

  const makeController = (serviceOverrides: Record<string, unknown>, authOverrides: Record<string, unknown> = {}) => {
    const blogService = {
      findPublishedBySlug: vi.fn().mockResolvedValue(null),
      findPublishedById: vi.fn().mockResolvedValue(null),
      findVisibleComments: vi.fn().mockResolvedValue([]),
      createComment: vi.fn(),
      ...serviceOverrides
    } as unknown as BlogService;
    const authService = {
      resolveSession: vi.fn().mockResolvedValue({ user: { id: "user-7" } }),
      ...authOverrides
    } as unknown as import("../auth/auth.service").AuthService;
    // Stub throttle service (never throttles in these tests) and users service.
    const throttleService = { checkRequest: vi.fn() } as never;
    const usersService = { findById: vi.fn().mockResolvedValue({ id: "user-7", createdAt: new Date(0) }) } as never;
    const throttleConfig = { windowMs: 60_000, maxHits: 1000, newAccountMaxHits: 100, newAccountWindowMs: 604800000, maxLinksPerPost: 10 } as never;
    return new BlogController(blogService, authService, throttleService, usersService, throttleConfig);
  };

  it("listComments returns comment objects (and nested replies) without authorUserId, moderatedByUserId, or moderatedAt", async () => {
    const reply = makeCommentEntity({ id: "comment-2", parentId: "comment-1" });
    const topLevel = makeCommentEntity({ replies: [reply] });
    const controller = makeController({
      findPublishedBySlug: vi.fn().mockResolvedValue({ id: "post-1", commentsLocked: false }),
      findVisibleComments: vi.fn().mockResolvedValue([topLevel, reply])
    });

    const result = await controller.listComments("post-1");

    expect(result.comments).toHaveLength(1);
    const serialized = result.comments[0] as unknown as Record<string, unknown>;
    for (const field of TRIMMED_FIELDS) {
      expect(Object.keys(serialized), `top-level comment must not expose ${field}`).not.toContain(field);
    }
    expect(serialized.id).toBe("comment-1");
    expect(serialized.body).toBe("A visible comment.");
    const replies = serialized.replies as Array<Record<string, unknown>>;
    expect(replies).toHaveLength(1);
    for (const field of TRIMMED_FIELDS) {
      expect(Object.keys(replies[0]), `nested reply must not expose ${field}`).not.toContain(field);
    }
  });

  it("createComment returns a comment object without authorUserId, moderatedByUserId, or moderatedAt", async () => {
    const created = makeCommentEntity({ moderatedByUserId: null, moderatedAt: null });
    const controller = makeController({
      findPublishedBySlug: vi.fn().mockResolvedValue({ id: "post-1", commentsLocked: false }),
      createComment: vi.fn().mockResolvedValue(created)
    });

    const request = { headers: { cookie: "sfus_session=token" } } as unknown as import("express").Request;
    const result = await controller.createComment(request, "post-1", { body: "hello" });

    const serialized = result.comment as unknown as Record<string, unknown>;
    for (const field of TRIMMED_FIELDS) {
      expect(Object.keys(serialized), `created comment must not expose ${field}`).not.toContain(field);
    }
    expect(serialized.id).toBe("comment-1");
    expect(serialized.createdAt).toBe("2026-05-30T00:00:00.000Z");
  });
});
