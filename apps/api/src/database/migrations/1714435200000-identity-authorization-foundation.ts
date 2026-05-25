import type { MigrationInterface, QueryRunner } from "typeorm";

export class IdentityAuthorizationFoundation1714435200000 implements MigrationInterface {
  name = "IdentityAuthorizationFoundation1714435200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`users\` (
        \`id\` char(36) NOT NULL,
        \`username\` varchar(32) NOT NULL,
        \`email\` varchar(320) NOT NULL,
        \`display_name\` varchar(80) NULL,
        \`global_role\` varchar(32) NOT NULL DEFAULT 'user',
        \`status\` varchar(32) NOT NULL DEFAULT 'active',
        \`email_verified_at\` datetime(3) NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_users_username\` (\`username\`),
        UNIQUE KEY \`uq_users_email\` (\`email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`auth_identities\` (
        \`id\` char(36) NOT NULL,
        \`user_id\` char(36) NOT NULL,
        \`provider\` varchar(32) NOT NULL,
        \`provider_subject\` varchar(191) NOT NULL,
        \`provider_email\` varchar(320) NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_auth_identities_provider_subject\` (\`provider\`, \`provider_subject\`),
        UNIQUE KEY \`uq_auth_identities_user_provider\` (\`user_id\`, \`provider\`),
        CONSTRAINT \`fk_auth_identities_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`password_authenticators\` (
        \`id\` char(36) NOT NULL,
        \`user_id\` char(36) NOT NULL,
        \`password_hash\` varchar(255) NOT NULL,
        \`password_version\` int unsigned NOT NULL DEFAULT 1,
        \`password_updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_password_authenticators_user_id\` (\`user_id\`),
        CONSTRAINT \`fk_password_authenticators_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`auth_sessions\` (
        \`id\` char(36) NOT NULL,
        \`user_id\` char(36) NOT NULL,
        \`session_token_hash\` char(64) NOT NULL,
        \`csrf_token_hash\` char(64) NULL,
        \`state\` varchar(32) NOT NULL DEFAULT 'active',
        \`last_seen_at\` datetime(3) NOT NULL,
        \`expires_at\` datetime(3) NOT NULL,
        \`revoked_at\` datetime(3) NULL,
        \`ip_address\` varchar(45) NULL,
        \`user_agent\` varchar(512) NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_auth_sessions_session_token_hash\` (\`session_token_hash\`),
        KEY \`idx_auth_sessions_user_state\` (\`user_id\`, \`state\`),
        KEY \`idx_auth_sessions_expires_at\` (\`expires_at\`),
        CONSTRAINT \`fk_auth_sessions_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`email_verifications\` (
        \`id\` char(36) NOT NULL,
        \`user_id\` char(36) NOT NULL,
        \`purpose\` varchar(32) NOT NULL DEFAULT 'primary_email',
        \`token_hash\` char(64) NOT NULL,
        \`expires_at\` datetime(3) NOT NULL,
        \`consumed_at\` datetime(3) NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_email_verifications_token_hash\` (\`token_hash\`),
        KEY \`idx_email_verifications_user_purpose\` (\`user_id\`, \`purpose\`),
        CONSTRAINT \`fk_email_verifications_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`totp_secrets\` (
        \`id\` char(36) NOT NULL,
        \`user_id\` char(36) NOT NULL,
        \`secret_encrypted\` text NOT NULL,
        \`algorithm\` varchar(16) NOT NULL DEFAULT 'SHA1',
        \`digits\` tinyint unsigned NOT NULL DEFAULT 6,
        \`period_seconds\` smallint unsigned NOT NULL DEFAULT 30,
        \`verified_at\` datetime(3) NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_totp_secrets_user_id\` (\`user_id\`),
        CONSTRAINT \`fk_totp_secrets_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`totp_recovery_codes\` (
        \`id\` char(36) NOT NULL,
        \`user_id\` char(36) NOT NULL,
        \`code_hash\` char(64) NOT NULL,
        \`consumed_at\` datetime(3) NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_totp_recovery_codes_code_hash\` (\`code_hash\`),
        KEY \`idx_totp_recovery_codes_user_consumed\` (\`user_id\`, \`consumed_at\`),
        CONSTRAINT \`fk_totp_recovery_codes_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`authorization_grants\` (
        \`id\` char(36) NOT NULL,
        \`subject_user_id\` char(36) NOT NULL,
        \`resource_type\` varchar(64) NOT NULL,
        \`resource_id\` char(36) NOT NULL,
        \`role\` varchar(32) NOT NULL,
        \`granted_by_user_id\` char(36) NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_authorization_grants_subject_resource_role\` (\`subject_user_id\`, \`resource_type\`, \`resource_id\`, \`role\`),
        KEY \`idx_authorization_grants_resource\` (\`resource_type\`, \`resource_id\`),
        CONSTRAINT \`fk_authorization_grants_subject_user_id\` FOREIGN KEY (\`subject_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_authorization_grants_granted_by_user_id\` FOREIGN KEY (\`granted_by_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS `authorization_grants`");
    await queryRunner.query("DROP TABLE IF EXISTS `totp_recovery_codes`");
    await queryRunner.query("DROP TABLE IF EXISTS `totp_secrets`");
    await queryRunner.query("DROP TABLE IF EXISTS `email_verifications`");
    await queryRunner.query("DROP TABLE IF EXISTS `auth_sessions`");
    await queryRunner.query("DROP TABLE IF EXISTS `password_authenticators`");
    await queryRunner.query("DROP TABLE IF EXISTS `auth_identities`");
    await queryRunner.query("DROP TABLE IF EXISTS `users`");
  }
}
