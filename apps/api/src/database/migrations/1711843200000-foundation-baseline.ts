import type { MigrationInterface, QueryRunner } from "typeorm";

export class FoundationBaseline1711843200000 implements MigrationInterface {
  name = "FoundationBaseline1711843200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
    // Intentionally empty: Milestone 1 foundation establishes an explicit reviewed migration baseline
    // before any product schema is introduced in later milestones.
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
    // Forward-fix is the production rollback policy for Milestone 1.
  }
}
