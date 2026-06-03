import type { MigrationInterface, QueryRunner } from "typeorm";

export class MilestoneThreeContentFoundation1748736000000 implements MigrationInterface {
  name = "MilestoneThreeContentFoundation1748736000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // media_references – shared table referenced by blog posts, pages, and comments
    await queryRunner.query(`
      CREATE TABLE \`media_references\` (
        \`id\` char(36) NOT NULL,
        \`owner_user_id\` char(36) NOT NULL,
        \`resource_type\` varchar(64) NOT NULL,
        \`resource_id\` char(36) NULL,
        \`storage_key\` varchar(512) NOT NULL,
        \`original_filename\` varchar(255) NOT NULL,
        \`mime_type\` varchar(128) NOT NULL,
        \`size_bytes\` int unsigned NOT NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`idx_media_references_resource\` (\`resource_type\`, \`resource_id\`),
        KEY \`idx_media_references_owner\` (\`owner_user_id\`),
        CONSTRAINT \`fk_media_references_owner_user_id\` FOREIGN KEY (\`owner_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // blog_posts
    await queryRunner.query(`
      CREATE TABLE \`blog_posts\` (
        \`id\` char(36) NOT NULL,
        \`author_user_id\` char(36) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`slug\` varchar(255) NOT NULL,
        \`summary\` varchar(512) NULL,
        \`body\` mediumtext NOT NULL,
        \`status\` varchar(32) NOT NULL DEFAULT 'draft',
        \`is_featured\` tinyint(1) NOT NULL DEFAULT 0,
        \`comments_locked\` tinyint(1) NOT NULL DEFAULT 0,
        \`featured_image_id\` char(36) NULL,
        \`published_at\` datetime(3) NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_blog_posts_slug\` (\`slug\`),
        KEY \`idx_blog_posts_status_published_at\` (\`status\`, \`published_at\`),
        KEY \`idx_blog_posts_author\` (\`author_user_id\`),
        CONSTRAINT \`fk_blog_posts_author_user_id\` FOREIGN KEY (\`author_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`fk_blog_posts_featured_image_id\` FOREIGN KEY (\`featured_image_id\`) REFERENCES \`media_references\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // blog_post_tags – simple tag association
    await queryRunner.query(`
      CREATE TABLE \`blog_post_tags\` (
        \`post_id\` char(36) NOT NULL,
        \`tag\` varchar(64) NOT NULL,
        PRIMARY KEY (\`post_id\`, \`tag\`),
        CONSTRAINT \`fk_blog_post_tags_post_id\` FOREIGN KEY (\`post_id\`) REFERENCES \`blog_posts\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // blog_comments
    await queryRunner.query(`
      CREATE TABLE \`blog_comments\` (
        \`id\` char(36) NOT NULL,
        \`post_id\` char(36) NOT NULL,
        \`parent_id\` char(36) NULL,
        \`author_user_id\` char(36) NOT NULL,
        \`body\` text NOT NULL,
        \`status\` varchar(32) NOT NULL DEFAULT 'visible',
        \`media_reference_id\` char(36) NULL,
        \`moderated_by_user_id\` char(36) NULL,
        \`moderated_at\` datetime(3) NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`idx_blog_comments_post_status\` (\`post_id\`, \`status\`),
        KEY \`idx_blog_comments_author\` (\`author_user_id\`),
        KEY \`idx_blog_comments_parent\` (\`parent_id\`),
        CONSTRAINT \`fk_blog_comments_post_id\` FOREIGN KEY (\`post_id\`) REFERENCES \`blog_posts\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_blog_comments_parent_id\` FOREIGN KEY (\`parent_id\`) REFERENCES \`blog_comments\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_blog_comments_author_user_id\` FOREIGN KEY (\`author_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`fk_blog_comments_media_reference_id\` FOREIGN KEY (\`media_reference_id\`) REFERENCES \`media_references\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`fk_blog_comments_moderated_by_user_id\` FOREIGN KEY (\`moderated_by_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // standalone_pages
    await queryRunner.query(`
      CREATE TABLE \`standalone_pages\` (
        \`id\` char(36) NOT NULL,
        \`created_by_user_id\` char(36) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`slug\` varchar(255) NOT NULL,
        \`status\` varchar(32) NOT NULL DEFAULT 'draft',
        \`published_at\` datetime(3) NULL,
        \`current_revision_id\` char(36) NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_standalone_pages_slug\` (\`slug\`),
        KEY \`idx_standalone_pages_status\` (\`status\`),
        CONSTRAINT \`fk_standalone_pages_created_by_user_id\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // page_revisions
    await queryRunner.query(`
      CREATE TABLE \`page_revisions\` (
        \`id\` char(36) NOT NULL,
        \`page_id\` char(36) NOT NULL,
        \`author_user_id\` char(36) NOT NULL,
        \`editor_user_id\` char(36) NULL,
        \`title\` varchar(255) NOT NULL,
        \`summary\` varchar(512) NULL,
        \`body\` mediumtext NOT NULL,
        \`change_note\` varchar(512) NULL,
        \`featured_media_id\` char(36) NULL,
        \`revision_number\` int unsigned NOT NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_page_revisions_page_revision_number\` (\`page_id\`, \`revision_number\`),
        KEY \`idx_page_revisions_page_created\` (\`page_id\`, \`created_at\`),
        CONSTRAINT \`fk_page_revisions_page_id\` FOREIGN KEY (\`page_id\`) REFERENCES \`standalone_pages\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_page_revisions_author_user_id\` FOREIGN KEY (\`author_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`fk_page_revisions_editor_user_id\` FOREIGN KEY (\`editor_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`fk_page_revisions_featured_media_id\` FOREIGN KEY (\`featured_media_id\`) REFERENCES \`media_references\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Add current_revision_id FK after page_revisions table exists
    await queryRunner.query(`
      ALTER TABLE \`standalone_pages\`
        ADD CONSTRAINT \`fk_standalone_pages_current_revision_id\`
          FOREIGN KEY (\`current_revision_id\`) REFERENCES \`page_revisions\` (\`id\`) ON DELETE SET NULL
    `);

    // navigation_items
    await queryRunner.query(`
      CREATE TABLE \`navigation_items\` (
        \`id\` char(36) NOT NULL,
        \`parent_id\` char(36) NULL,
        \`label\` varchar(128) NOT NULL,
        \`link_type\` varchar(16) NOT NULL DEFAULT 'internal',
        \`url\` varchar(512) NOT NULL,
        \`visibility\` varchar(32) NOT NULL DEFAULT 'public',
        \`sort_order\` smallint unsigned NOT NULL DEFAULT 0,
        \`is_active\` tinyint(1) NOT NULL DEFAULT 1,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`idx_navigation_items_parent_sort\` (\`parent_id\`, \`sort_order\`),
        CONSTRAINT \`fk_navigation_items_parent_id\` FOREIGN KEY (\`parent_id\`) REFERENCES \`navigation_items\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS `navigation_items`");
    await queryRunner.query("ALTER TABLE `standalone_pages` DROP FOREIGN KEY `fk_standalone_pages_current_revision_id`");
    await queryRunner.query("DROP TABLE IF EXISTS `page_revisions`");
    await queryRunner.query("DROP TABLE IF EXISTS `standalone_pages`");
    await queryRunner.query("DROP TABLE IF EXISTS `blog_comments`");
    await queryRunner.query("DROP TABLE IF EXISTS `blog_post_tags`");
    await queryRunner.query("DROP TABLE IF EXISTS `blog_posts`");
    await queryRunner.query("DROP TABLE IF EXISTS `media_references`");
  }
}
