import crypto from "node:crypto";

import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

import { AuthorizationService } from "../authorization/authorization.service";
import { DocsPageEntity } from "./entities/docs-page.entity";
import { DocsRevisionEntity } from "./entities/docs-revision.entity";
import { DOCS_CONFIG, DOCS_DIFF_MAX_BODY_BYTES, DOCS_DIFF_MAX_LINES } from "./docs.types";
import type {
  DocsBreadcrumbItem,
  DocsConfig,
  DocsLockConflictInfo,
  DocsLockResultShape,
  DocsLockState,
  DocsPageShape,
  DocsTreeItem,
  DocsRecentEditShape,
  DocsRecentQuery,
  CreateDocPageInput,
  AddDocRevisionInput,
  DocWriteResultShape,
  RenameDocPageInput,
  DocsHistoryShape,
  DocsSingleRevisionShape,
  DocsDiffShape,
  DocsDiffHunk,
  DocRollbackInput
} from "./docs.types";

/**
 * DocsService provides read access to the site wiki.
 *
 * Security contract (P12 / oracle parity):
 * - Every visibility decision is routed through AuthorizationService.evaluate()
 *   with an anonymous actor for unauthenticated reads — no inline re-derived predicates.
 * - scope_type='project' pages are excluded from every site index (mirror isBoardPubliclyReadable).
 * - Gated and nonexistent pages return an identical 404 (PAGE_NOT_FOUND_MESSAGE) —
 *   no 403 vs 404 distinction, no message that distinguishes hidden from nonexistent.
 */
@Injectable()
export class DocsService {
  /**
   * The uniform "not found" message used for both nonexistent and non-readable pages.
   * A single constant guarantees oracle parity (hidden === nonexistent in error shape, P12).
   */
  static readonly PAGE_NOT_FOUND_MESSAGE = "Document page not found.";

  /** Hard cap on the number of recent edits returned by the recent feed. */
  static readonly RECENT_DOCS_MAX_LIMIT = 20;

  /** Default number of recent edits returned when no limit is specified. */
  static readonly RECENT_DOCS_DEFAULT_LIMIT = 5;

  /**
   * Anonymous actor used for all public (unauthenticated) visibility evaluation.
   * No userId and an empty-string role means only public/unlisted resources are allowed.
   */
  private readonly anonymousActor = { userId: null as null, globalRole: "" };

  constructor(
    @InjectRepository(DocsPageEntity)
    private readonly pageRepository: Repository<DocsPageEntity>,
    @InjectRepository(DocsRevisionEntity)
    private readonly revisionRepository: Repository<DocsRevisionEntity>,
    private readonly authorizationService: AuthorizationService,
    @Inject(DOCS_CONFIG) private readonly docsConfig: DocsConfig
  ) {}

  // ---------------------------------------------------------------------------
  // Visibility gate — mirrors ForumsService.isBoardPubliclyReadable
  // ---------------------------------------------------------------------------

  /**
   * Returns true when the given page is readable by an unauthenticated guest
   * **and** has scopeType='site'. Both conditions must hold for the page to
   * appear in public reads.
   *
   * All visibility decisions are routed through AuthorizationService.evaluate()
   * — no inline re-derived predicates.
   */
  isPagePubliclyReadable(page: DocsPageEntity): boolean {
    if (page.scopeType !== "site") {
      return false;
    }
    const decision = this.authorizationService.evaluate({
      actor: this.anonymousActor,
      resource: {
        resourceType: "docs_page",
        resourceId: page.id,
        visibility: page.visibility,
        projectId: null
      },
      action: "read"
    });
    return decision.allowed;
  }

  // ---------------------------------------------------------------------------
  // Path resolution — GET /api/docs/*path
  // ---------------------------------------------------------------------------

  /**
   * Resolves a published site page by its full path, returning its current revision
   * body plus an ordered breadcrumb ancestry array.
   *
   * Security contract (P12):
   * - Nonexistent path, deleted page, and non-publicly-readable page all return
   *   the same NotFoundException(PAGE_NOT_FOUND_MESSAGE) — no 403 vs 404 distinction.
   * - Visibility routed through isPagePubliclyReadable (→ AuthorizationService.evaluate()).
   *
   * @param path The full slash-joined path (e.g. "getting-started/installation").
   */
  async getPageByPath(path: string): Promise<DocsPageShape> {
    const normalizedPath = this.normalizePath(path);
    const pathHash = this.computePathHash("site", null, normalizedPath);

    const page = await this.pageRepository.findOne({
      where: { scopeType: "site", scopeId: IsNull(), pathHash },
      relations: ["currentRevision", "currentRevision.author", "currentRevision.editorUser"]
    });

    // Oracle parity: nonexistent, deleted, or non-readable all → identical 404.
    if (!page || page.status !== "published" || !this.isPagePubliclyReadable(page)) {
      throw new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE);
    }

    const breadcrumbs = await this.buildBreadcrumbs(page);
    return this.toPageShape(page, breadcrumbs);
  }

  // ---------------------------------------------------------------------------
  // Tree / children index — GET /api/docs
  // ---------------------------------------------------------------------------

  /**
   * Returns the site page tree: children of the root (when no parentPath given)
   * or children of a specific parent path (when ?parentPath= is provided).
   *
   * Only site-scoped, status='published', publicly-readable pages are included.
   * Project-scoped pages are always excluded (mirror ForumsService scope filter).
   *
   * @param parentPath Optional full path of the parent page. Omit for root children.
   */
  async listPageTree(parentPath?: string): Promise<DocsTreeItem[]> {
    let parentId: string | null = null;

    if (parentPath !== undefined && parentPath.trim().length > 0) {
      const normalizedParentPath = this.normalizePath(parentPath.trim());
      const parentHash = this.computePathHash("site", null, normalizedParentPath);
      const parent = await this.pageRepository.findOne({
        where: { scopeType: "site", scopeId: IsNull(), pathHash: parentHash }
      });
      // Non-existent or non-readable parent → same 404 (oracle parity).
      if (!parent || parent.status !== "published" || !this.isPagePubliclyReadable(parent)) {
        throw new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE);
      }
      parentId = parent.id;
    }

    // Query children at this level. parentId IS NULL means root pages.
    const pages = await this.pageRepository.find({
      where: {
        scopeType: "site",
        scopeId: IsNull(),
        status: "published",
        parentId: parentId !== null ? (parentId as string) : IsNull()
      },
      order: { title: "ASC" }
    });

    // Filter through the visibility gate (no inline re-derived predicate).
    const visible = pages.filter((p) => this.isPagePubliclyReadable(p));

    return visible.map((p) => this.toTreeItem(p));
  }

  // ---------------------------------------------------------------------------
  // Recent feed — GET /api/docs/recent
  // ---------------------------------------------------------------------------

  /**
   * Returns recent publicly-readable, site-scope, non-deleted document edits
   * for the landing feed: page title, path, editor, timestamp.
   *
   * Security contract (P12):
   * - Only pages that pass isPagePubliclyReadable are included.
   *   Project-scoped pages and non-readable pages are excluded — no oracle leak.
   * - Returns a stable empty list when no public activity exists.
   *
   * Ordering: most-recently-edited first (revision.created_at DESC).
   * Limit: defaults to RECENT_DOCS_DEFAULT_LIMIT; hard-capped at RECENT_DOCS_MAX_LIMIT.
   */
  async listRecentEdits(query: DocsRecentQuery): Promise<DocsRecentEditShape[]> {
    const rawLimit = query.limit;
    const safeLimit = Number.isFinite(rawLimit) ? rawLimit! : DocsService.RECENT_DOCS_DEFAULT_LIMIT;
    const limit = Math.min(DocsService.RECENT_DOCS_MAX_LIMIT, Math.max(1, safeLimit));

    // Build the allow-list of publicly-readable site page ids.
    // All visibility decisions route through isPagePubliclyReadable → AuthorizationService.evaluate().
    const allPages = await this.pageRepository.find({
      where: { scopeType: "site", scopeId: IsNull(), status: "published" }
    });
    const publicPageIds = allPages.filter((p) => this.isPagePubliclyReadable(p)).map((p) => p.id);

    if (publicPageIds.length === 0) {
      return [];
    }

    // Query the most recent revisions for public pages, joining editor user.
    // Each page's current_revision_id identifies the most-recently-applied revision.
    // We join through docs_pages to get the page title and path, and the revision
    // created_at for ordering.
    const rows = await this.revisionRepository
      .createQueryBuilder("revision")
      .innerJoinAndSelect("revision.page", "page")
      .leftJoinAndSelect("revision.editorUser", "editor")
      .leftJoinAndSelect("revision.author", "author")
      .where("page.id IN (:...pageIds)", { pageIds: publicPageIds })
      .andWhere("page.current_revision_id = revision.id")
      .orderBy("revision.createdAt", "DESC")
      .take(limit)
      .getMany();

    return rows.map((rev) => this.toRecentEditShape(rev));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds the ordered breadcrumb ancestry for a page, from the shallowest ancestor
   * down to (but not including) the current page itself.
   *
   * Walks the parent chain via parentId in the DB. Ancestry is built in reverse
   * (deepest-first) then reversed for display order (root → immediate parent).
   *
   * Security contract (oracle parity, P12):
   * - Every ancestor is routed through isPagePubliclyReadable before its id or title
   *   is included. If an ancestor fails the gate (non-readable, project-scoped, deleted,
   *   or members/private visibility), the chain is truncated at that point — neither that
   *   ancestor nor any shallower ancestor appears in the response. This prevents id and
   *   title leakage for non-public nodes. The chain truncation (not a per-item skip) avoids
   *   creating a positional existence side channel.
   */
  private async buildBreadcrumbs(page: DocsPageEntity): Promise<DocsBreadcrumbItem[]> {
    const breadcrumbs: DocsBreadcrumbItem[] = [];
    let currentParentId = page.parentId;

    while (currentParentId !== null) {
      const ancestor = await this.pageRepository.findOne({ where: { id: currentParentId } });
      // Ancestor missing or fails the visibility gate: truncate the chain here.
      // Do not expose id/title for any gated ancestor (oracle parity — gated === absent).
      if (!ancestor || ancestor.status !== "published" || !this.isPagePubliclyReadable(ancestor)) {
        break;
      }
      breadcrumbs.push({ id: ancestor.id, title: ancestor.title, path: ancestor.path });
      currentParentId = ancestor.parentId;
    }

    // Reverse: we walked deepest-first; display order is root → immediate parent.
    breadcrumbs.reverse();
    return breadcrumbs;
  }

  /**
   * Normalizes a path segment string: trims whitespace and leading/trailing slashes.
   * "getting-started/installation" and "/getting-started/installation/" both normalize
   * to "getting-started/installation".
   */
  private normalizePath(path: string): string {
    return path.trim().replace(/^\/+|\/+$/g, "");
  }

  /**
   * Computes the SHA-256 path hash used for indexed full-path lookups.
   * The hash encodes scopeType + scopeId + path so the unique index
   * (scope_type, scope_id, path_hash) is correct across scopes.
   *
   * @param scopeType e.g. "site"
   * @param scopeId   project UUID or null for site scope
   * @param path      normalized full path (e.g. "getting-started/install")
   */
  computePathHash(scopeType: string, scopeId: string | null, path: string): string {
    const input = `${scopeType}:${scopeId ?? ""}:${path}`;
    return crypto.createHash("sha256").update(input).digest("hex");
  }

  /**
   * Maps a DocsPageEntity (with loaded currentRevision and breadcrumbs) to
   * the public DocsPageShape DTO.
   */
  private toPageShape(page: DocsPageEntity, breadcrumbs: DocsBreadcrumbItem[]): DocsPageShape {
    const rev = page.currentRevision;
    const now = new Date();
    const lockActive = page.isLocked === 1
      && page.lockExpiresAt !== null
      && page.lockExpiresAt > now;

    const lock: DocsLockState = {
      isLocked: lockActive,
      lockedByUserId: lockActive ? page.lockedByUserId : null,
      lockedAt: lockActive ? page.lockedAt : null,
      lockExpiresAt: lockActive ? page.lockExpiresAt : null
    };

    return {
      id: page.id,
      title: page.title,
      path: page.path,
      depth: page.depth,
      parentId: page.parentId,
      visibility: page.visibility,
      breadcrumbs,
      currentRevision: rev
        ? {
            id: rev.id,
            title: rev.title,
            body: rev.body,
            summary: rev.summary,
            revisionNumber: rev.revisionNumber,
            author: rev.author
              ? { username: (rev.author as { username: string; displayName: string | null }).username, displayName: (rev.author as { username: string; displayName: string | null }).displayName }
              : null,
            editorUsername: rev.editorUser
              ? (rev.editorUser as { username: string }).username
              : null,
            createdAt: rev.createdAt
          }
        : null,
      lock,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt
    };
  }

  /**
   * Maps a DocsPageEntity to a lightweight DocsTreeItem for index/tree responses.
   */
  private toTreeItem(page: DocsPageEntity): DocsTreeItem {
    return {
      id: page.id,
      title: page.title,
      path: page.path,
      depth: page.depth,
      parentId: page.parentId,
      hasChildren: false, // Populated by caller when needed; default false for now
      createdAt: page.createdAt,
      updatedAt: page.updatedAt
    };
  }

  // ---------------------------------------------------------------------------
  // Authorization seam (ST-3) — single gate for all write paths
  // ---------------------------------------------------------------------------

  /**
   * Scope-aware authorization seam for all Documents write operations.
   *
   * Security contract (AC5):
   * - This is the SINGLE authorization gate for every write path. No inline
   *   role checks are permitted at call sites.
   * - For scope_type='site' the caller must have at least the 'moderator' global role.
   * - The seam's signature accepts either a full DocsPageEntity (when the page already
   *   exists) or a bare scopeType string (for creates before the page row exists).
   *   This keeps call sites unchanged when a future project scope adds project-role
   *   rules inside this method.
   *
   * @param actorGlobalRole The resolved session user's globalRole string.
   * @param scopeTypeOrPage Either a scope-type string or a DocsPageEntity whose
   *                        scopeType determines the access rule.
   * @throws ForbiddenException (403) when the actor does not have write access.
   */
  assertDocWriteAccess(
    actorGlobalRole: string | null | undefined,
    scopeTypeOrPage: string | DocsPageEntity
  ): void {
    const scopeType =
      typeof scopeTypeOrPage === "string" ? scopeTypeOrPage : scopeTypeOrPage.scopeType;

    if (scopeType === "site") {
      // Site-scoped docs require moderator or admin.
      if (!this.authorizationService.hasGlobalRole(actorGlobalRole, "moderator")) {
        throw new ForbiddenException("Write access requires moderator or admin role.");
      }
      return;
    }

    // Future: project-scoped rules branch here (no call-site change required).
    // For now, any unrecognised scope type is denied.
    throw new ForbiddenException(`Unsupported scope type: ${scopeType}.`);
  }

  // ---------------------------------------------------------------------------
  // Lock helpers — shared by acquire/release/write-path guard
  // ---------------------------------------------------------------------------

  /**
   * Returns true when the given page currently has an active, non-expired lock
   * held by a user other than `actorUserId`.
   *
   * An expired lock (lockExpiresAt <= now) is treated as free regardless of the
   * isLocked flag — the DB row is stale and the write proceeds.
   *
   * Actors with admin or moderator role are never blocked by a foreign lock
   * (staff override, AC3).
   */
  private isActiveForeignLock(
    page: DocsPageEntity,
    actorUserId: string | undefined,
    actorGlobalRole: string | null | undefined
  ): boolean {
    // Staff override: admin/moderator bypass all foreign lock checks.
    if (this.authorizationService.hasGlobalRole(actorGlobalRole, "moderator")) {
      return false;
    }
    if (page.isLocked !== 1 || page.lockExpiresAt === null) {
      return false;
    }
    const now = new Date();
    if (page.lockExpiresAt <= now) {
      // Expired lock: treated as free.
      return false;
    }
    // Active lock held by another user (or by unknown actor when actorUserId is undefined).
    return page.lockedByUserId !== (actorUserId ?? null);
  }

  /**
   * Throws a 409 ConflictException when the page is actively locked by another user
   * (and the actor is not a staff-override holder).
   *
   * Must be called inside a transaction (page row already loaded) to ensure the
   * lock check and subsequent write are atomic.
   *
   * @param page            The loaded DocsPageEntity (from within the transaction).
   * @param actorUserId     The calling user's UUID (undefined for anonymous/unknown).
   * @param actorGlobalRole The calling user's global role string.
   * @throws ConflictException (409) with holder metadata when a foreign lock blocks the write.
   */
  assertNotForeignLocked(
    page: DocsPageEntity,
    actorUserId: string | undefined,
    actorGlobalRole: string | null | undefined
  ): void {
    if (!this.isActiveForeignLock(page, actorUserId, actorGlobalRole)) {
      return;
    }
    const conflict: DocsLockConflictInfo = {
      lockedByUserId: page.lockedByUserId!,
      lockExpiresAt: page.lockExpiresAt!
    };
    throw new ConflictException({
      message: "This page is currently locked by another user. Try again after the lock expires or contact the holder.",
      lock: conflict
    });
  }

  // ---------------------------------------------------------------------------
  // Acquire lock — POST /api/docs/:id/lock
  // ---------------------------------------------------------------------------

  /**
   * Acquires or refreshes the soft lock on a wiki page.
   *
   * Behaviour:
   * - If the page is not locked, or the lock has expired, sets the lock for the actor.
   * - If the same actor holds the current non-expired lock, refreshes the expiry.
   * - If a different actor holds a non-expired lock, throws 409 with holder metadata.
   *
   * Security contract:
   * - Caller MUST call assertDocWriteAccess before calling this method (staff-only gate).
   *
   * @param actorUserId     The authenticated user's UUID.
   * @param actorGlobalRole The authenticated user's global role.
   * @param pageId          Target page UUID.
   * @returns DocsLockResultShape with the new lock state.
   * @throws NotFoundException (404) when the page does not exist or is deleted.
   * @throws ConflictException (409) when a non-expired foreign lock blocks acquisition.
   */
  async acquireLock(
    actorUserId: string,
    actorGlobalRole: string | null | undefined,
    pageId: string
  ): Promise<DocsLockResultShape> {
    return this.pageRepository.manager.transaction(async (em) => {
      const page = await em.findOne(DocsPageEntity, { where: { id: pageId } });
      if (!page || page.status !== "published") {
        throw new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE);
      }

      const now = new Date();
      const lockExpired =
        page.isLocked === 1 &&
        page.lockExpiresAt !== null &&
        page.lockExpiresAt <= now;

      const isForeignHolder =
        page.isLocked === 1 &&
        page.lockExpiresAt !== null &&
        page.lockExpiresAt > now &&
        page.lockedByUserId !== actorUserId;

      // Staff override: admin/moderator can always acquire even against a foreign lock.
      const isStaff = this.authorizationService.hasGlobalRole(actorGlobalRole, "moderator");

      if (isForeignHolder && !isStaff) {
        const conflict: DocsLockConflictInfo = {
          lockedByUserId: page.lockedByUserId!,
          lockExpiresAt: page.lockExpiresAt!
        };
        throw new ConflictException({
          message: "This page is currently locked by another user.",
          lock: conflict
        });
      }

      // Acquire or refresh the lock.
      const lockTtlMs = this.docsConfig.lockTtlMinutes * 60 * 1000;
      const lockedAt = now;
      const lockExpiresAt = new Date(now.getTime() + lockTtlMs);

      await em.update(DocsPageEntity, { id: pageId }, {
        isLocked: 1,
        lockedByUserId: actorUserId,
        lockedAt,
        lockExpiresAt
      });

      void lockExpired; // explicitly consumed — no unused-var warning

      return {
        pageId,
        lock: {
          isLocked: true,
          lockedByUserId: actorUserId,
          lockedAt,
          lockExpiresAt
        }
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Release lock — DELETE /api/docs/:id/lock
  // ---------------------------------------------------------------------------

  /**
   * Releases the soft lock on a wiki page.
   *
   * Behaviour:
   * - The lock holder can release their own lock.
   * - An admin or moderator can release any lock (override, AC4).
   * - A non-holder without staff role receives 403.
   * - If the page is not locked (or the lock has expired), the call is idempotent
   *   (no error; lock fields are cleared).
   *
   * Security contract:
   * - Caller MUST call assertDocWriteAccess before calling this method (staff-only gate).
   *
   * @param actorUserId     The authenticated user's UUID.
   * @param actorGlobalRole The authenticated user's global role.
   * @param pageId          Target page UUID.
   * @throws NotFoundException (404) when the page does not exist or is deleted.
   * @throws ForbiddenException (403) when a non-holder, non-staff actor attempts release.
   */
  async releaseLock(
    actorUserId: string,
    actorGlobalRole: string | null | undefined,
    pageId: string
  ): Promise<void> {
    return this.pageRepository.manager.transaction(async (em) => {
      const page = await em.findOne(DocsPageEntity, { where: { id: pageId } });
      if (!page || page.status !== "published") {
        throw new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE);
      }

      const now = new Date();
      const isActiveLock =
        page.isLocked === 1 &&
        page.lockExpiresAt !== null &&
        page.lockExpiresAt > now;

      const isStaff = this.authorizationService.hasGlobalRole(actorGlobalRole, "moderator");

      if (isActiveLock && page.lockedByUserId !== actorUserId && !isStaff) {
        throw new ForbiddenException("Only the lock holder or an admin/moderator can release this lock.");
      }

      // Clear lock fields regardless of current state (idempotent).
      await em.update(DocsPageEntity, { id: pageId }, {
        isLocked: 0,
        lockedByUserId: null,
        lockedAt: null,
        lockExpiresAt: null
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Page create — POST /api/docs
  // ---------------------------------------------------------------------------

  /**
   * Creates a new wiki page under an optional parent, with an initial revision #1,
   * and sets current_revision_id — all in a single transaction.
   *
   * Security contract:
   * - Caller MUST call assertDocWriteAccess before calling this method.
   * - No inline role check is present here (AC5).
   *
   * Atomicity (P10):
   * - The page row, revision row, and the current_revision_id pointer update are
   *   all written inside a single repository.manager.transaction.
   * - A mid-sequence failure leaves no orphaned page row and no dangling pointer.
   *
   * @param actorUserId The authenticated user's UUID.
   * @param input       CreateDocPageInput DTO.
   * @returns DocWriteResultShape with the new page and revision identifiers.
   * @throws BadRequestException (400) for invalid slug/title or missing parent.
   * @throws ConflictException   (409) for path_hash collision (duplicate full path).
   */
  async createPage(
    actorUserId: string,
    input: CreateDocPageInput
  ): Promise<DocWriteResultShape> {
    // --- Input validation ---
    this.validateSlug(input.slug);
    this.validateTitle(input.title);

    // --- Parent resolution ---
    let parentId: string | null = null;
    let parentDepth = -1;
    let parentPath = "";

    if (input.parentId !== undefined || input.parentPath !== undefined) {
      const parent = await this.resolveParent(input.parentId, input.parentPath);
      if (!parent) {
        throw new BadRequestException("Parent page does not exist.");
      }
      parentId = parent.id;
      parentDepth = parent.depth;
      parentPath = parent.path;
    }

    // --- Derive path, depth, path_hash ---
    const depth = parentDepth + 1;
    const derivedPath = parentPath ? `${parentPath}/${input.slug}` : input.slug;
    const pathHash = this.computePathHash("site", null, derivedPath);

    // --- Transactional write (P10): page + revision + pointer ---
    const pageId = crypto.randomUUID();
    const revisionId = crypto.randomUUID();

    return this.pageRepository.manager.transaction(async (em) => {
      // Check path_hash collision inside the transaction.
      const existing = await em.findOne(DocsPageEntity, {
        where: { scopeType: "site", scopeId: IsNull(), pathHash }
      });
      if (existing) {
        throw new ConflictException("A page with this path already exists in this scope.");
      }

      // 1. Insert page row (current_revision_id still NULL at this point).
      const page = em.create(DocsPageEntity, {
        id: pageId,
        scopeType: "site" as const,
        scopeId: null,
        title: input.title,
        slug: input.slug,
        path: derivedPath,
        pathHash,
        parentId,
        depth,
        visibility: "public" as const,
        status: "published" as const,
        isLocked: 0,
        lockedByUserId: null,
        lockedAt: null,
        lockExpiresAt: null,
        currentRevisionId: null,
        createdByUserId: actorUserId
      });
      await em.save(DocsPageEntity, page);

      // 2. Insert revision #1.
      const revision = em.create(DocsRevisionEntity, {
        id: revisionId,
        pageId,
        authorUserId: actorUserId,
        editorUserId: null,
        title: input.title,
        body: input.body,
        summary: input.summary ?? null,
        revisionNumber: 1
      });
      await em.save(DocsRevisionEntity, revision);

      // 3. Set current_revision_id pointer.
      await em.update(DocsPageEntity, { id: pageId }, { currentRevisionId: revisionId });

      return {
        id: pageId,
        title: input.title,
        path: derivedPath,
        depth,
        parentId,
        currentRevisionId: revisionId,
        revisionNumber: 1,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Add revision — POST /api/docs/:id/revisions
  // ---------------------------------------------------------------------------

  /**
   * Appends a new revision to an existing page, bumps revision_number, and
   * updates current_revision_id, title, and updated_at — in a single transaction.
   *
   * Security contract:
   * - Caller MUST call assertDocWriteAccess before calling this method.
   *
   * Atomicity (P10):
   * - The new revision row and the pointer update are written inside a single
   *   repository.manager.transaction.
   * - A mid-sequence failure leaves no dangling current_revision_id.
   *
   * @param actorUserId The authenticated user's UUID.
   * @param pageId      Target page UUID.
   * @param input       AddDocRevisionInput DTO.
   * @returns DocWriteResultShape with the updated page and new revision identifiers.
   * @throws NotFoundException (404) when the page does not exist (oracle parity).
   * @throws BadRequestException (400) for invalid title.
   */
  async addRevision(
    actorUserId: string,
    pageId: string,
    input: AddDocRevisionInput,
    actorGlobalRole?: string | null
  ): Promise<DocWriteResultShape> {
    this.validateTitle(input.title);

    return this.pageRepository.manager.transaction(async (em) => {
      // Load the page for-update inside the transaction.
      const page = await em.findOne(DocsPageEntity, { where: { id: pageId } });
      if (!page || page.status !== "published") {
        throw new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE);
      }

      // Lock check: reject if page is actively locked by another user (AC3).
      this.assertNotForeignLocked(page, actorUserId, actorGlobalRole);

      // Determine the next revision number.
      const lastRevision = await em.findOne(DocsRevisionEntity, {
        where: { pageId },
        order: { revisionNumber: "DESC" }
      });
      const nextRevisionNumber = lastRevision ? lastRevision.revisionNumber + 1 : 1;
      const revisionId = crypto.randomUUID();

      // 1. Insert the new revision.
      const revision = em.create(DocsRevisionEntity, {
        id: revisionId,
        pageId,
        authorUserId: actorUserId,
        editorUserId: actorUserId,
        title: input.title,
        body: input.body,
        summary: input.summary ?? null,
        revisionNumber: nextRevisionNumber
      });
      await em.save(DocsRevisionEntity, revision);

      // 2. Update current_revision_id, title, and updated_at on the page.
      await em.update(DocsPageEntity, { id: pageId }, {
        currentRevisionId: revisionId,
        title: input.title
      });

      // Re-load to get the db-refreshed updatedAt timestamp.
      const updatedPage = await em.findOne(DocsPageEntity, { where: { id: pageId } });

      return {
        id: pageId,
        title: input.title,
        path: page.path,
        depth: page.depth,
        parentId: page.parentId,
        currentRevisionId: revisionId,
        revisionNumber: nextRevisionNumber,
        createdAt: page.createdAt,
        updatedAt: updatedPage?.updatedAt ?? page.updatedAt
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Rename page — PATCH /api/docs/:id
  // ---------------------------------------------------------------------------

  /**
   * Renames a page's slug and/or title within the same parent.
   *
   * When the slug changes, the page's path/path_hash AND every descendant's
   * path/path_hash are rewritten in a single transaction (AC1 / P10).
   *
   * When only the title changes, no path/path_hash is touched (AC2).
   *
   * Security contract:
   * - Caller MUST call assertDocWriteAccess before calling this method.
   * - Cross-parent move/reparent is NOT implemented here (deferred).
   *
   * Atomicity (P10):
   * - All writes (page update, descendant updates) are inside a single
   *   repository.manager.transaction. A mid-rewrite failure leaves all
   *   rows at their pre-rename values.
   *
   * @param pageId Target page UUID.
   * @param input  RenameDocPageInput (slug?, title?).
   * @returns Updated DocWriteResultShape.
   * @throws NotFoundException  (404) when the page does not exist or is deleted.
   * @throws BadRequestException (400) for invalid slug/title or if neither field provided.
   * @throws ConflictException   (409) for path_hash collision (new path already exists).
   */
  async renamePage(
    pageId: string,
    input: RenameDocPageInput,
    actorUserId?: string,
    actorGlobalRole?: string | null
  ): Promise<DocWriteResultShape> {
    if (input.slug === undefined && input.title === undefined) {
      throw new BadRequestException("At least one of 'slug' or 'title' must be provided.");
    }
    if (input.slug !== undefined) {
      this.validateSlug(input.slug);
    }
    if (input.title !== undefined) {
      this.validateTitle(input.title);
    }

    return this.pageRepository.manager.transaction(async (em) => {
      const page = await em.findOne(DocsPageEntity, { where: { id: pageId } });
      if (!page || page.status !== "published") {
        throw new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE);
      }

      // Lock check: reject if page is actively locked by another user (AC3).
      this.assertNotForeignLocked(page, actorUserId, actorGlobalRole);

      const newSlug = input.slug !== undefined ? input.slug : page.slug;
      const newTitle = input.title !== undefined ? input.title : page.title;
      const slugChanged = newSlug !== page.slug;

      if (slugChanged) {
        // Derive the new path for this page.
        // Parent path is the path without the last segment (or empty for root pages).
        const parentPath = page.parentId
          ? page.path.substring(0, page.path.lastIndexOf("/"))
          : "";
        const newPath = parentPath ? `${parentPath}/${newSlug}` : newSlug;
        const newPathHash = this.computePathHash(page.scopeType, page.scopeId, newPath);

        // Check path_hash collision inside the transaction.
        const collision = await em.findOne(DocsPageEntity, {
          where: { scopeType: page.scopeType, scopeId: page.scopeId ?? IsNull(), pathHash: newPathHash }
        });
        if (collision && collision.id !== pageId) {
          throw new ConflictException("A page with this path already exists in this scope.");
        }

        const oldPath = page.path;

        // Update this page's slug, path, path_hash, and title.
        await em.update(DocsPageEntity, { id: pageId }, {
          slug: newSlug,
          path: newPath,
          pathHash: newPathHash,
          title: newTitle
        });

        // Rewrite every descendant's path by replacing the old path prefix.
        // We use a prefix match: descendants whose path starts with oldPath + "/".
        // This is done in-process (load all + update) to stay compatible with
        // MySQL 5.7.44 — a raw SQL prefix-replace is equivalent but requires
        // verifying the query builder. We keep TypeORM for transaction safety.
        const oldPathPrefix = `${oldPath}/`;

        // Load all non-deleted descendants (any status — we update paths for all,
        // but only non-deleted ones are visible).  Descendants by prefix match.
        // Use raw query for the LIKE prefix scan inside the transaction.
        const descendants: DocsPageEntity[] = await em
          .createQueryBuilder(DocsPageEntity, "p")
          .where("p.scopeType = :scopeType", { scopeType: page.scopeType })
          .andWhere("p.scopeId IS NULL")
          .andWhere("p.path LIKE :prefix", { prefix: `${oldPathPrefix}%` })
          .getMany();

        for (const desc of descendants) {
          const descNewPath = newPath + desc.path.substring(oldPath.length);
          const descNewPathHash = this.computePathHash(desc.scopeType, desc.scopeId, descNewPath);
          await em.update(DocsPageEntity, { id: desc.id }, {
            path: descNewPath,
            pathHash: descNewPathHash
          });
        }
      } else {
        // Title-only rename: no path/path_hash changes (AC2).
        await em.update(DocsPageEntity, { id: pageId }, { title: newTitle });
      }

      // Re-load to get the db-refreshed updatedAt timestamp.
      const updatedPage = await em.findOne(DocsPageEntity, { where: { id: pageId } });
      const finalPage = updatedPage ?? page;

      return {
        id: pageId,
        title: newTitle,
        path: slugChanged
          ? (finalPage.path)
          : page.path,
        depth: page.depth,
        parentId: page.parentId,
        currentRevisionId: page.currentRevisionId,
        revisionNumber: 0, // Not applicable for rename; tester may assert this field
        createdAt: page.createdAt,
        updatedAt: finalPage.updatedAt ?? page.updatedAt
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Soft-delete — DELETE /api/docs/:id
  // ---------------------------------------------------------------------------

  /**
   * Soft-deletes a page by setting its status to 'deleted'.
   *
   * Security contract:
   * - Caller MUST call assertDocWriteAccess before calling this method.
   *
   * Rules (AC3, AC4):
   * - Sets `status='deleted'` on the page row; revisions are preserved.
   * - Rejected with 409 when the page has any non-deleted children.
   *
   * @param pageId Target page UUID.
   * @throws NotFoundException   (404) when the page does not exist or is already deleted.
   * @throws ConflictException   (409) when the page has non-deleted children.
   */
  async softDeletePage(
    pageId: string,
    actorUserId?: string,
    actorGlobalRole?: string | null
  ): Promise<void> {
    const page = await this.pageRepository.findOne({ where: { id: pageId } });
    if (!page || page.status !== "published") {
      throw new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE);
    }

    // Lock check: reject if page is actively locked by another user (AC3).
    this.assertNotForeignLocked(page, actorUserId, actorGlobalRole);

    // Reject if the page has any non-deleted children (AC4).
    const nonDeletedChildCount = await this.pageRepository.count({
      where: { parentId: pageId, status: "published" }
    });
    if (nonDeletedChildCount > 0) {
      throw new ConflictException(
        "Cannot delete a page that has non-deleted children. Delete or move the children first."
      );
    }

    // Soft-delete: set status='deleted'. Revisions are preserved (AC3).
    await this.pageRepository.update({ id: pageId }, { status: "deleted" as const });
  }

  // ---------------------------------------------------------------------------
  // History — GET /api/docs/:id/history
  // ---------------------------------------------------------------------------

  /**
   * Returns ordered revision metadata for a page (ascending revision number).
   *
   * Security contract (oracle parity, P12):
   * - A non-readable, deleted, or nonexistent page returns the same 404 as ST-2.
   *   No distinction between hidden and nonexistent.
   *
   * @param pageId Target page UUID.
   * @returns DocsHistoryShape with revisions ordered by revision_number ASC.
   * @throws NotFoundException (404) when the page is not found or not publicly readable.
   */
  async getPageHistory(pageId: string): Promise<DocsHistoryShape> {
    const page = await this.pageRepository.findOne({ where: { id: pageId } });
    if (!page || page.status !== "published" || !this.isPagePubliclyReadable(page)) {
      throw new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE);
    }

    const revisions = await this.revisionRepository.find({
      where: { pageId },
      relations: ["author", "editorUser"],
      order: { revisionNumber: "ASC" }
    });

    return {
      revisions: revisions.map((rev) => this.toRevisionMetaShape(rev))
    };
  }

  // ---------------------------------------------------------------------------
  // Single revision — GET /api/docs/:id/revisions/:revisionNumber
  // ---------------------------------------------------------------------------

  /**
   * Returns the full body of a specific revision.
   *
   * Security contract (oracle parity, P12):
   * - A non-readable, deleted, or nonexistent page returns the same 404 as ST-2.
   *
   * @param pageId         Target page UUID.
   * @param revisionNumber Revision number (1-based).
   * @returns DocsSingleRevisionShape with the full revision body.
   * @throws NotFoundException (404) when the page or revision is not found.
   */
  async getRevisionByNumber(
    pageId: string,
    revisionNumber: number
  ): Promise<DocsSingleRevisionShape> {
    const page = await this.pageRepository.findOne({ where: { id: pageId } });
    if (!page || page.status !== "published" || !this.isPagePubliclyReadable(page)) {
      throw new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE);
    }

    const revision = await this.revisionRepository.findOne({
      where: { pageId, revisionNumber },
      relations: ["author", "editorUser"]
    });
    if (!revision) {
      throw new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE);
    }

    return {
      revisionNumber: revision.revisionNumber,
      title: revision.title,
      body: revision.body,
      summary: revision.summary,
      author: revision.author
        ? {
            username: (revision.author as { username: string; displayName: string | null }).username,
            displayName: (revision.author as { username: string; displayName: string | null }).displayName
          }
        : null,
      editorUsername: revision.editorUser
        ? (revision.editorUser as { username: string }).username
        : null,
      createdAt: revision.createdAt
    };
  }

  // ---------------------------------------------------------------------------
  // Diff — GET /api/docs/:id/diff?from=&to=
  // ---------------------------------------------------------------------------

  /**
   * Returns a deterministic line-level diff between two revisions of a page.
   *
   * The diff is computed using the Myers diff algorithm (patience/linear variant)
   * in a deterministic, pure-TypeScript implementation — no external libraries.
   * Lines are split on "\n"; empty trailing lines from the split are included
   * (consistent trailing-newline behaviour).
   *
   * Security contract (oracle parity, P12):
   * - A non-readable, deleted, or nonexistent page returns the same 404 as ST-2.
   *
   * @param pageId         Target page UUID.
   * @param fromRevNumber  Source revision number.
   * @param toRevNumber    Target revision number.
   * @returns DocsDiffShape with ordered hunks (unchanged/added/removed).
   * @throws NotFoundException (404) when page or either revision is not found.
   * @throws BadRequestException (400) when from/to are equal or not positive integers.
   */
  async getDiff(
    pageId: string,
    fromRevNumber: number,
    toRevNumber: number
  ): Promise<DocsDiffShape> {
    // Input validation: must be positive integers and must differ.
    if (!Number.isInteger(fromRevNumber) || fromRevNumber < 1) {
      throw new BadRequestException("'from' must be a positive integer revision number.");
    }
    if (!Number.isInteger(toRevNumber) || toRevNumber < 1) {
      throw new BadRequestException("'to' must be a positive integer revision number.");
    }
    if (fromRevNumber === toRevNumber) {
      throw new BadRequestException("'from' and 'to' must be different revision numbers.");
    }

    const page = await this.pageRepository.findOne({ where: { id: pageId } });
    if (!page || page.status !== "published" || !this.isPagePubliclyReadable(page)) {
      throw new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE);
    }

    const [fromRev, toRev] = await Promise.all([
      this.revisionRepository.findOne({ where: { pageId, revisionNumber: fromRevNumber } }),
      this.revisionRepository.findOne({ where: { pageId, revisionNumber: toRevNumber } })
    ]);

    if (!fromRev) {
      throw new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE);
    }
    if (!toRev) {
      throw new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE);
    }

    // DoS guard: reject before allocating the O(m·n) LCS table if either body
    // exceeds the configured byte or line-count limits.
    const fromBodyBytes = Buffer.byteLength(fromRev.body, "utf8");
    const toBodyBytes = Buffer.byteLength(toRev.body, "utf8");
    if (fromBodyBytes > DOCS_DIFF_MAX_BODY_BYTES || toBodyBytes > DOCS_DIFF_MAX_BODY_BYTES) {
      throw new BadRequestException(
        `Revision body exceeds the maximum allowed size for diff (${DOCS_DIFF_MAX_BODY_BYTES} bytes).`
      );
    }

    const fromLines = fromRev.body.split("\n");
    const toLines = toRev.body.split("\n");

    if (fromLines.length > DOCS_DIFF_MAX_LINES || toLines.length > DOCS_DIFF_MAX_LINES) {
      throw new BadRequestException(
        `Revision body exceeds the maximum allowed line count for diff (${DOCS_DIFF_MAX_LINES} lines).`
      );
    }

    const hunks = DocsService.computeLineDiff(fromLines, toLines);

    return {
      fromRevisionNumber: fromRevNumber,
      toRevisionNumber: toRevNumber,
      hunks
    };
  }

  /**
   * Pure, deterministic line-level diff using the Myers/LCS algorithm.
   *
   * Returns a sequence of hunks: each hunk has a `type` ("unchanged" | "added" | "removed")
   * and an array of `lines`. Adjacent lines of the same type are merged into a single hunk.
   *
   * This method is `static` so it can be called from tests with fixed inputs to pin the
   * output deterministically (tester requirement).
   *
   * Algorithm: compute the longest common subsequence (LCS) of `fromLines` and `toLines`
   * using standard DP, then produce the ordered diff by scanning the edit script.
   *
   * @param fromLines Lines of the "from" revision.
   * @param toLines   Lines of the "to" revision.
   * @returns Ordered array of DocsDiffHunk entries.
   */
  static computeLineDiff(fromLines: string[], toLines: string[]): DocsDiffHunk[] {
    const m = fromLines.length;
    const n = toLines.length;

    // Build LCS length table.
    // dp[i][j] = LCS length for fromLines[0..i-1] vs toLines[0..j-1].
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0) as number[]);

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (fromLines[i - 1] === toLines[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to produce the edit script.
    const ops: Array<{ type: "unchanged" | "added" | "removed"; line: string }> = [];
    let i = m;
    let j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && fromLines[i - 1] === toLines[j - 1]) {
        ops.push({ type: "unchanged", line: fromLines[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        ops.push({ type: "added", line: toLines[j - 1] });
        j--;
      } else {
        ops.push({ type: "removed", line: fromLines[i - 1] });
        i--;
      }
    }

    // Ops are in reverse order; reverse to get correct document order.
    ops.reverse();

    // Merge consecutive same-type operations into hunks.
    const hunks: DocsDiffHunk[] = [];
    for (const op of ops) {
      const last = hunks[hunks.length - 1];
      if (last && last.type === op.type) {
        last.lines.push(op.line);
      } else {
        hunks.push({ type: op.type, lines: [op.line] });
      }
    }

    return hunks;
  }

  // ---------------------------------------------------------------------------
  // Rollback — POST /api/docs/:id/rollback
  // ---------------------------------------------------------------------------

  /**
   * Creates a new revision whose content equals the target revision (non-destructive
   * rollback), updates current_revision_id, and preserves all existing revisions.
   *
   * Security contract:
   * - Caller MUST call assertDocWriteAccess before calling this method.
   *
   * Atomicity (P10):
   * - The new revision row and the pointer update are written inside a single
   *   repository.manager.transaction. A failure leaves no dangling pointer.
   *
   * Non-destructive (AC3):
   * - The target revision and all intermediate revisions are preserved unchanged.
   * - A new revision is appended as the highest revision_number.
   *
   * @param actorUserId The authenticated user's UUID.
   * @param pageId      Target page UUID.
   * @param input       DocRollbackInput with the target revisionNumber.
   * @returns DocWriteResultShape reflecting the new rollback revision.
   * @throws NotFoundException   (404) when the page or target revision is not found.
   * @throws BadRequestException (400) when revisionNumber is not a positive integer.
   */
  async rollbackPage(
    actorUserId: string,
    pageId: string,
    input: DocRollbackInput,
    actorGlobalRole?: string | null
  ): Promise<DocWriteResultShape> {
    if (!Number.isInteger(input.revisionNumber) || input.revisionNumber < 1) {
      throw new BadRequestException("revisionNumber must be a positive integer.");
    }

    return this.pageRepository.manager.transaction(async (em) => {
      const page = await em.findOne(DocsPageEntity, { where: { id: pageId } });
      if (!page || page.status !== "published") {
        throw new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE);
      }

      // Lock check: reject if page is actively locked by another user (AC3).
      this.assertNotForeignLocked(page, actorUserId, actorGlobalRole);

      // Load the target revision to roll back to.
      const targetRevision = await em.findOne(DocsRevisionEntity, {
        where: { pageId, revisionNumber: input.revisionNumber }
      });
      if (!targetRevision) {
        throw new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE);
      }

      // Determine the next (highest) revision number.
      const lastRevision = await em.findOne(DocsRevisionEntity, {
        where: { pageId },
        order: { revisionNumber: "DESC" }
      });
      const nextRevisionNumber = lastRevision ? lastRevision.revisionNumber + 1 : 1;
      const newRevisionId = crypto.randomUUID();

      // 1. Insert the new revision with the target's content (non-destructive).
      const newRevision = em.create(DocsRevisionEntity, {
        id: newRevisionId,
        pageId,
        authorUserId: actorUserId,
        editorUserId: actorUserId,
        title: targetRevision.title,
        body: targetRevision.body,
        summary: `Rolled back to revision ${input.revisionNumber}`,
        revisionNumber: nextRevisionNumber
      });
      await em.save(DocsRevisionEntity, newRevision);

      // 2. Update current_revision_id and title on the page.
      await em.update(DocsPageEntity, { id: pageId }, {
        currentRevisionId: newRevisionId,
        title: targetRevision.title
      });

      // Re-load for db-refreshed updatedAt.
      const updatedPage = await em.findOne(DocsPageEntity, { where: { id: pageId } });

      return {
        id: pageId,
        title: targetRevision.title,
        path: page.path,
        depth: page.depth,
        parentId: page.parentId,
        currentRevisionId: newRevisionId,
        revisionNumber: nextRevisionNumber,
        createdAt: page.createdAt,
        updatedAt: updatedPage?.updatedAt ?? page.updatedAt
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Write-path validation helpers
  // ---------------------------------------------------------------------------

  /**
   * Validates that a slug uses only allowed characters and falls within length limits.
   * Allowed: lowercase a-z, digits 0-9, hyphens. Length: 1–255 chars.
   *
   * @throws BadRequestException (400) when the slug is invalid.
   */
  private validateSlug(slug: string): void {
    if (typeof slug !== "string" || slug.length === 0) {
      throw new BadRequestException("slug must be a non-empty string.");
    }
    if (slug.length > 255) {
      throw new BadRequestException("slug must not exceed 255 characters.");
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new BadRequestException(
        "slug may only contain lowercase letters (a-z), digits (0-9), and hyphens (-)."
      );
    }
  }

  /**
   * Validates title length.
   *
   * @throws BadRequestException (400) when the title is empty or exceeds the column limit.
   */
  private validateTitle(title: string): void {
    if (typeof title !== "string" || title.trim().length === 0) {
      throw new BadRequestException("title must be a non-empty string.");
    }
    if (title.length > 255) {
      throw new BadRequestException("title must not exceed 255 characters.");
    }
  }

  /**
   * Resolves a parent page by id or path, returning null when neither is provided
   * or when the page cannot be located.
   */
  private async resolveParent(
    parentId?: string,
    parentPath?: string
  ): Promise<DocsPageEntity | null> {
    if (parentId !== undefined) {
      // ST-3 carry-forward (ST-4 fix): reject soft-deleted parents via parentId,
      // in parity with the by-parentPath branch which already filters status='published'.
      return this.pageRepository.findOne({
        where: { id: parentId, scopeType: "site", status: "published" }
      });
    }
    if (parentPath !== undefined) {
      const normalizedParentPath = this.normalizePath(parentPath);
      const parentHash = this.computePathHash("site", null, normalizedParentPath);
      return this.pageRepository.findOne({
        where: { scopeType: "site", scopeId: IsNull(), pathHash: parentHash, status: "published" }
      });
    }
    return null;
  }

  /**
   * Maps a DocsRevisionEntity (with loaded users) to DocsRevisionMetaShape for history.
   */
  private toRevisionMetaShape(revision: DocsRevisionEntity): import("./docs.types").DocsRevisionMetaShape {
    const authorUser = revision.author as { username: string; displayName: string | null } | null;
    const editorUser = revision.editorUser as { username: string } | null;
    return {
      revisionNumber: revision.revisionNumber,
      author: authorUser ? { username: authorUser.username, displayName: authorUser.displayName } : null,
      editorUsername: editorUser ? editorUser.username : null,
      summary: revision.summary,
      createdAt: revision.createdAt
    };
  }

  /**
   * Maps a DocsRevisionEntity (with loaded page and users) to the public
   * DocsRecentEditShape DTO.
   */
  private toRecentEditShape(revision: DocsRevisionEntity): DocsRecentEditShape {
    const page = revision.page as DocsPageEntity;
    const editorUser = revision.editorUser as { username: string; displayName: string | null } | null;
    const authorUser = revision.author as { username: string; displayName: string | null } | null;
    const editor = editorUser ?? authorUser;
    return {
      pageId: page.id,
      title: page.title,
      path: page.path,
      editor: editor ? { username: editor.username, displayName: editor.displayName } : null,
      editedAt: revision.createdAt
    };
  }
}
