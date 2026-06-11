/**
 * Integration spec: ForumsService.listRecentTopics against a real MySQL schema.
 *
 * PURPOSE
 * -------
 * Mocked unit tests cannot detect SQL dialect-level failures. The defect guarded
 * by this spec is the "NULLS LAST" literal that was previously passed as the third
 * argument to TypeORM's QueryBuilder.orderBy(). MySQL does not support the
 * SQL-standard NULLS FIRST / NULLS LAST clause and returns a MySQL 1064 parse
 * error when it is present.
 *
 * This spec exercises listRecentTopics (and the GET /api/forums/recent endpoint)
 * against a real MySQL connection so any reintroduction of a dialect-incompatible
 * ORDER BY literal would fail here rather than silently passing in the mocked
 * unit suite.
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
 * Or via the CI/CD validation entry (requires dev MySQL up):
 *   bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml
 *   (the `forums-service-integration` entry is skipped automatically when
 *    SFUS_DB_INTEGRATION is unset, so it is safe to run in environments
 *    without a database)
 */

import crypto from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { DataSource, QueryRunner } from "typeorm";
import { Repository } from "typeorm";

import {
  createIntegrationDataSource,
  readDbOptionsFromEnv,
  insertThrowawayUser,
  cleanupThrowawayRows
} from "../pages/integration-test-support";
import { ForumDescriptionLength1780893000000 } from "../database/migrations/1780893000000-forum-description-length";
import { AuthorizationService } from "../authorization/authorization.service";
import { ForumsService } from "./forums.service";
import { ForumCategoryEntity } from "./entities/forum-category.entity";
import { ForumBoardEntity } from "./entities/forum-board.entity";
import { ForumTopicEntity } from "./entities/forum-topic.entity";
import { ForumPostEntity } from "./entities/forum-post.entity";

// ---------------------------------------------------------------------------
// Opt-in gate — skip the entire suite when SFUS_DB_INTEGRATION is not "1"
// ---------------------------------------------------------------------------

const DB_INTEGRATION_ENABLED = process.env.SFUS_DB_INTEGRATION === "1";

const skipReason =
  "SFUS_DB_INTEGRATION=1 is not set. " +
  "Set this flag together with DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD " +
  "and run `pnpm --filter @sfus/api run test:integration` to execute this suite.";

if (!DB_INTEGRATION_ENABLED) {
  console.info(`[forums.service.integration] SKIP: ${skipReason}`);
}

describe.skipIf(!DB_INTEGRATION_ENABLED)(
  "ForumsService.listRecentTopics — MySQL ORDER BY dialect regression guard (SFUS_DB_INTEGRATION=1 required)",
  () => {
    let ds: DataSource;
    let categoryRepo: Repository<ForumCategoryEntity>;
    let boardRepo: Repository<ForumBoardEntity>;
    let topicRepo: Repository<ForumTopicEntity>;
    let postRepo: Repository<ForumPostEntity>;
    let service: ForumsService;

    // Throwaway row ids accumulated during the suite so afterAll can clean up.
    const createdTopicIds: string[] = [];
    const createdBoardIds: string[] = [];
    const createdCategoryIds: string[] = [];
    const createdUserIds: string[] = [];

    // Shared author user id for the suite.
    let authorUserId: string;

    // Shared public category and board created once for the suite.
    let publicCategoryId: string;
    let publicBoardId: string;

    beforeAll(async () => {
      const opts = readDbOptionsFromEnv();
      ds = await createIntegrationDataSource(opts);
      categoryRepo = ds.getRepository(ForumCategoryEntity);
      boardRepo = ds.getRepository(ForumBoardEntity);
      topicRepo = ds.getRepository(ForumTopicEntity);
      postRepo = ds.getRepository(ForumPostEntity);

      const authorizationService = new AuthorizationService();
      service = new ForumsService(
        categoryRepo,
        boardRepo,
        topicRepo,
        postRepo,
        authorizationService
      );

      // Insert a throwaway user for topic authorship.
      authorUserId = await insertThrowawayUser(ds);
      createdUserIds.push(authorUserId);

      // Insert a throwaway public forum category.
      publicCategoryId = crypto.randomUUID();
      const suffix = publicCategoryId.slice(0, 8);
      await categoryRepo.save(
        categoryRepo.create({
          id: publicCategoryId,
          name: `IT Category ${suffix}`,
          slug: `it-cat-${suffix}`,
          description: null,
          sortOrder: 0
        })
      );
      createdCategoryIds.push(publicCategoryId);

      // Insert a throwaway publicly-readable site board.
      publicBoardId = crypto.randomUUID();
      const boardSuffix = publicBoardId.slice(0, 8);
      await boardRepo.save(
        boardRepo.create({
          id: publicBoardId,
          categoryId: publicCategoryId,
          name: `IT Board ${boardSuffix}`,
          slug: `it-board-${boardSuffix}`,
          description: null,
          scopeType: "site",
          visibility: "public",
          projectId: null,
          sortOrder: 0
        })
      );
      createdBoardIds.push(publicBoardId);
    });

    afterAll(async () => {
      // Delete topics first (FK: forum_posts.topic_id → forum_topics.id CASCADE,
      // so posts are removed automatically).
      for (const topicId of createdTopicIds) {
        await topicRepo.delete({ id: topicId });
      }

      // Delete the board and category (order matters for FK constraints).
      for (const boardId of createdBoardIds) {
        await boardRepo.delete({ id: boardId });
      }
      for (const categoryId of createdCategoryIds) {
        await categoryRepo.delete({ id: categoryId });
      }

      // Delete the throwaway user last.
      await cleanupThrowawayRows(ds, [], [...createdUserIds]);

      await ds.destroy();
    });

    // -----------------------------------------------------------------------
    // Test 1: listRecentTopics returns successfully (dialect regression guard)
    //
    // This is the primary guard against reintroduction of "NULLS LAST" in the
    // ORDER BY clause. If the literal is present, MySQL raises error 1064 and
    // the query throws. The test would fail with a DB error rather than an
    // assertion mismatch, making the root cause obvious.
    // -----------------------------------------------------------------------

    it(
      "listRecentTopics executes against MySQL without a 1064 parse error " +
        "(guards against reintroduction of NULLS LAST / NULLS FIRST dialect literal)",
      async () => {
        // Insert a topic with lastPostAt set so the ORDER BY path is exercised.
        const topicId = crypto.randomUUID();
        const topicSuffix = topicId.slice(0, 8);
        await topicRepo.save(
          topicRepo.create({
            id: topicId,
            boardId: publicBoardId,
            authorUserId,
            title: `IT Recent Topic ${topicSuffix}`,
            slug: `it-recent-${topicSuffix}`,
            body: "Integration test topic body.",
            isPinned: false,
            isLocked: false,
            replyCount: 0,
            lastPostAt: new Date(), // non-null exercises the NULL-handling in ORDER BY
            movedByUserId: null,
            movedAt: null,
            lockedByUserId: null,
            lockedAt: null,
            deletedAt: null
          })
        );
        createdTopicIds.push(topicId);

        // This call must not throw. A reintroduced "NULLS LAST" literal would
        // cause MySQL to return error 1064 (You have an error in your SQL syntax),
        // which TypeORM surfaces as a QueryFailedError.
        let result: Awaited<ReturnType<typeof service.listRecentTopics>>;
        await expect(
          (async () => {
            result = await service.listRecentTopics({ limit: 5 });
          })()
        ).resolves.toBeUndefined(); // the async wrapper resolves (no throw)

        // The inserted topic must appear in the results.
        expect(result!).toBeDefined();
        expect(Array.isArray(result!)).toBe(true);
        const found = result!.find((t) => t.id === topicId);
        expect(found).toBeDefined();
        expect(found!.title).toBe(`IT Recent Topic ${topicSuffix}`);
      }
    );

    // -----------------------------------------------------------------------
    // Test 2: listRecentTopics with all-null lastPostAt values
    //
    // Exercises the NULL-handling path specifically: when no topics have a
    // lastPostAt value, MySQL's native NULL-last DESC ordering must work
    // without any explicit NULLS LAST literal.
    // -----------------------------------------------------------------------

    it(
      "listRecentTopics succeeds when topic lastPostAt is NULL " +
        "(MySQL native NULL ordering — no NULLS LAST literal required)",
      async () => {
        // Insert a topic with lastPostAt = null to exercise the null-ordering path.
        const topicId = crypto.randomUUID();
        const topicSuffix = topicId.slice(0, 8);
        await topicRepo.save(
          topicRepo.create({
            id: topicId,
            boardId: publicBoardId,
            authorUserId,
            title: `IT Null LastPost ${topicSuffix}`,
            slug: `it-null-lp-${topicSuffix}`,
            body: "Integration test topic with no replies.",
            isPinned: false,
            isLocked: false,
            replyCount: 0,
            lastPostAt: null, // exercises the null-ORDER BY path
            movedByUserId: null,
            movedAt: null,
            lockedByUserId: null,
            lockedAt: null,
            deletedAt: null
          })
        );
        createdTopicIds.push(topicId);

        // Must not throw even with null lastPostAt in the result set.
        const result = await service.listRecentTopics({ limit: 20 });

        expect(Array.isArray(result)).toBe(true);
        const found = result.find((t) => t.id === topicId);
        expect(found).toBeDefined();
        expect(found!.lastPostAt).toBeNull();
      }
    );
  }
);

// ---------------------------------------------------------------------------
// ST4: Migration up/down check — forum_categories and forum_boards description
// column widening from varchar(255) to varchar(512).
//
// NOTE: This suite is skipped automatically when SFUS_DB_INTEGRATION is not "1".
// MySQL is unavailable in this environment; the suite skips cleanly.
// ---------------------------------------------------------------------------

describe.skipIf(!DB_INTEGRATION_ENABLED)(
  "ForumDescriptionLength1780893000000 migration — up/down column width check (SFUS_DB_INTEGRATION=1 required)",
  () => {
    let ds: DataSource;
    let qr: QueryRunner;

    /**
     * Returns the column length for a given table+column from information_schema.
     * Works for MySQL varchar columns; returns null when the column is not found.
     */
    const getColumnLength = async (table: string, column: string): Promise<number | null> => {
      const rows = await qr.query(
        `SELECT CHARACTER_MAXIMUM_LENGTH
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND COLUMN_NAME = ?`,
        [table, column]
      );
      if (!rows || rows.length === 0) return null;
      return Number((rows as Array<{ CHARACTER_MAXIMUM_LENGTH: number | string }>)[0].CHARACTER_MAXIMUM_LENGTH);
    };

    beforeAll(async () => {
      const opts = readDbOptionsFromEnv();
      ds = await createIntegrationDataSource(opts);
      qr = ds.createQueryRunner();
      await qr.connect();
    });

    afterAll(async () => {
      if (qr) await qr.release();
      if (ds && ds.isInitialized) await ds.destroy();
    });

    it("up() widens forum_categories.description to varchar(512)", async () => {
      // Ensure we are at varchar(255) state before running up().
      await qr.query("ALTER TABLE `forum_categories` MODIFY COLUMN `description` varchar(255) NULL");
      const migration = new ForumDescriptionLength1780893000000();
      await migration.up(qr);
      const len = await getColumnLength("forum_categories", "description");
      expect(len).toBe(512);
    });

    it("up() widens forum_boards.description to varchar(512)", async () => {
      await qr.query("ALTER TABLE `forum_boards` MODIFY COLUMN `description` varchar(255) NULL");
      const migration = new ForumDescriptionLength1780893000000();
      await migration.up(qr);
      const len = await getColumnLength("forum_boards", "description");
      expect(len).toBe(512);
    });

    it("down() reverts forum_categories.description to varchar(255)", async () => {
      // Ensure we are at varchar(512) state before running down().
      await qr.query("ALTER TABLE `forum_categories` MODIFY COLUMN `description` varchar(512) NULL");
      const migration = new ForumDescriptionLength1780893000000();
      await migration.down(qr);
      const len = await getColumnLength("forum_categories", "description");
      expect(len).toBe(255);
    });

    it("down() reverts forum_boards.description to varchar(255)", async () => {
      await qr.query("ALTER TABLE `forum_boards` MODIFY COLUMN `description` varchar(512) NULL");
      const migration = new ForumDescriptionLength1780893000000();
      await migration.down(qr);
      const len = await getColumnLength("forum_boards", "description");
      expect(len).toBe(255);
    });

    it("up() then down() leaves forum_categories.description at varchar(255) (round-trip)", async () => {
      await qr.query("ALTER TABLE `forum_categories` MODIFY COLUMN `description` varchar(255) NULL");
      const migration = new ForumDescriptionLength1780893000000();
      await migration.up(qr);
      await migration.down(qr);
      const len = await getColumnLength("forum_categories", "description");
      expect(len).toBe(255);
    });

    it("up() then down() leaves forum_boards.description at varchar(255) (round-trip)", async () => {
      await qr.query("ALTER TABLE `forum_boards` MODIFY COLUMN `description` varchar(255) NULL");
      const migration = new ForumDescriptionLength1780893000000();
      await migration.up(qr);
      await migration.down(qr);
      const len = await getColumnLength("forum_boards", "description");
      expect(len).toBe(255);
    });
  }
);
