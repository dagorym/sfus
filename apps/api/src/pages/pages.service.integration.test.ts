/**
 * Integration spec: PagesService.create against a real MySQL schema.
 *
 * PURPOSE
 * -------
 * Mocked unit tests cannot detect foreign-key constraint violations; this
 * suite exercises PagesService.create against the migrated dev-stack schema
 * so fk_page_revisions_page_id is enforced by the real database engine.
 *
 * OPT-IN GATE
 * -----------
 * Set SFUS_DB_INTEGRATION=1 (and DB_HOST / DB_PORT / DB_NAME / DB_USER /
 * DB_PASSWORD per docs/website-launch-guide.md) before running.
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
 * Or via the CI/CD validation entry (requires dev MySQL up):
 *   bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml
 *   (the `pages-service-integration` entry is skipped automatically when
 *    SFUS_DB_INTEGRATION is unset, so it is safe to run in environments
 *    without a database)
 */

import crypto from "node:crypto";

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { DataSource } from "typeorm";
import { Repository } from "typeorm";

import {
  createIntegrationDataSource,
  readDbOptionsFromEnv,
  insertThrowawayUser,
  cleanupThrowawayRows
} from "./integration-test-support";
import { AuthorizationService } from "../authorization/authorization.service";
import { PagesService } from "./pages.service";
import { StandalonePageEntity } from "./entities/standalone-page.entity";
import { PageRevisionEntity } from "./entities/page-revision.entity";

// ---------------------------------------------------------------------------
// Opt-in gate — skip the entire suite when SFUS_DB_INTEGRATION is not "1"
// ---------------------------------------------------------------------------

const DB_INTEGRATION_ENABLED = process.env.SFUS_DB_INTEGRATION === "1";

const skipReason =
  "SFUS_DB_INTEGRATION=1 is not set. " +
  "Set this flag together with DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD " +
  "and run `pnpm --filter @sfus/api run test:integration` to execute this suite.";

if (!DB_INTEGRATION_ENABLED) {
  console.info(`[pages.service.integration] SKIP: ${skipReason}`);
}

describe.skipIf(!DB_INTEGRATION_ENABLED)(
  "PagesService.create — real-FK integration (SFUS_DB_INTEGRATION=1 required)",
  () => {
    let ds: DataSource;
    let pageRepo: Repository<StandalonePageEntity>;
    let revisionRepo: Repository<PageRevisionEntity>;
    let service: PagesService;

    // Throwaway row ids accumulated per-test so afterEach can clean up.
    const createdPageIds: string[] = [];
    const createdUserIds: string[] = [];

    // The test-user id shared within this suite.
    let authorUserId: string;

    beforeAll(async () => {
      const opts = readDbOptionsFromEnv();
      ds = await createIntegrationDataSource(opts);
      pageRepo = ds.getRepository(StandalonePageEntity);
      revisionRepo = ds.getRepository(PageRevisionEntity);

      // PagesService needs TypeORM repositories; wire them from the real DS.
      const authorizationService = new AuthorizationService();
      service = new PagesService(pageRepo, revisionRepo, authorizationService);

      // Insert one throwaway user for the suite.
      authorUserId = await insertThrowawayUser(ds);
      createdUserIds.push(authorUserId);
    });

    afterEach(async () => {
      // Remove any standalone_pages rows created during a test.
      // page_revisions rows are removed by CASCADE on standalone_pages.
      if (createdPageIds.length > 0) {
        await cleanupThrowawayRows(ds, [...createdPageIds], []);
        createdPageIds.length = 0;
      }
    });

    afterAll(async () => {
      // Remove the throwaway user (cascade removes any lingering child rows).
      await cleanupThrowawayRows(ds, [], [...createdUserIds]);
      createdUserIds.length = 0;
      await ds.destroy();
    });

    // -----------------------------------------------------------------------
    // Test 1: successful create round-trip with real FK enforcement
    // -----------------------------------------------------------------------

    it(
      "persists standalone_pages and page_revisions rows with real FK enforced, " +
        "and sets current_revision_id",
      async () => {
        const slug = `it-slug-${crypto.randomUUID().slice(0, 8)}`;

        const result = await service.create(authorUserId, {
          title: "Integration Test Page",
          slug,
          body: "# Hello\nThis is integration test content."
        });

        // Track for cleanup.
        createdPageIds.push(result.id);

        // The returned entity must have a non-null currentRevisionId.
        expect(result.id).toBeTruthy();
        expect(result.slug).toBe(slug);
        expect(result.status).toBe("draft");
        expect(result.currentRevisionId).toBeTruthy();

        // Verify standalone_pages row in the real DB.
        const persistedPage = await pageRepo.findOne({ where: { id: result.id } });
        expect(persistedPage).not.toBeNull();
        expect(persistedPage!.currentRevisionId).toBe(result.currentRevisionId);

        // Verify page_revisions row in the real DB.
        const revision = await revisionRepo.findOne({
          where: { pageId: result.id }
        });
        expect(revision).not.toBeNull();
        expect(revision!.revisionNumber).toBe(1);
        expect(revision!.pageId).toBe(result.id);
        expect(revision!.authorUserId).toBe(authorUserId);
        expect(revision!.id).toBe(result.currentRevisionId);
      }
    );

    // -----------------------------------------------------------------------
    // Test 2: forced mid-transaction failure proves DB rollback atomicity
    //
    // WHY THIS TEST DOES NOT CALL service.create() DIRECTLY
    // -------------------------------------------------------
    // PagesService.create() generates its own page_id and revision_id via
    // crypto.randomUUID() inside the service module.  Vitest's vi.spyOn
    // cannot intercept a native Node.js module method used by a different
    // module's own import (the production module's `crypto` binding is frozen
    // at load time and is not the same reference as the test's spy target).
    // All other mechanisms for causing a failure *inside* the service's
    // transaction without modifying production code were evaluated:
    //
    //   - crafted slug/title/body input: fails before the transaction starts
    //     (the validators reject bad input before entityManager.transaction)
    //   - vi.spyOn on entityManager.getRepository: not exposed; the service
    //     calls entityManager.getRepository() on a fresh transactional EM
    //     obtained internally from this.pageRepository.manager.transaction
    //
    // WHAT THIS TEST DOES AND DOES NOT PROVE
    // ----------------------------------------
    // This test proves that the MySQL schema and TypeORM's transaction wrapper
    // are correctly configured: if a constraint violation occurs during a
    // transaction that mirrors PagesService.create()'s three-step write
    // sequence, the entire transaction — including the standalone_pages row
    // that was inserted first — is atomically rolled back.
    //
    // Test 1 proves that the real PagesService.create() path succeeds
    // end-to-end with FK enforcement. Together the two tests give high
    // confidence that the FK bug that originally shipped (INSERT order wrong,
    // causing FK violation on every create) is fixed and that the rollback
    // contract holds at the database level.
    //
    // Strategy: construct a test-local transaction that performs the same
    // three steps as PagesService.create() (insert standalone_pages, insert
    // page_revisions, update currentRevisionId pointer) but injects a second
    // revision insert with duplicate revision_number to violate
    // uq_page_revisions_page_revision_number.  The transaction must roll back,
    // leaving no standalone_pages row with our test page_id.
    // -----------------------------------------------------------------------

    it(
      "a mid-transaction revision-insert failure rolls back the standalone_pages row (DB atomicity proof)",
      async () => {
        const slug = `it-orphan-${crypto.randomUUID().slice(0, 8)}`;
        const fakePageId = crypto.randomUUID();

        // Attempt a transaction that mirrors PagesService.create()'s write
        // sequence but intentionally violates uq_page_revisions_page_revision_number
        // to force a DB-level rollback.
        let transactionError: unknown = null;

        try {
          await pageRepo.manager.transaction(async (em) => {
            const txPageRepo = em.getRepository(StandalonePageEntity);
            const txRevisionRepo = em.getRepository(PageRevisionEntity);

            // Step 1: Insert standalone_pages row (mirrors create()'s first write).
            await txPageRepo.save(
              txPageRepo.create({
                id: fakePageId,
                createdByUserId: authorUserId,
                title: "Rollback Test",
                slug,
                status: "draft",
                publishedAt: null,
                currentRevisionId: null
              })
            );

            // Step 2a: Insert revision 1 (mirrors create()'s second write).
            const rev1Id = crypto.randomUUID();
            await txRevisionRepo.save(
              txRevisionRepo.create({
                id: rev1Id,
                pageId: fakePageId,
                authorUserId,
                title: "Rev 1",
                body: "body",
                summary: null,
                changeNote: null,
                featuredMediaId: null,
                revisionNumber: 1
              })
            );

            // Step 2b: Insert a second revision with the SAME revision_number
            // to violate uq_page_revisions_page_revision_number and force
            // a DB error inside the transaction.
            await txRevisionRepo.save(
              txRevisionRepo.create({
                id: crypto.randomUUID(),
                pageId: fakePageId,
                authorUserId,
                title: "Rev 1 duplicate",
                body: "body",
                summary: null,
                changeNote: null,
                featuredMediaId: null,
                revisionNumber: 1 // Intentional duplicate — forces constraint violation.
              })
            );
          });
        } catch (err) {
          transactionError = err;
        }

        // The transaction must have thrown due to the constraint violation.
        expect(transactionError).not.toBeNull();

        // After rollback, no standalone_pages row with fakePageId must exist.
        const orphanedPage = await pageRepo.findOne({ where: { id: fakePageId } });
        expect(orphanedPage).toBeNull();

        // No page_revisions rows referencing fakePageId must exist either.
        const orphanedRevisions = await revisionRepo.find({ where: { pageId: fakePageId } });
        expect(orphanedRevisions).toHaveLength(0);
      }
    );
  }
);
