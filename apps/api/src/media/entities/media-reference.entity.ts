import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";

import { UserEntity } from "../../users/entities/user.entity";

@Entity("media_references")
@Index("idx_media_references_resource", ["resourceType", "resourceId"])
@Index("idx_media_references_owner", ["ownerUserId"])
export class MediaReferenceEntity {
  @PrimaryColumn("char", { length: 36 })
  id!: string;

  @Column("char", { name: "owner_user_id", length: 36 })
  ownerUserId!: string;

  @Column("varchar", { name: "resource_type", length: 64 })
  resourceType!: string;

  @Column("char", { name: "resource_id", length: 36, nullable: true })
  resourceId!: string | null;

  @Column("varchar", { name: "storage_key", length: 512 })
  storageKey!: string;

  @Column("varchar", { name: "original_filename", length: 255 })
  originalFilename!: string;

  @Column("varchar", { name: "mime_type", length: 128 })
  mimeType!: string;

  @Column("int", { name: "size_bytes", unsigned: true })
  sizeBytes!: number;

  @Column("datetime", { name: "created_at", precision: 3, default: () => "CURRENT_TIMESTAMP(3)" })
  createdAt!: Date;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "owner_user_id" })
  ownerUser!: UserEntity;
}
