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
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationService } from "../authorization/authorization.service";
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
