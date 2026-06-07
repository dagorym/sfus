import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationService } from "../authorization/authorization.service";
import { PagesService, RESERVED_PAGE_SLUGS } from "./pages.service";
import type { PageRevisionEntity } from "./entities/page-revision.entity";
import type { StandalonePageEntity } from "./entities/standalone-page.entity";
import type { MediaReferenceEntity } from "../media/entities/media-reference.entity";

// Minimal Repository stub — only the methods called by PagesService are needed.
type MinimalRepository<T> = {
  find: (opts?: unknown) => Promise<T[]>;
  findOne: (opts?: unknown) => Promise<T | null>;
  create: (data: unknown) => T;
  save: (entity: T) => Promise<T>;
  delete?: (opts?: unknown) => Promise<unknown>;
  manager?: {
    transaction: (cb: (em: unknown) => Promise<unknown>) => Promise<unknown>;
  };
};

// Build an EntityManager stub that routes getRepository() calls to the provided
// per-entity mock repositories. Used for transaction-aware create() tests.
const makeEntityManagerStub = (
  pageRepo: MinimalRepository<StandalonePageEntity>,
  revisionRepo: MinimalRepository<PageRevisionEntity>
): unknown => ({
  getRepository: (entity: unknown) => {
    // Import cycles are avoided by comparing constructor names at runtime.
    const name = (entity as { name?: string }).name;
    if (name === "StandalonePageEntity") return pageRepo;
    if (name === "PageRevisionEntity") return revisionRepo;
    throw new Error(`Unexpected getRepository call for entity: ${String(name)}`);
  }
});

const createMinimalRepository = <T>(
  defaults?: Partial<MinimalRepository<T>>,
  transactionPageRepo?: MinimalRepository<StandalonePageEntity>,
  transactionRevisionRepo?: MinimalRepository<PageRevisionEntity>
): MinimalRepository<T> => {
  const base: MinimalRepository<T> = {
    find: async () => [],
    findOne: async () => null,
    create: (data: unknown) => data as T,
    save: async (entity: T) => entity,
    ...defaults
  };
  // Attach a manager.transaction stub that delegates to the per-entity repo mocks.
  // Falls back to a stub that executes the callback with an entity manager that
  // routes to the same outer repo when inner repos are not explicitly supplied.
  if (transactionPageRepo !== undefined && transactionRevisionRepo !== undefined) {
    base.manager = {
      transaction: async (cb) =>
        cb(makeEntityManagerStub(transactionPageRepo, transactionRevisionRepo))
    };
  } else if (transactionPageRepo !== undefined || transactionRevisionRepo !== undefined) {
    throw new Error("Both transactionPageRepo and transactionRevisionRepo must be supplied together");
  }
  return base;
};

// makePagesService builds a PagesService with stubbed repositories.
//
// pageRepo / revisionRepo   — stubs for the outer @InjectRepository-bound repos
//                             used by update/publish/unpublish/restoreRevision/find*.
// txPageRepo / txRevisionRepo — stubs for the repos obtained via
//                               entityManager.getRepository() inside the
//                               create() transaction callback.  When omitted,
//                               create() tests that reach the transaction will
//                               fail with "Cannot read properties of undefined
//                               (reading 'transaction')" as expected.
// mediaRepo — stub for the MediaReferenceEntity repository used by
//             assertFeaturedMediaExists. Defaults to findOne returning null
//             (media not found) when not supplied.
const makePagesService = (
  pageRepo?: Partial<MinimalRepository<StandalonePageEntity>>,
  revisionRepo?: Partial<MinimalRepository<PageRevisionEntity>>,
  txPageRepo?: MinimalRepository<StandalonePageEntity>,
  txRevisionRepo?: MinimalRepository<PageRevisionEntity>,
  mediaRepo?: Partial<MinimalRepository<MediaReferenceEntity>>
): PagesService => {
  const authorizationService = new AuthorizationService();
  return new PagesService(
    createMinimalRepository<StandalonePageEntity>(pageRepo, txPageRepo, txRevisionRepo) as never,
    createMinimalRepository<PageRevisionEntity>(revisionRepo) as never,
    createMinimalRepository<MediaReferenceEntity>(mediaRepo) as never,
    authorizationService
  );
};

describe("PagesService.assertAdminManagementAccess", () => {
  // Acceptance criterion: PagesService.assertAdminManagementAccess() enforces
  // admin-only site-wide management by delegating to
  // AuthorizationService.hasGlobalRole('admin').

  it("allows the admin global role to manage standalone pages", () => {
    const service = makePagesService();
    // Should not throw for a user with the admin role.
    expect(() => service.assertAdminManagementAccess("admin")).not.toThrow();
  });

  it("throws ForbiddenException when the caller has the user role", () => {
    const service = makePagesService();
    expect(() => service.assertAdminManagementAccess("user")).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException when the caller has the moderator role", () => {
    const service = makePagesService();
    // Moderator is below admin — page management is admin-only.
    expect(() => service.assertAdminManagementAccess("moderator")).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException when the caller has no role (empty string)", () => {
    const service = makePagesService();
    expect(() => service.assertAdminManagementAccess("")).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException for an unrecognised role", () => {
    const service = makePagesService();
    expect(() => service.assertAdminManagementAccess("editor")).toThrow(ForbiddenException);
  });
});

describe("PagesService.findPublished", () => {
  it("returns only published pages", async () => {
    const published = { id: "1", status: "published", title: "About", slug: "about" } as StandalonePageEntity;
    const service = makePagesService({ find: async () => [published] });
    const results = await service.findPublished();
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("published");
  });
});

describe("PagesService.findPublishedBySlug", () => {
  it("returns null when no page exists", async () => {
    const service = makePagesService();
    const result = await service.findPublishedBySlug("not-found");
    expect(result).toBeNull();
  });

  it("returns the page when found", async () => {
    const page = { id: "1", status: "published", slug: "about" } as StandalonePageEntity;
    const service = makePagesService({ findOne: async () => page });
    const result = await service.findPublishedBySlug("about");
    expect(result).toBe(page);
  });
});

describe("PagesService.create", () => {
  it("creates a page with revision 1 and returns it", async () => {
    // AC: A successful create persists the page and revision 1 and returns an
    // entity with currentRevisionId set, exactly as before the transaction refactor.
    const savedRevision = {
      id: "rev-1",
      pageId: "page-1",
      revisionNumber: 1,
      title: "About",
      body: "Content",
      authorUserId: "user-1",
      createdAt: new Date()
    } as PageRevisionEntity;
    const savedPage = {
      id: "page-1",
      title: "About",
      slug: "about",
      status: "draft",
      currentRevisionId: "rev-1",
      createdByUserId: "user-1",
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as StandalonePageEntity;

    const revisionSave = vi.fn().mockResolvedValue(savedRevision);
    const pageSave = vi.fn().mockResolvedValue(savedPage);
    const pageFind = vi.fn().mockResolvedValue(savedPage);

    // Transaction-aware repos: txPageRepo and txRevisionRepo are used inside the
    // manager.transaction callback via entityManager.getRepository().
    const txPageRepo: MinimalRepository<StandalonePageEntity> = {
      find: async () => [],
      findOne: pageFind,
      create: (d) => d as StandalonePageEntity,
      save: pageSave
    };
    const txRevisionRepo: MinimalRepository<PageRevisionEntity> = {
      find: async () => [],
      findOne: async () => null,
      create: (d) => d as PageRevisionEntity,
      save: revisionSave
    };

    const service = makePagesService(
      { save: pageSave, findOne: pageFind, create: (d) => d as StandalonePageEntity },
      { save: revisionSave, create: (d) => d as PageRevisionEntity, findOne: async () => null },
      txPageRepo,
      txRevisionRepo
    );

    const result = await service.create("user-1", { title: "About", slug: "about", body: "Content" });
    expect(result.title).toBe("About");
    expect(result.currentRevisionId).toBe("rev-1");
    expect(revisionSave).toHaveBeenCalledOnce();
  });

  it("inserts standalone_pages row before page_revisions row (FK-correct order)", async () => {
    // AC: The standalone_pages parent row must be persisted before the child
    // page_revisions row so the FK page_revisions.page_id → standalone_pages.id
    // is satisfied without a constraint violation. The transaction wrapping does
    // not change the required FK-aware insert order.
    const callOrder: string[] = [];

    const savedRevision = {
      id: "rev-fk",
      pageId: "page-fk",
      revisionNumber: 1,
      title: "FK Test",
      body: "Body",
      authorUserId: "user-1",
      createdAt: new Date()
    } as PageRevisionEntity;

    const savedPage = {
      id: "page-fk",
      title: "FK Test",
      slug: "fk-test",
      status: "draft",
      currentRevisionId: "rev-fk",
      createdByUserId: "user-1",
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as StandalonePageEntity;

    const pageSave = vi.fn().mockImplementation(async () => {
      callOrder.push("pageSave");
      return savedPage;
    });
    const revisionSave = vi.fn().mockImplementation(async () => {
      callOrder.push("revisionSave");
      return savedRevision;
    });

    const txPageRepo: MinimalRepository<StandalonePageEntity> = {
      find: async () => [],
      findOne: vi.fn().mockResolvedValue(savedPage),
      create: (d) => d as StandalonePageEntity,
      save: pageSave
    };
    const txRevisionRepo: MinimalRepository<PageRevisionEntity> = {
      find: async () => [],
      findOne: async () => null,
      create: (d) => d as PageRevisionEntity,
      save: revisionSave
    };

    const service = makePagesService(
      { save: pageSave, findOne: vi.fn().mockResolvedValue(savedPage), create: (d) => d as StandalonePageEntity },
      { save: revisionSave, create: (d) => d as PageRevisionEntity, findOne: async () => null },
      txPageRepo,
      txRevisionRepo
    );

    await service.create("user-1", { title: "FK Test", slug: "fk-test", body: "Body" });

    // Page must be saved at least once before revision is saved (FK order).
    const firstPageSaveIdx = callOrder.indexOf("pageSave");
    const firstRevisionSaveIdx = callOrder.indexOf("revisionSave");
    expect(firstPageSaveIdx).toBeGreaterThanOrEqual(0);
    expect(firstRevisionSaveIdx).toBeGreaterThanOrEqual(0);
    expect(firstPageSaveIdx).toBeLessThan(firstRevisionSaveIdx);
  });

  it("rolls back the entire create when the revision save fails mid-transaction", async () => {
    // AC1: A failure at any step of create() leaves no standalone_pages row and
    // no page_revisions row from that call; the slug is immediately reusable.
    //
    // This test verifies that when the revision insert (step 2) throws, the
    // transaction callback propagates the error and no partial state is persisted.
    // In production TypeORM will roll back the DB transaction automatically;
    // here we verify the error propagates through the transaction wrapper so the
    // caller receives a rejection rather than a silent partial write.
    const pageSave = vi.fn().mockResolvedValue({
      id: "pg-1",
      slug: "atomic-test",
      currentRevisionId: null
    } as unknown as StandalonePageEntity);
    const revisionSave = vi.fn().mockRejectedValue(new Error("DB constraint violation"));

    const txPageRepo: MinimalRepository<StandalonePageEntity> = {
      find: async () => [],
      findOne: async () => null,
      create: (d) => d as StandalonePageEntity,
      save: pageSave
    };
    const txRevisionRepo: MinimalRepository<PageRevisionEntity> = {
      find: async () => [],
      findOne: async () => null,
      create: (d) => d as PageRevisionEntity,
      save: revisionSave
    };

    const service = makePagesService(
      { create: (d) => d as StandalonePageEntity },
      { create: (d) => d as PageRevisionEntity },
      txPageRepo,
      txRevisionRepo
    );

    // The create() call must reject when any step inside the transaction fails.
    await expect(
      service.create("user-1", { title: "Atomic Test", slug: "atomic-test", body: "Safe body" })
    ).rejects.toThrow("DB constraint violation");

    // The revision save was attempted — the error is from inside the transaction.
    expect(revisionSave).toHaveBeenCalledOnce();
  });

  it("rejects invalid slugs", async () => {
    const service = makePagesService();
    await expect(service.create("user-1", { title: "T", slug: "INVALID SLUG", body: "" })).rejects.toThrow();
  });

  it("rejects empty titles", async () => {
    const service = makePagesService();
    await expect(service.create("user-1", { title: "  ", slug: "about", body: "" })).rejects.toThrow();
  });
});

describe("PagesService.publish", () => {
  it("throws NotFoundException when page does not exist", async () => {
    const service = makePagesService({ findOne: async () => null });
    await expect(service.publish("missing-id")).rejects.toThrow(NotFoundException);
  });

  it("sets status to published and sets publishedAt", async () => {
    const page = {
      id: "page-1",
      status: "draft",
      publishedAt: null,
      title: "About",
      slug: "about",
      currentRevisionId: "rev-1",
      createdByUserId: "u",
      createdAt: new Date(),
      updatedAt: new Date()
    } as StandalonePageEntity;

    const savedPage = { ...page, status: "published", publishedAt: new Date() } as StandalonePageEntity;
    const findOne = vi.fn()
      .mockResolvedValueOnce(page)   // initial load for mutation
      .mockResolvedValueOnce(savedPage); // re-fetch after save
    const save = vi.fn().mockResolvedValue(savedPage);

    const service = makePagesService({ findOne, save });
    const result = await service.publish("page-1");
    expect(result.status).toBe("published");
    expect(result.publishedAt).not.toBeNull();
  });
});

describe("PagesService.unpublish", () => {
  it("throws NotFoundException when page does not exist", async () => {
    const service = makePagesService({ findOne: async () => null });
    await expect(service.unpublish("missing-id")).rejects.toThrow(NotFoundException);
  });

  it("sets status to unpublished", async () => {
    const page = { id: "page-1", status: "published", publishedAt: new Date() } as StandalonePageEntity;
    const savedPage = { ...page, status: "unpublished" } as StandalonePageEntity;
    const findOne = vi.fn()
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(savedPage);
    const save = vi.fn().mockResolvedValue(savedPage);

    const service = makePagesService({ findOne, save });
    const result = await service.unpublish("page-1");
    expect(result.status).toBe("unpublished");
  });
});

describe("PagesService.restoreRevision", () => {
  it("throws NotFoundException when page does not exist", async () => {
    const service = makePagesService({ findOne: async () => null });
    await expect(service.restoreRevision("missing-page", "rev-1", "user-1")).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException when revision does not belong to page", async () => {
    const page = { id: "page-1", status: "draft" } as StandalonePageEntity;
    const service = makePagesService(
      { findOne: async () => page },
      { findOne: async () => null } // revision not found
    );
    await expect(service.restoreRevision("page-1", "rev-999", "user-1")).rejects.toThrow(NotFoundException);
  });

  it("creates a new revision with the restored content", async () => {
    const page = { id: "page-1", status: "draft", title: "About", currentRevisionId: "rev-1" } as StandalonePageEntity;
    const sourceRevision = {
      id: "rev-1",
      pageId: "page-1",
      title: "Old Title",
      body: "Old body",
      revisionNumber: 1,
      authorUserId: "u",
      createdAt: new Date()
    } as PageRevisionEntity;
    const latestRevision = {
      id: "rev-2",
      pageId: "page-1",
      revisionNumber: 2,
      title: "Current",
      body: "Current body",
      authorUserId: "u",
      createdAt: new Date()
    } as PageRevisionEntity;

    const newRevision = { ...sourceRevision, id: "rev-3", revisionNumber: 3 };
    const updatedPage = { ...page, title: "Old Title", currentRevisionId: "rev-3" } as StandalonePageEntity;

    const pageFind = vi.fn().mockResolvedValue(updatedPage);
    const pageSave = vi.fn().mockResolvedValue(updatedPage);
    // revision findOne: first call for source (by id+pageId), second for latest (DESC order)
    const revFind = vi.fn()
      .mockResolvedValueOnce(sourceRevision)  // source revision lookup
      .mockResolvedValueOnce(latestRevision); // latest revision for next number
    const revSave = vi.fn().mockResolvedValue(newRevision);

    const service = makePagesService(
      { findOne: pageFind, save: pageSave, create: (d) => d as StandalonePageEntity },
      { findOne: revFind, save: revSave, create: (d) => d as PageRevisionEntity }
    );

    const result = await service.restoreRevision("page-1", "rev-1", "user-1");
    expect(revSave).toHaveBeenCalledOnce();
    expect(result.currentRevisionId).toBe("rev-3");
  });
});

describe("PagesService.findRevisions", () => {
  it("returns revision list for a page", async () => {
    const revisions = [
      { id: "rev-1", revisionNumber: 1 } as PageRevisionEntity,
      { id: "rev-2", revisionNumber: 2 } as PageRevisionEntity
    ];
    const service = makePagesService({}, { find: async () => revisions });
    const result = await service.findRevisions("page-1");
    expect(result).toHaveLength(2);
  });
});

describe("PagesService.update", () => {
  // Acceptance criterion: Every standalone-page edit creates durable revision
  // history — update() must append a new revision each time it is called.

  it("throws NotFoundException when page does not exist", async () => {
    const service = makePagesService({ findOne: async () => null });
    await expect(service.update("missing-id", "user-1", { title: "New" })).rejects.toThrow(NotFoundException);
  });

  it("creates a new revision on each edit (durable revision history)", async () => {
    const page = {
      id: "page-1",
      title: "About",
      slug: "about",
      status: "draft",
      currentRevisionId: "rev-1",
      createdByUserId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date()
    } as StandalonePageEntity;
    const latestRevision = {
      id: "rev-1",
      pageId: "page-1",
      revisionNumber: 1,
      title: "About",
      body: "Original body",
      authorUserId: "user-1",
      createdAt: new Date()
    } as PageRevisionEntity;
    const newRevision = { ...latestRevision, id: "rev-2", revisionNumber: 2, title: "About Updated" };
    const updatedPage = { ...page, title: "About Updated", currentRevisionId: "rev-2" } as StandalonePageEntity;

    const pageFind = vi.fn()
      .mockResolvedValueOnce(page)     // initial load for mutation
      .mockResolvedValueOnce(updatedPage); // re-fetch after save
    const pageSave = vi.fn().mockResolvedValue(updatedPage);
    const revFind = vi.fn().mockResolvedValue(latestRevision); // latest revision lookup
    const revSave = vi.fn().mockResolvedValue(newRevision);

    const service = makePagesService(
      { findOne: pageFind, save: pageSave, create: (d) => d as StandalonePageEntity },
      { findOne: revFind, save: revSave, create: (d) => d as PageRevisionEntity }
    );

    const result = await service.update("page-1", "user-1", { title: "About Updated", body: "Updated body" });
    expect(revSave).toHaveBeenCalledOnce();
    expect(result.currentRevisionId).toBe("rev-2");
  });

  it("rejects invalid slugs on update", async () => {
    const page = {
      id: "page-1",
      title: "About",
      slug: "about",
      status: "draft",
      currentRevisionId: "rev-1",
      createdByUserId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date()
    } as StandalonePageEntity;
    const service = makePagesService({ findOne: async () => page });
    await expect(service.update("page-1", "user-1", { slug: "INVALID SLUG" })).rejects.toThrow();
  });

  it("rejects empty titles on update", async () => {
    const page = {
      id: "page-1",
      title: "About",
      slug: "about",
      status: "draft",
      currentRevisionId: "rev-1",
      createdByUserId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date()
    } as StandalonePageEntity;
    const service = makePagesService({ findOne: async () => page });
    await expect(service.update("page-1", "user-1", { title: "   " })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// RESERVED_PAGE_SLUGS set membership — cardinality and exact members
// ---------------------------------------------------------------------------

describe("RESERVED_PAGE_SLUGS set membership", () => {
  // AC: RESERVED_PAGE_SLUGS must contain exactly the documented reserved slugs;
  // any addition or removal should cause this test to fail and prompt a review.

  it("contains exactly the expected reserved slugs (set-equality pin)", () => {
    const expected = new Set([
      "admin",
      "api",
      "app",
      "blog",
      "login",
      "pages",
      "register",
      "onboarding",
      "profile",
      "settings",
      "health"
    ]);

    // Cardinality must match before checking membership.
    expect(RESERVED_PAGE_SLUGS.size).toBe(expected.size);

    // Every expected slug must be present.
    for (const slug of expected) {
      expect(RESERVED_PAGE_SLUGS.has(slug), `Expected "${slug}" to be in RESERVED_PAGE_SLUGS`).toBe(true);
    }

    // No extra slugs should be present.
    for (const slug of RESERVED_PAGE_SLUGS) {
      expect(expected.has(slug), `Unexpected slug "${slug}" found in RESERVED_PAGE_SLUGS`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// featuredMediaId validation (AC: reject nonexistent media at all 3 write sites)
// ---------------------------------------------------------------------------

describe("PagesService.create — featuredMediaId validation", () => {
  // AC: create() rejects a nonexistent featuredMediaId with BadRequestException
  // BEFORE entering the transaction so no orphaned DB rows are created.

  it("throws BadRequestException when featuredMediaId references a nonexistent media record (site 1)", async () => {
    // mediaRepository.findOne returns null → media not found
    const service = makePagesService(
      undefined,
      undefined,
      undefined,
      undefined,
      { findOne: async () => null }
    );
    await expect(
      service.create("user-1", { title: "T", slug: "about", body: "Safe body", featuredMediaId: "nonexistent-media-id" })
    ).rejects.toThrow(BadRequestException);
  });

  it("does not throw when featuredMediaId is null (no media check needed)", async () => {
    const savedRevision = { id: "rev-1", pageId: "p-1", revisionNumber: 1, title: "T", body: "Safe body", authorUserId: "u", createdAt: new Date() } as PageRevisionEntity;
    const savedPage = { id: "p-1", title: "T", slug: "about", status: "draft", currentRevisionId: "rev-1", createdByUserId: "u", publishedAt: null, createdAt: new Date(), updatedAt: new Date() } as StandalonePageEntity;
    const pageSaveFn = vi.fn().mockResolvedValue(savedPage);
    const pageOneFn = vi.fn().mockResolvedValue(savedPage);
    const revSaveFn = vi.fn().mockResolvedValue(savedRevision);
    const txPageRepo: MinimalRepository<StandalonePageEntity> = {
      find: async () => [], findOne: pageOneFn, create: (d) => d as StandalonePageEntity, save: pageSaveFn
    };
    const txRevisionRepo: MinimalRepository<PageRevisionEntity> = {
      find: async () => [], findOne: async () => null, create: (d) => d as PageRevisionEntity, save: revSaveFn
    };
    const service = makePagesService(
      { save: pageSaveFn, findOne: pageOneFn, create: (d) => d as StandalonePageEntity },
      { save: revSaveFn, create: (d) => d as PageRevisionEntity, findOne: async () => null },
      txPageRepo,
      txRevisionRepo,
      // mediaRepo not called when featuredMediaId is null
      { findOne: async () => null }
    );
    await expect(
      service.create("u", { title: "T", slug: "about", body: "Safe body", featuredMediaId: null })
    ).resolves.toBeTruthy();
  });
});

describe("PagesService.update — featuredMediaId validation", () => {
  // AC: update() rejects a nonexistent featuredMediaId with BadRequestException
  // at the top of the method after slug/title checks, before creating a revision.

  it("throws BadRequestException when featuredMediaId references a nonexistent media record (site 2)", async () => {
    const page = {
      id: "page-1",
      title: "About",
      slug: "about",
      status: "draft",
      currentRevisionId: "rev-1",
      createdByUserId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date()
    } as StandalonePageEntity;
    const service = makePagesService(
      { findOne: async () => page },
      undefined,
      undefined,
      undefined,
      { findOne: async () => null } // media not found
    );
    await expect(
      service.update("page-1", "user-1", { featuredMediaId: "nonexistent-media-id" })
    ).rejects.toThrow(BadRequestException);
  });

  it("does not throw when featuredMediaId is null on update (no media check needed)", async () => {
    const page = {
      id: "page-1",
      title: "About",
      slug: "about",
      status: "draft",
      currentRevisionId: "rev-1",
      createdByUserId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date()
    } as StandalonePageEntity;
    const latestRevision = { id: "rev-1", pageId: "page-1", revisionNumber: 1, title: "About", body: "Body", authorUserId: "user-1", createdAt: new Date() } as PageRevisionEntity;
    const newRevision = { ...latestRevision, id: "rev-2", revisionNumber: 2 };
    const updatedPage = { ...page, currentRevisionId: "rev-2" } as StandalonePageEntity;
    const revSave = vi.fn().mockResolvedValue(newRevision);
    const service = makePagesService(
      { findOne: vi.fn().mockResolvedValueOnce(page).mockResolvedValueOnce(updatedPage), save: vi.fn().mockResolvedValue(updatedPage), create: (d) => d as StandalonePageEntity },
      { findOne: vi.fn().mockResolvedValue(latestRevision), save: revSave, create: (d) => d as PageRevisionEntity },
      undefined,
      undefined,
      { findOne: async () => null } // won't be called since featuredMediaId is null
    );
    await expect(
      service.update("page-1", "user-1", { featuredMediaId: null })
    ).resolves.toBeTruthy();
  });
});

describe("PagesService.restoreRevision — featuredMediaId validation", () => {
  // AC: restoreRevision() validates source.featuredMediaId before writing a new
  // revision. Throws BadRequestException when the referenced media no longer exists.

  it("throws BadRequestException when source revision featuredMediaId references a nonexistent media record (site 3)", async () => {
    const page = { id: "page-1", status: "draft", title: "About", currentRevisionId: "rev-2" } as StandalonePageEntity;
    const sourceRevision = {
      id: "rev-1",
      pageId: "page-1",
      title: "Old Title",
      body: "Old body",
      revisionNumber: 1,
      authorUserId: "u",
      featuredMediaId: "deleted-media-id", // media was deleted
      createdAt: new Date()
    } as PageRevisionEntity;
    const latestRevision = {
      id: "rev-2",
      pageId: "page-1",
      revisionNumber: 2,
      title: "Current",
      body: "Current body",
      authorUserId: "u",
      createdAt: new Date()
    } as PageRevisionEntity;

    const service = makePagesService(
      { findOne: async () => page },
      { findOne: vi.fn().mockResolvedValueOnce(sourceRevision).mockResolvedValueOnce(latestRevision) },
      undefined,
      undefined,
      { findOne: async () => null } // media not found
    );

    await expect(
      service.restoreRevision("page-1", "rev-1", "user-1")
    ).rejects.toThrow(BadRequestException);
  });

  it("succeeds when source revision has no featuredMediaId (no media check needed)", async () => {
    const page = { id: "page-1", status: "draft", title: "About", currentRevisionId: "rev-2" } as StandalonePageEntity;
    const sourceRevision = {
      id: "rev-1",
      pageId: "page-1",
      title: "Old Title",
      body: "Old body",
      revisionNumber: 1,
      authorUserId: "u",
      featuredMediaId: null, // no media id
      createdAt: new Date()
    } as PageRevisionEntity;
    const latestRevision = {
      id: "rev-2",
      pageId: "page-1",
      revisionNumber: 2,
      title: "Current",
      body: "Current body",
      authorUserId: "u",
      createdAt: new Date()
    } as PageRevisionEntity;
    const newRevision = { ...sourceRevision, id: "rev-3", revisionNumber: 3 };
    const updatedPage = { ...page, currentRevisionId: "rev-3", title: "Old Title" } as StandalonePageEntity;

    const service = makePagesService(
      { findOne: vi.fn().mockResolvedValue(updatedPage), save: vi.fn().mockResolvedValue(updatedPage), create: (d) => d as StandalonePageEntity },
      { findOne: vi.fn().mockResolvedValueOnce(sourceRevision).mockResolvedValueOnce(latestRevision), save: vi.fn().mockResolvedValue(newRevision), create: (d) => d as PageRevisionEntity },
      undefined,
      undefined,
      { findOne: async () => null } // won't be called since featuredMediaId is null
    );

    await expect(
      service.restoreRevision("page-1", "rev-1", "user-1")
    ).resolves.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Reserved slug enforcement (AC1 — security-sensitive: reserved slugs rejected)
// ---------------------------------------------------------------------------

describe("PagesService reserved slug enforcement", () => {
  // AC1: Reserved slugs must be rejected on create and update to prevent
  // standalone pages from shadowing existing application routes.

  it("rejects the 'admin' reserved slug on create", async () => {
    const service = makePagesService();
    await expect(service.create("user-1", { title: "Admin", slug: "admin", body: "Body" })).rejects.toThrow(
      BadRequestException
    );
  });

  it("rejects the 'blog' reserved slug on create", async () => {
    const service = makePagesService();
    await expect(service.create("user-1", { title: "Blog", slug: "blog", body: "Body" })).rejects.toThrow(
      BadRequestException
    );
  });

  it("rejects the 'api' reserved slug on create", async () => {
    const service = makePagesService();
    await expect(service.create("user-1", { title: "API", slug: "api", body: "Body" })).rejects.toThrow(
      BadRequestException
    );
  });

  it("rejects all documented reserved slugs on create", async () => {
    // AC1: full reserved list must all be rejected; 'pages' added in ms3-review-closeout NOTE 3
    const reserved = ["admin", "api", "app", "blog", "login", "pages", "register", "onboarding", "profile", "settings", "health"];
    const service = makePagesService();
    for (const slug of reserved) {
      await expect(
        service.create("user-1", { title: "T", slug, body: "Body" }),
        `Expected reserved slug "${slug}" to be rejected`
      ).rejects.toThrow(BadRequestException);
    }
  });

  it("rejects the 'pages' reserved slug on create", async () => {
    // AC: 'pages' is reserved to prevent a standalone page from shadowing the /pages Next.js route.
    const service = makePagesService();
    await expect(
      service.create("user-1", { title: "Pages", slug: "pages", body: "Body" })
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects the 'pages' reserved slug on update", async () => {
    // AC: renaming a standalone page to slug 'pages' must also be rejected.
    const page = {
      id: "page-1",
      title: "About",
      slug: "about",
      status: "draft",
      currentRevisionId: "rev-1",
      createdByUserId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date()
    } as StandalonePageEntity;
    const service = makePagesService({ findOne: async () => page });
    await expect(service.update("page-1", "user-1", { slug: "pages" })).rejects.toThrow(BadRequestException);
  });

  it("rejects a reserved slug on update", async () => {
    const page = {
      id: "page-1",
      title: "About",
      slug: "about",
      status: "draft",
      currentRevisionId: "rev-1",
      createdByUserId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date()
    } as StandalonePageEntity;
    const service = makePagesService({ findOne: async () => page });
    await expect(service.update("page-1", "user-1", { slug: "login" })).rejects.toThrow(BadRequestException);
  });

  it("accepts a non-reserved valid slug on create (positive baseline)", async () => {
    const savedRevision = { id: "rev-1", pageId: "page-1", revisionNumber: 1, title: "About", body: "Content", authorUserId: "u", createdAt: new Date() } as PageRevisionEntity;
    const savedPage = { id: "page-1", title: "About", slug: "about-us", status: "draft", currentRevisionId: "rev-1", createdByUserId: "u", publishedAt: null, createdAt: new Date(), updatedAt: new Date() } as StandalonePageEntity;
    const pageSaveFn = vi.fn().mockResolvedValue(savedPage);
    const pageOneFn = vi.fn().mockResolvedValue(savedPage);
    const revSaveFn = vi.fn().mockResolvedValue(savedRevision);
    const txPageRepo: MinimalRepository<StandalonePageEntity> = {
      find: async () => [], findOne: pageOneFn, create: (d) => d as StandalonePageEntity, save: pageSaveFn
    };
    const txRevisionRepo: MinimalRepository<PageRevisionEntity> = {
      find: async () => [], findOne: async () => null, create: (d) => d as PageRevisionEntity, save: revSaveFn
    };
    const service = makePagesService(
      { save: pageSaveFn, findOne: pageOneFn, create: (d) => d as StandalonePageEntity },
      { save: revSaveFn, create: (d) => d as PageRevisionEntity, findOne: async () => null },
      txPageRepo,
      txRevisionRepo
    );
    await expect(service.create("u", { title: "About", slug: "about-us", body: "Content" })).resolves.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Body sanitization enforcement (AC4 — security-sensitive: XSS prevention)
// ---------------------------------------------------------------------------

describe("PagesService body sanitization", () => {
  // AC4: Page bodies must be sanitized server-side; unsafe HTML/script content
  // must be rejected at the service layer before reaching the database.

  it("rejects a body containing a <script> tag on create", async () => {
    const service = makePagesService();
    await expect(
      service.create("user-1", { title: "T", slug: "about", body: '<script>alert("xss")</script>' })
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects a body containing an inline event handler (onclick=) on create", async () => {
    const service = makePagesService();
    await expect(
      service.create("user-1", { title: "T", slug: "about", body: '<a href="#" onclick="evil()">click</a>' })
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects a body containing javascript: protocol on create", async () => {
    const service = makePagesService();
    await expect(
      service.create("user-1", { title: "T", slug: "about", body: '<a href="javascript:void(0)">link</a>' })
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects a body containing <iframe> on create", async () => {
    const service = makePagesService();
    await expect(
      service.create("user-1", { title: "T", slug: "about", body: "<iframe src='evil.com'></iframe>" })
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects a body containing <script> on update", async () => {
    const page = {
      id: "page-1",
      title: "About",
      slug: "about",
      status: "draft",
      currentRevisionId: "rev-1",
      createdByUserId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date()
    } as StandalonePageEntity;
    const service = makePagesService({ findOne: async () => page });
    await expect(
      service.update("page-1", "user-1", { body: "<script>steal(document.cookie)</script>" })
    ).rejects.toThrow(BadRequestException);
  });

  it("accepts safe Markdown body on create (positive baseline)", async () => {
    const savedRevision = { id: "rev-1", pageId: "p-1", revisionNumber: 1, title: "T", body: "# Hello\nSafe content.", authorUserId: "u", createdAt: new Date() } as PageRevisionEntity;
    const savedPage = { id: "p-1", title: "T", slug: "safe-page", status: "draft", currentRevisionId: "rev-1", createdByUserId: "u", publishedAt: null, createdAt: new Date(), updatedAt: new Date() } as StandalonePageEntity;
    const pageSaveFn = vi.fn().mockResolvedValue(savedPage);
    const pageOneFn = vi.fn().mockResolvedValue(savedPage);
    const revSaveFn = vi.fn().mockResolvedValue(savedRevision);
    const txPageRepo: MinimalRepository<StandalonePageEntity> = {
      find: async () => [], findOne: pageOneFn, create: (d) => d as StandalonePageEntity, save: pageSaveFn
    };
    const txRevisionRepo: MinimalRepository<PageRevisionEntity> = {
      find: async () => [], findOne: async () => null, create: (d) => d as PageRevisionEntity, save: revSaveFn
    };
    const service = makePagesService(
      { save: pageSaveFn, findOne: pageOneFn, create: (d) => d as StandalonePageEntity },
      { save: revSaveFn, create: (d) => d as PageRevisionEntity, findOne: async () => null },
      txPageRepo,
      txRevisionRepo
    );
    await expect(service.create("u", { title: "T", slug: "safe-page", body: "# Hello\nSafe content." })).resolves.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Revision editor user tracking (AC3 — revision metadata)
// ---------------------------------------------------------------------------

describe("PagesService revision editorUserId tracking", () => {
  // AC3: Every edit must create a revision that records the editor user id.

  it("sets editorUserId on the revision created during update", async () => {
    const page = {
      id: "page-1",
      title: "About",
      slug: "about",
      status: "draft",
      currentRevisionId: "rev-1",
      createdByUserId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date()
    } as StandalonePageEntity;
    const latestRevision = { id: "rev-1", pageId: "page-1", revisionNumber: 1, title: "About", body: "Body", authorUserId: "user-1", createdAt: new Date() } as PageRevisionEntity;
    const newRevision = { ...latestRevision, id: "rev-2", revisionNumber: 2, editorUserId: "editor-1" };
    const updatedPage = { ...page, currentRevisionId: "rev-2" } as StandalonePageEntity;

    const revCreate = vi.fn().mockImplementation((d) => d as PageRevisionEntity);
    const revSave = vi.fn().mockResolvedValue(newRevision);

    const service = makePagesService(
      { findOne: vi.fn().mockResolvedValueOnce(page).mockResolvedValueOnce(updatedPage), save: vi.fn().mockResolvedValue(updatedPage), create: (d) => d as StandalonePageEntity },
      { findOne: vi.fn().mockResolvedValue(latestRevision), save: revSave, create: revCreate }
    );

    await service.update("page-1", "editor-1", { body: "New body" });

    // The revision entity created for the update must capture the editor user id.
    expect(revCreate).toHaveBeenCalledOnce();
    const created = revCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(created.editorUserId).toBe("editor-1");
  });

  it("sets editorUserId on the new revision created during restoreRevision", async () => {
    const page = { id: "page-1", status: "draft", title: "About", currentRevisionId: "rev-2" } as StandalonePageEntity;
    const sourceRevision = { id: "rev-1", pageId: "page-1", title: "Old Title", body: "Old body", revisionNumber: 1, authorUserId: "u", createdAt: new Date() } as PageRevisionEntity;
    const latestRevision = { id: "rev-2", pageId: "page-1", revisionNumber: 2, title: "Current", body: "Current body", authorUserId: "u", createdAt: new Date() } as PageRevisionEntity;

    const revCreate = vi.fn().mockImplementation((d) => d as PageRevisionEntity);
    const revSave = vi.fn().mockResolvedValue({ ...sourceRevision, id: "rev-3", revisionNumber: 3, editorUserId: "restorer-1" });
    const updatedPage = { ...page, currentRevisionId: "rev-3", title: "Old Title" } as StandalonePageEntity;

    const service = makePagesService(
      { findOne: vi.fn().mockResolvedValue(updatedPage), save: vi.fn().mockResolvedValue(updatedPage), create: (d) => d as StandalonePageEntity },
      { findOne: vi.fn().mockResolvedValueOnce(sourceRevision).mockResolvedValueOnce(latestRevision), save: revSave, create: revCreate }
    );

    await service.restoreRevision("page-1", "rev-1", "restorer-1");

    expect(revCreate).toHaveBeenCalledOnce();
    const created = revCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(created.editorUserId).toBe("restorer-1");
  });
});
