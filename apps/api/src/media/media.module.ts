import { DynamicModule, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { API_ENVIRONMENT } from "../config/config.constants";
import type { ApplicationEnvironment } from "../config/environment";
import { MediaReferenceEntity } from "./entities/media-reference.entity";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";

@Module({})
export class MediaModule {
  static register(environment: ApplicationEnvironment): DynamicModule {
    return {
      module: MediaModule,
      imports: [
        TypeOrmModule.forFeature([MediaReferenceEntity]),
        AuthModule.register(environment)
      ],
      controllers: [MediaController],
      providers: [
        MediaService,
        {
          provide: API_ENVIRONMENT,
          useValue: environment
        }
      ],
      exports: [MediaService, TypeOrmModule]
    };
  }
}
