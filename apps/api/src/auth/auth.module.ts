import { DynamicModule, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { API_ENVIRONMENT } from "../config/config.constants";
import type { ApplicationEnvironment } from "../config/environment";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthIdentityEntity } from "./entities/auth-identity.entity";
import { AuthSessionEntity } from "./entities/auth-session.entity";
import { EmailVerificationEntity } from "./entities/email-verification.entity";
import { PasswordAuthenticatorEntity } from "./entities/password-authenticator.entity";
import { TotpRecoveryCodeEntity } from "./entities/totp-recovery-code.entity";
import { TotpSecretEntity } from "./entities/totp-secret.entity";

@Module({})
export class AuthModule {
  static register(environment: ApplicationEnvironment): DynamicModule {
    return {
      module: AuthModule,
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
      controllers: [AuthController],
      providers: [
        AuthService,
        {
          provide: API_ENVIRONMENT,
          useValue: environment
        }
      ],
      exports: [TypeOrmModule, AuthService]
    };
  }
}
