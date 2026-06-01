import type { MigrationInterface, QueryRunner } from "typeorm";

export class NavigationItems1748736000001 implements MigrationInterface {
  name = "NavigationItems1748736000001";

  async up(queryRunner: QueryRunner): Promise<void> {
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
    await queryRunner.query(`DROP TABLE \`navigation_items\``);
  }
}
