import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Milestone 4 — Forums foundation migration.
 *
 * Creates: forum_categories, forum_boards, forum_topics, forum_posts.
 *
 * MySQL 5.7.44-compatible DDL; utf8mb4; precision-3 datetimes.
 *
 * forum_boards.scope_type and project_id notes:
 *   scope_type VARCHAR('site'|'project') DEFAULT 'site' — forward-scaffolding for M7/M8 project
 *   integration. In M4 only 'site' boards are surfaced publicly.
 *   project_id is nullable with no FK — projects table does not exist yet in M4.
 *   When projects land, add: FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE.
 *
 * forum_topics.deleted_at and forum_posts.deleted_at are soft-delete columns (NULL = active).
 */
export class MilestoneFourForumsFoundation1780890123767 implements MigrationInterface {
  name = "MilestoneFourForumsFoundation1780890123767";

  async up(queryRunner: QueryRunner): Promise<void> {
    // forum_categories — top-level groupings
    await queryRunner.query(`
      CREATE TABLE \`forum_categories\` (
        \`id\` char(36) NOT NULL,
        \`name\` varchar(128) NOT NULL,
        \`description\` varchar(255) NULL,
        \`slug\` varchar(128) NOT NULL,
        \`sort_order\` smallint unsigned NOT NULL DEFAULT 0,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_forum_categories_slug\` (\`slug\`),
        KEY \`idx_forum_categories_sort_order\` (\`sort_order\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // forum_boards — boards within a category
    //
    // scope_type: 'site' (default) or 'project'.
    //   'site'    — site-wide board, visible in the main forum index (M4 active surface).
    //   'project' — project-scoped board (forward-scaffolded for M7/M8; excluded from main index).
    //
    // project_id: nullable, no FK — forward-scaffolding placeholder.
    //   Projects table will be introduced in M7/M8. When it lands, add:
    //   ALTER TABLE forum_boards
    //     ADD CONSTRAINT fk_forum_boards_project_id
    //       FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    //
    // visibility: reuses the site-wide vocabulary (public|unlisted|members|project-only|private)
    //   routed through AuthorizationService.evaluate() at read time (ST3+).
    await queryRunner.query(`
      CREATE TABLE \`forum_boards\` (
        \`id\` char(36) NOT NULL,
        \`category_id\` char(36) NOT NULL,
        \`name\` varchar(128) NOT NULL,
        \`description\` varchar(255) NULL,
        \`slug\` varchar(128) NOT NULL,
        \`scope_type\` varchar(16) NOT NULL DEFAULT 'site',
        \`project_id\` char(36) NULL,
        \`visibility\` varchar(32) NOT NULL DEFAULT 'public',
        \`sort_order\` smallint unsigned NOT NULL DEFAULT 0,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_forum_boards_slug\` (\`slug\`),
        KEY \`idx_forum_boards_category_sort\` (\`category_id\`, \`sort_order\`),
        KEY \`idx_forum_boards_scope_visibility\` (\`scope_type\`, \`visibility\`),
        CONSTRAINT \`fk_forum_boards_category_id\` FOREIGN KEY (\`category_id\`) REFERENCES \`forum_categories\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // forum_topics — threads within a board
    //
    // is_pinned: pinned topics sort first (isPinned DESC, lastPostAt DESC — enforced in service).
    // is_locked: locked topics reject new posts from non-privileged users (ST5).
    // last_post_at: denormalized for efficient sorting; updated on each post create.
    // moved_by_user_id / moved_at: moderation audit — who moved and when (ST6).
    // locked_by_user_id / locked_at: moderation audit — who locked and when (ST6).
    // deleted_at: soft-delete; NULL = active.
    await queryRunner.query(`
      CREATE TABLE \`forum_topics\` (
        \`id\` char(36) NOT NULL,
        \`board_id\` char(36) NOT NULL,
        \`author_user_id\` char(36) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`slug\` varchar(255) NOT NULL,
        \`body\` mediumtext NOT NULL,
        \`is_pinned\` tinyint(1) NOT NULL DEFAULT 0,
        \`is_locked\` tinyint(1) NOT NULL DEFAULT 0,
        \`reply_count\` int unsigned NOT NULL DEFAULT 0,
        \`last_post_at\` datetime(3) NULL,
        \`moved_by_user_id\` char(36) NULL,
        \`moved_at\` datetime(3) NULL,
        \`locked_by_user_id\` char(36) NULL,
        \`locked_at\` datetime(3) NULL,
        \`deleted_at\` datetime(3) NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_forum_topics_board_slug\` (\`board_id\`, \`slug\`),
        KEY \`idx_forum_topics_board_pinned_last_post\` (\`board_id\`, \`is_pinned\`, \`last_post_at\`),
        KEY \`idx_forum_topics_author\` (\`author_user_id\`),
        CONSTRAINT \`fk_forum_topics_board_id\` FOREIGN KEY (\`board_id\`) REFERENCES \`forum_boards\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`fk_forum_topics_author_user_id\` FOREIGN KEY (\`author_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`fk_forum_topics_moved_by_user_id\` FOREIGN KEY (\`moved_by_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`fk_forum_topics_locked_by_user_id\` FOREIGN KEY (\`locked_by_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // forum_posts — replies within a topic
    //
    // parent_id: one-level threading (a reply's parent must be a top-level post on the same topic;
    //   reply-to-a-reply is rejected by the service — mirrors the blog-comment rule).
    //   ON DELETE SET NULL so soft-deleted parents don't cascade-delete children.
    // quoted_post_id: optional reference for quote-a-post (ST5); no FK — posts may be deleted.
    // deleted_at: soft-delete; NULL = active.
    await queryRunner.query(`
      CREATE TABLE \`forum_posts\` (
        \`id\` char(36) NOT NULL,
        \`topic_id\` char(36) NOT NULL,
        \`parent_id\` char(36) NULL,
        \`author_user_id\` char(36) NOT NULL,
        \`body\` mediumtext NOT NULL,
        \`quoted_post_id\` char(36) NULL,
        \`deleted_at\` datetime(3) NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`idx_forum_posts_topic_created\` (\`topic_id\`, \`created_at\`),
        KEY \`idx_forum_posts_topic_parent\` (\`topic_id\`, \`parent_id\`),
        KEY \`idx_forum_posts_author\` (\`author_user_id\`),
        CONSTRAINT \`fk_forum_posts_topic_id\` FOREIGN KEY (\`topic_id\`) REFERENCES \`forum_topics\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_forum_posts_parent_id\` FOREIGN KEY (\`parent_id\`) REFERENCES \`forum_posts\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`fk_forum_posts_author_user_id\` FOREIGN KEY (\`author_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse FK-dependency order
    await queryRunner.query("DROP TABLE IF EXISTS `forum_posts`");
    await queryRunner.query("DROP TABLE IF EXISTS `forum_topics`");
    await queryRunner.query("DROP TABLE IF EXISTS `forum_boards`");
    await queryRunner.query("DROP TABLE IF EXISTS `forum_categories`");
  }
}
