import type { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { DataSource, type DataSourceOptions, type MigrationInterface } from "typeorm";

import type { ApplicationEnvironment } from "../config/environment";
import { AuthIdentityEntity } from "../auth/entities/auth-identity.entity";
import { AuthSessionEntity } from "../auth/entities/auth-session.entity";
import { EmailVerificationEntity } from "../auth/entities/email-verification.entity";
import { PasswordAuthenticatorEntity } from "../auth/entities/password-authenticator.entity";
import { TotpRecoveryCodeEntity } from "../auth/entities/totp-recovery-code.entity";
import { TotpSecretEntity } from "../auth/entities/totp-secret.entity";
import { AuthorizationGrantEntity } from "../authorization/entities/authorization-grant.entity";
import { FoundationBaseline1711843200000 } from "./migrations/1711843200000-foundation-baseline";
import { IdentityAuthorizationFoundation1714435200000 } from "./migrations/1714435200000-identity-authorization-foundation";
import { UserEntity } from "../users/entities/user.entity";

const reviewedMigrationClasses = [
  FoundationBaseline1711843200000,
  IdentityAuthorizationFoundation1714435200000
];

const reviewedEntityClasses = [
  UserEntity,
  AuthIdentityEntity,
  PasswordAuthenticatorEntity,
  AuthSessionEntity,
  EmailVerificationEntity,
  TotpSecretEntity,
  TotpRecoveryCodeEntity,
  AuthorizationGrantEntity
];

export const reviewedMigrationNames = reviewedMigrationClasses.map((MigrationClass) => {
  const migration = new MigrationClass() as MigrationInterface & { name?: string };
  return migration.name || MigrationClass.name;
});

export const createDataSourceOptions = (
  environment: ApplicationEnvironment
): DataSourceOptions => {
  return {
    type: "mysql",
    host: environment.db.host,
    port: environment.db.port,
    username: environment.db.user,
    password: environment.db.password,
    database: environment.db.name,
    charset: "utf8mb4",
    synchronize: false,
    logging: false,
    migrationsRun: false,
    migrationsTableName: environment.db.migrationsTableName,
    migrations: reviewedMigrationClasses,
    entities: reviewedEntityClasses,
    extra: {
      connectionLimit: 5,
      connectTimeout: environment.db.connectTimeoutMs
    }
  };
};

export const createNestDataSourceOptions = (
  environment: ApplicationEnvironment
): TypeOrmModuleOptions => {
  return {
    ...createDataSourceOptions(environment),
    autoLoadEntities: false,
    retryAttempts: 0,
    manualInitialization: true
  };
};

export const createMigrationDataSource = (environment: ApplicationEnvironment): DataSource => {
  return new DataSource(createDataSourceOptions(environment));
};
