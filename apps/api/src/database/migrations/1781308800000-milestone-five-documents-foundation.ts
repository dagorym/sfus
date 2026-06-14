import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Milestone 5 — Documents / Wiki foundation migration.
 *
 * Creates: docs_pages, docs_revisions.
 *
 * MySQL 5.7.44-compatible DDL; utf8mb4; precision-3 datetimes.
 *
 * Path lookup / uniqueness notes:
 *   docs_pages.path (varchar(1024)) stores the full slash-joined path but is NOT
 *   individually unique-indexed because the utf8mb4 prefix limit would be exceeded
 *   for long paths under MySQL 5.7.44. Full-path uniqueness and catch-all resolution
 *   are handled through path_hash char(64) unique per (scope_type, scope_id).
 *
 * Soft-lock columns (is_locked, locked_by_user_id, locked_at, lock_expires_at):
 *   Advisory edit-collision lock managed by DocsService in ST-6.
 *   ST-1 creates the columns; lock behaviour is wired in ST-6.
 *
 * current_revision_id FK notes:
 *   docs_pages.current_revision_id → docs_revisions.id ON DELETE SET NULL.
 *   This FK is added after docs_revisions is created to avoid a circular DDL
 *   dependency. TypeOrmModule entity decorators use createForeignKeyConstraints: false
 *   on the DocsPageEntity.currentRevision side so TypeORM never auto-generates a
 *   duplicate constraint.
 *
 * scope_id is nullable (no FK) — forward-scaffolding placeholder for M7/M8 project scope.
 *   When the projects table lands, add:
 *   ALTER TABLE docs_pages
 *     ADD CONSTRAINT fk_docs_pages_scope_id
 *       FOREIGN KEY (scope_id) REFERENCES projects(id) ON DELETE CASCADE
 *     WHERE scope_type = 'project';
 */
export class MilestoneFiveDocumentsFoundation1781308800000 implements MigrationInterface {
  name = "MilestoneFiveDocumentsFoundation1781308800000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // docs_pages — the wiki page tree
    await queryRunner.query(`
      CREATE TABLE \`docs_pages\` (
        \`id\` char(36) NOT NULL,
        \`scope_type\` varchar(32) NOT NULL DEFAULT 'site',
        \`scope_id\` char(36) NULL,
        \`title\` varchar(255) NOT NULL,
        \`slug\` varchar(255) NOT NULL,
        \`path\` varchar(1024) NOT NULL,
        \`path_hash\` char(64) NOT NULL,
        \`parent_id\` char(36) NULL,
        \`depth\` int unsigned NOT NULL DEFAULT 0,
        \`visibility\` varchar(32) NOT NULL DEFAULT 'public',
        \`status\` varchar(32) NOT NULL DEFAULT 'published',
        \`is_locked\` tinyint(1) NOT NULL DEFAULT 0,
        \`locked_by_user_id\` char(36) NULL,
        \`locked_at\` datetime(3) NULL,
        \`lock_expires_at\` datetime(3) NULL,
        \`current_revision_id\` char(36) NULL,
        \`created_by_user_id\` char(36) NOT NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_docs_pages_scope_path_hash\` (\`scope_type\`, \`scope_id\`, \`path_hash\`),
        KEY \`idx_docs_pages_parent_id\` (\`parent_id\`),
        KEY \`idx_docs_pages_scope_status\` (\`scope_type\`, \`scope_id\`, \`status\`),
        CONSTRAINT \`fk_docs_pages_created_by_user_id\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`fk_docs_pages_locked_by_user_id\` FOREIGN KEY (\`locked_by_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // docs_revisions — immutable content revisions for each page
    await queryRunner.query(`
      CREATE TABLE \`docs_revisions\` (
        \`id\` char(36) NOT NULL,
        \`page_id\` char(36) NOT NULL,
        \`author_user_id\` char(36) NOT NULL,
        \`editor_user_id\` char(36) NULL,
        \`title\` varchar(255) NOT NULL,
        \`body\` mediumtext NOT NULL,
        \`summary\` varchar(512) NULL,
        \`revision_number\` int unsigned NOT NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_docs_revisions_page_revision_number\` (\`page_id\`, \`revision_number\`),
        KEY \`idx_docs_revisions_page_created\` (\`page_id\`, \`created_at\`),
        CONSTRAINT \`fk_docs_revisions_page_id\` FOREIGN KEY (\`page_id\`) REFERENCES \`docs_pages\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_docs_revisions_author_user_id\` FOREIGN KEY (\`author_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`fk_docs_revisions_editor_user_id\` FOREIGN KEY (\`editor_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Add the current_revision_id FK after docs_revisions exists (avoids circular DDL dependency)
    await queryRunner.query(`
      ALTER TABLE \`docs_pages\`
        ADD CONSTRAINT \`fk_docs_pages_current_revision_id\`
          FOREIGN KEY (\`current_revision_id\`) REFERENCES \`docs_revisions\` (\`id\`) ON DELETE SET NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the circular FK first, then tables in reverse dependency order
    await queryRunner.query("ALTER TABLE `docs_pages` DROP FOREIGN KEY `fk_docs_pages_current_revision_id`");
    await queryRunner.query("DROP TABLE IF EXISTS `docs_revisions`");
    await queryRunner.query("DROP TABLE IF EXISTS `docs_pages`");
  }
}
