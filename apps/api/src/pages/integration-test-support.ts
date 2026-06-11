/**
 * Integration-test bootstrap helper for PagesService real-DB tests.
 *
 * This module is ONLY imported by *.integration.test.ts files. It has no
 * production code path and must never be imported by the application module
 * graph.
 *
 * It builds a bare TypeORM DataSource from the documented DB_* env-contract
 * (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD) and returns
 * repository handles for standalone_pages and page_revisions so the tests
 * can exercise PagesService against the real migrated schema.
 */

import crypto from "node:crypto";

import { DataSource } from "typeorm";

import { PageRevisionEntity } from "./entities/page-revision.entity";
import { StandalonePageEntity } from "./entities/standalone-page.entity";
import { UserEntity } from "../users/entities/user.entity";
import { AuthIdentityEntity } from "../auth/entities/auth-identity.entity";
import { AuthSessionEntity } from "../auth/entities/auth-session.entity";
import { EmailVerificationEntity } from "../auth/entities/email-verification.entity";
import { PasswordAuthenticatorEntity } from "../auth/entities/password-authenticator.entity";
import { TotpRecoveryCodeEntity } from "../auth/entities/totp-recovery-code.entity";
import { TotpSecretEntity } from "../auth/entities/totp-secret.entity";
import { AuthorizationGrantEntity } from "../authorization/entities/authorization-grant.entity";
import { MediaReferenceEntity } from "../media/entities/media-reference.entity";
import { BlogCommentEntity } from "../blog/entities/blog-comment.entity";
import { BlogPostEntity } from "../blog/entities/blog-post.entity";
import { BlogPostTagEntity } from "../blog/entities/blog-post-tag.entity";
import { NavigationItemEntity } from "../navigation/entities/navigation-item.entity";
import { DocsPageEntity } from "../docs/entities/docs-page.entity";
import { DocsRevisionEntity } from "../docs/entities/docs-revision.entity";

/** DB connection options read from environment variables. */
export interface IntegrationDbOptions {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
}

/**
 * Read DB connection options from the documented env contract.
 *
 * Defaults for local host-run hybrid dev match docs/operations/launch.md:
 *   DB_HOST=127.0.0.1, DB_PORT=3306, DB_NAME=sfus
 *
 * NOTE: DB_USER and DB_PASSWORD have no safe fallback value and MUST be
 * provided explicitly.  If either is missing the DataSource will fail to
 * connect with a generic authentication error from the MySQL driver.  Set
 * both variables before running the integration suite:
 *   DB_USER=sfus DB_PASSWORD=changeme-app
 */
export function readDbOptionsFromEnv(): IntegrationDbOptions {
  return {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: parseInt(process.env.DB_PORT ?? "3306", 10),
    name: process.env.DB_NAME ?? "sfus",
    user: process.env.DB_USER ?? "",
    password: process.env.DB_PASSWORD ?? ""
  };
}

/**
 * Create and initialize a TypeORM DataSource backed by the real MySQL
 * database described by the env-contract variables.
 *
 * All reviewed entity classes are registered so foreign-key relationships
 * resolve correctly. The DataSource is NOT a NestJS module — it is a plain
 * TypeORM connection suitable for use in test setup/teardown.
 *
 * Callers are responsible for calling `dataSource.destroy()` after tests.
 */
export async function createIntegrationDataSource(
  opts: IntegrationDbOptions
): Promise<DataSource> {
  const ds = new DataSource({
    type: "mysql",
    host: opts.host,
    port: opts.port,
    username: opts.user,
    password: opts.password,
    database: opts.name,
    charset: "utf8mb4",
    synchronize: false,
    logging: false,
    migrationsRun: false,
    entities: [
      UserEntity,
      AuthIdentityEntity,
      PasswordAuthenticatorEntity,
      AuthSessionEntity,
      EmailVerificationEntity,
      TotpSecretEntity,
      TotpRecoveryCodeEntity,
      AuthorizationGrantEntity,
      MediaReferenceEntity,
      BlogPostEntity,
      BlogPostTagEntity,
      BlogCommentEntity,
      StandalonePageEntity,
      PageRevisionEntity,
      NavigationItemEntity,
      DocsPageEntity,
      DocsRevisionEntity
    ],
    extra: {
      connectionLimit: 2,
      connectTimeout: 5000
    }
  });

  await ds.initialize();
  return ds;
}

/**
 * Insert a minimal throwaway user row sufficient to satisfy FK constraints
 * on standalone_pages.created_by_user_id and page_revisions.author_user_id.
 *
 * Returns the inserted user's id. Callers must delete the user after tests
 * (cascade deletes on dependent tables handle child rows automatically).
 */
export async function insertThrowawayUser(ds: DataSource): Promise<string> {
  const userId = crypto.randomUUID();
  const userRepo = ds.getRepository(UserEntity);
  const suffix = userId.slice(0, 8);
  await userRepo.save(
    userRepo.create({
      id: userId,
      username: `it-user-${suffix}`,
      email: `it-${suffix}@integration.test.invalid`,
      displayName: null,
      globalRole: "admin",
      status: "active",
      emailVerifiedAt: new Date()
    })
  );
  return userId;
}

/**
 * Remove throwaway rows created during an integration test run.
 * Deletes standalone_pages rows by id (cascade removes page_revisions).
 * Deletes the throwaway user by id.
 */
export async function cleanupThrowawayRows(
  ds: DataSource,
  pageIds: string[],
  userIds: string[]
): Promise<void> {
  const pageRepo = ds.getRepository(StandalonePageEntity);
  const userRepo = ds.getRepository(UserEntity);

  for (const pageId of pageIds) {
    // Set current_revision_id to null first to avoid FK cycle on delete.
    await ds.query(
      "UPDATE standalone_pages SET current_revision_id = NULL WHERE id = ?",
      [pageId]
    );
    await pageRepo.delete({ id: pageId });
  }

  for (const userId of userIds) {
    await userRepo.delete({ id: userId });
  }
}
