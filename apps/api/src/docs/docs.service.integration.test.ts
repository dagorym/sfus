/**
 * Integration spec: DocsService createPage / addRevision against a real MySQL schema.
 *
 * PURPOSE
 * -------
 * Mocked unit tests cannot detect foreign-key constraint violations or enforce
 * transactional atomicity at the DB engine level. This suite exercises
 * DocsService.createPage and DocsService.addRevision against the migrated
 * dev-stack schema so:
 *
 *  - The unique (scope_type, scope_id, path_hash) index rejects duplicates.
 *  - The page + revision + pointer-update transaction leaves no orphaned rows
 *    on mid-sequence failure (ST-3 AC3 / P10).
 *  - The 403 gate (assertDocWriteAccess) fires before any DB operation.
 *
 * OPT-IN GATE
 * -----------
 * Set SFUS_DB_INTEGRATION=1 (and DB_HOST / DB_PORT / DB_NAME / DB_USER /
 * DB_PASSWORD per docs/development/testing.md) before running.
 *
 * Without the flag the entire suite skips cleanly — no database is required
 * and the default workspace `test` command is unaffected.
 *
 * LOCAL RUN (dev stack up, migrations applied)
 * --------------------------------------------
 *   SFUS_DB_INTEGRATION=1 \
 *   DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=sfus \
 *   DB_USER=sfus DB_PASSWORD=changeme-app \
 *   npx --yes pnpm@10.0.0 --filter @sfus/api run test:integration
 *
 * TESTER NOTES
 * ------------
 * The tester should fill in:
 *
 *  1. "creates page + revision + pointer atomically" — verify that when a
 *     mid-sequence failure is injected the page row is absent and the revision
 *     table has no dangling row for that page_id.
 *
 *  2. "rejects duplicate path hash" — call createPage twice with the same slug;
 *     expect ConflictException on the second call and confirm only one page row
 *     exists in the DB.
 *
 *  3. "addRevision increments revision_number and updates pointer" — create a
 *     page, then call addRevision; verify revision_number=2 and
 *     current_revision_id points to the new revision row.
 *
 *  4. "assertDocWriteAccess blocks non-staff" — call createPage / addRevision
 *     with a 'user'-role actor; expect ForbiddenException before any DB write.
 *
 * Keep this file colocated with docs.service.ts per the plan contract.
 */

import { ForbiddenException } from "@nestjs/common";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { DataSource } from "typeorm";
import { Repository } from "typeorm";

import {
  createIntegrationDataSource,
  readDbOptionsFromEnv,
  insertThrowawayUser,
  cleanupThrowawayRows
} from "../pages/integration-test-support";
import { AuthorizationService } from "../authorization/authorization.service";
import { DocsService } from "./docs.service";
import { DocsPageEntity } from "./entities/docs-page.entity";
import { DocsRevisionEntity } from "./entities/docs-revision.entity";

// ---------------------------------------------------------------------------
// Opt-in gate — skip the entire suite when SFUS_DB_INTEGRATION is not "1"
// ---------------------------------------------------------------------------

const DB_INTEGRATION_ENABLED = process.env.SFUS_DB_INTEGRATION === "1";

const skipReason =
  "SFUS_DB_INTEGRATION=1 is not set. " +
  "Set this flag together with DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD " +
  "and run `pnpm --filter @sfus/api run test:integration` to execute this suite.";

if (!DB_INTEGRATION_ENABLED) {
  console.info(`[docs.service.integration] SKIP: ${skipReason}`);
}

describe.skipIf(!DB_INTEGRATION_ENABLED)(
  "DocsService write API — real-FK integration (SFUS_DB_INTEGRATION=1 required)",
  () => {
    let ds: DataSource;
    let pageRepo: Repository<DocsPageEntity>;
    let revisionRepo: Repository<DocsRevisionEntity>;
    let service: DocsService;

    // Throwaway row ids accumulated per-test so afterEach can clean up.
    const createdPageIds: string[] = [];
    const createdUserIds: string[] = [];

    // The test-user id shared within this suite.
    let authorUserId: string;

    beforeAll(async () => {
      const opts = readDbOptionsFromEnv();
      ds = await createIntegrationDataSource(opts);
      pageRepo = ds.getRepository(DocsPageEntity);
      revisionRepo = ds.getRepository(DocsRevisionEntity);
      const authorizationService = new AuthorizationService();
      service = new DocsService(
        pageRepo,
        revisionRepo,
        authorizationService
      );

      authorUserId = await insertThrowawayUser(ds);
      createdUserIds.push(authorUserId);
    });

    afterEach(async () => {
      // Clean up pages created in this test (cascades to revisions).
      if (createdPageIds.length > 0) {
        const ids = [...createdPageIds];
        createdPageIds.length = 0;
        await cleanupThrowawayRows(ds, ids, []);
      }
    });

    afterAll(async () => {
      await cleanupThrowawayRows(ds, [], createdUserIds);
      await ds.destroy();
    });

    // -------------------------------------------------------------------------
    // ST-3 AC5: assertDocWriteAccess blocks non-staff before any DB operation
    // -------------------------------------------------------------------------

    it("assertDocWriteAccess throws ForbiddenException for 'user' role", () => {
      expect(() => service.assertDocWriteAccess("user", "site")).toThrow(ForbiddenException);
    });

    it("assertDocWriteAccess throws ForbiddenException for null/anonymous actor", () => {
      expect(() => service.assertDocWriteAccess(null, "site")).toThrow(ForbiddenException);
    });

    it("assertDocWriteAccess does NOT throw for 'moderator' role", () => {
      expect(() => service.assertDocWriteAccess("moderator", "site")).not.toThrow();
    });

    it("assertDocWriteAccess does NOT throw for 'admin' role", () => {
      expect(() => service.assertDocWriteAccess("admin", "site")).not.toThrow();
    });

    // -------------------------------------------------------------------------
    // ST-3 AC1: createPage creates page + revision #1 + sets current_revision_id
    // -------------------------------------------------------------------------

    it("createPage inserts a page row and revision #1 and sets current_revision_id", async () => {
      const result = await service.createPage(authorUserId, {
        title: "Integration Test Page",
        slug: "integration-test-page",
        body: "# Hello",
        summary: "Initial revision"
      });
      createdPageIds.push(result.id);

      expect(result.revisionNumber).toBe(1);
      expect(result.currentRevisionId).toBeTruthy();

      const page = await pageRepo.findOne({ where: { id: result.id } });
      expect(page).toBeTruthy();
      expect(page!.currentRevisionId).toBe(result.currentRevisionId);

      const revision = await revisionRepo.findOne({
        where: { id: result.currentRevisionId! }
      });
      expect(revision).toBeTruthy();
      expect(revision!.revisionNumber).toBe(1);
    });

    // -------------------------------------------------------------------------
    // ST-3 AC3: Duplicate path_hash rejected (ConflictException)
    // -------------------------------------------------------------------------

    it("createPage rejects a duplicate full path (path_hash collision)", async () => {
      const slug = `dup-test-${Date.now()}`;
      const first = await service.createPage(authorUserId, {
        title: "Dup Test 1",
        slug,
        body: "body"
      });
      createdPageIds.push(first.id);

      await expect(
        service.createPage(authorUserId, { title: "Dup Test 2", slug, body: "body" })
      ).rejects.toThrow(/already exists/i);
    });

    // -------------------------------------------------------------------------
    // ST-3 AC2: addRevision increments revision_number and updates pointer
    // -------------------------------------------------------------------------

    it("addRevision produces revision #2 with incremented number and updated current_revision_id", async () => {
      const created = await service.createPage(authorUserId, {
        title: "Edit Me",
        slug: `edit-me-${Date.now()}`,
        body: "v1"
      });
      createdPageIds.push(created.id);

      const edited = await service.addRevision(authorUserId, created.id, {
        title: "Edit Me (revised)",
        body: "v2",
        summary: "Updated body"
      });

      expect(edited.revisionNumber).toBe(2);
      expect(edited.currentRevisionId).not.toBe(created.currentRevisionId);

      const page = await pageRepo.findOne({ where: { id: created.id } });
      expect(page!.currentRevisionId).toBe(edited.currentRevisionId);

      const rev = await revisionRepo.findOne({
        where: { id: edited.currentRevisionId! }
      });
      expect(rev!.revisionNumber).toBe(2);
    });

    // -------------------------------------------------------------------------
    // ST-3 AC3: Transactional atomicity — tester fills in injection test
    // -------------------------------------------------------------------------

    it.todo(
      "createPage leaves no orphaned rows when mid-sequence failure is injected (P10 — tester fills in)"
    );
  }
);
