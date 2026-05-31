import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { MediaReferenceEntity } from "./entities/media-reference.entity";

@Module({
  imports: [TypeOrmModule.forFeature([MediaReferenceEntity])],
  exports: [TypeOrmModule]
})
export class MediaModule {}
