import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { UsersModule } from "../users/users.module";
import { AuthService } from "./auth.service";
import { AuthIdentityEntity } from "./entities/auth-identity.entity";
import { AuthSessionEntity } from "./entities/auth-session.entity";
import { EmailVerificationEntity } from "./entities/email-verification.entity";
import { PasswordAuthenticatorEntity } from "./entities/password-authenticator.entity";
import { TotpRecoveryCodeEntity } from "./entities/totp-recovery-code.entity";
import { TotpSecretEntity } from "./entities/totp-secret.entity";

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([
      AuthIdentityEntity,
      PasswordAuthenticatorEntity,
      AuthSessionEntity,
      EmailVerificationEntity,
      TotpSecretEntity,
      TotpRecoveryCodeEntity
    ])
  ],
  providers: [AuthService],
  exports: [TypeOrmModule, AuthService]
})
export class AuthModule {}
