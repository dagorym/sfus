import { Column, Entity, Index, OneToMany, PrimaryColumn } from "typeorm";

import { AuthIdentityEntity } from "../../auth/entities/auth-identity.entity";
import { AuthSessionEntity } from "../../auth/entities/auth-session.entity";
import { EmailVerificationEntity } from "../../auth/entities/email-verification.entity";
import { PasswordAuthenticatorEntity } from "../../auth/entities/password-authenticator.entity";
import { TotpRecoveryCodeEntity } from "../../auth/entities/totp-recovery-code.entity";
import { TotpSecretEntity } from "../../auth/entities/totp-secret.entity";
import { AuthorizationGrantEntity } from "../../authorization/entities/authorization-grant.entity";

@Entity("users")
@Index("uq_users_username", ["username"], { unique: true })
@Index("uq_users_email", ["email"], { unique: true })
export class UserEntity {
  @PrimaryColumn("char", { length: 36 })
  id!: string;

  @Column("varchar", { length: 32 })
  username!: string;

  @Column("varchar", { length: 320 })
  email!: string;

  @Column("varchar", { name: "display_name", length: 80, nullable: true })
  displayName!: string | null;

  @Column("varchar", { name: "global_role", length: 32, default: "user" })
  globalRole!: string;

  @Column("varchar", { length: 32, default: "active" })
  status!: string;

  @Column("datetime", { name: "email_verified_at", precision: 3, nullable: true })
  emailVerifiedAt!: Date | null;

  @Column("datetime", { name: "created_at", precision: 3, default: () => "CURRENT_TIMESTAMP(3)" })
  createdAt!: Date;

  @Column("datetime", {
    name: "updated_at",
    precision: 3,
    default: () => "CURRENT_TIMESTAMP(3)",
    onUpdate: "CURRENT_TIMESTAMP(3)"
  })
  updatedAt!: Date;

  @OneToMany(() => AuthIdentityEntity, (identity) => identity.user)
  authIdentities!: AuthIdentityEntity[];

  @OneToMany(() => PasswordAuthenticatorEntity, (authenticator) => authenticator.user)
  passwordAuthenticators!: PasswordAuthenticatorEntity[];

  @OneToMany(() => AuthSessionEntity, (session) => session.user)
  sessions!: AuthSessionEntity[];

  @OneToMany(() => EmailVerificationEntity, (verification) => verification.user)
  emailVerifications!: EmailVerificationEntity[];

  @OneToMany(() => TotpSecretEntity, (totpSecret) => totpSecret.user)
  totpSecrets!: TotpSecretEntity[];

  @OneToMany(() => TotpRecoveryCodeEntity, (recoveryCode) => recoveryCode.user)
  recoveryCodes!: TotpRecoveryCodeEntity[];

  @OneToMany(() => AuthorizationGrantEntity, (grant) => grant.subjectUser)
  authorizationGrants!: AuthorizationGrantEntity[];
}
