import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from "typeorm";

import { UserEntity } from "../../users/entities/user.entity";
import { PageRevisionEntity } from "./page-revision.entity";

export const standalonePageStatuses = ["draft", "published", "unpublished"] as const;
export type StandalonePageStatus = (typeof standalonePageStatuses)[number];

@Entity("standalone_pages")
@Index("uq_standalone_pages_slug", ["slug"], { unique: true })
@Index("idx_standalone_pages_status", ["status"])
export class StandalonePageEntity {
  @PrimaryColumn("char", { length: 36 })
  id!: string;

  @Column("char", { name: "created_by_user_id", length: 36 })
  createdByUserId!: string;

  @Column("varchar", { length: 255 })
  title!: string;

  @Column("varchar", { length: 255 })
  slug!: string;

  @Column("varchar", { length: 32, default: "draft" })
  status!: StandalonePageStatus;

  @Column("datetime", { name: "published_at", precision: 3, nullable: true })
  publishedAt!: Date | null;

  @Column("char", { name: "current_revision_id", length: 36, nullable: true })
  currentRevisionId!: string | null;

  /**
   * Relation for the current revision. The FK constraint already exists in the
   * milestone-three content migration; `createForeignKeyConstraints: false`
   * prevents TypeORM from generating a duplicate constraint or migration diff.
   * Use `relations: ["currentRevision"]` to eager-load via the ORM.
   */
  @ManyToOne(() => PageRevisionEntity, { nullable: true, onDelete: "SET NULL", createForeignKeyConstraints: false })
  @JoinColumn({ name: "current_revision_id" })
  currentRevision!: PageRevisionEntity | null;

  @Column("datetime", { name: "created_at", precision: 3, default: () => "CURRENT_TIMESTAMP(3)" })
  createdAt!: Date;

  @Column("datetime", {
    name: "updated_at",
    precision: 3,
    default: () => "CURRENT_TIMESTAMP(3)",
    onUpdate: "CURRENT_TIMESTAMP(3)"
  })
  updatedAt!: Date;

  @ManyToOne(() => UserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "created_by_user_id" })
  createdByUser!: UserEntity;

  @OneToMany(() => PageRevisionEntity, (revision) => revision.page)
  revisions!: PageRevisionEntity[];
}
