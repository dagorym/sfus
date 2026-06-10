import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Forum schema: widen description columns on forum_categories and forum_boards.
 *
 * Extends description from varchar(255) to varchar(512) on both tables
 * to accommodate longer board/category descriptions without truncation.
 * Both columns remain NULL-able, matching the existing schema contract.
 *
 * MySQL 5.7.44-compatible DDL.
 */
export class ForumDescriptionLength1780893000000 implements MigrationInterface {
  name = "ForumDescriptionLength1780893000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`forum_categories\`
        MODIFY COLUMN \`description\` varchar(512) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`forum_boards\`
        MODIFY COLUMN \`description\` varchar(512) NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`forum_boards\`
        MODIFY COLUMN \`description\` varchar(255) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`forum_categories\`
        MODIFY COLUMN \`description\` varchar(255) NULL
    `);
  }
}
