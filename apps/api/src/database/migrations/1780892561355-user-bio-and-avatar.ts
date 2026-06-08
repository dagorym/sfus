import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Milestone 4 — Users schema: bio + avatar_media_id.
 *
 * Adds two nullable columns to the `users` table:
 *   bio            TEXT NULL            — free-form user bio (surfaced on the public profile, D6).
 *   avatar_media_id CHAR(36) NULL FK → media_references(id) ON DELETE SET NULL
 *                                     — resolved avatar (AV1; set via ST15, served as /api/media/:id).
 *
 * MySQL 5.7.44-compatible DDL.
 */
export class UserBioAndAvatar1780892561355 implements MigrationInterface {
  name = "UserBioAndAvatar1780892561355";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`users\`
        ADD COLUMN \`bio\` text NULL,
        ADD COLUMN \`avatar_media_id\` char(36) NULL,
        ADD CONSTRAINT \`fk_users_avatar_media_id\`
          FOREIGN KEY (\`avatar_media_id\`) REFERENCES \`media_references\` (\`id\`) ON DELETE SET NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`users\`
        DROP FOREIGN KEY \`fk_users_avatar_media_id\`,
        DROP COLUMN \`avatar_media_id\`,
        DROP COLUMN \`bio\`
    `);
  }
}
