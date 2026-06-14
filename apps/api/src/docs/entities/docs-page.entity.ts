import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from "typeorm";

import { UserEntity } from "../../users/entities/user.entity";
import { DocsRevisionEntity } from "./docs-revision.entity";
import type { DocsScopeType, DocsPageStatus, DocsVisibility } from "../docs.types";

@Entity("docs_pages")
@Index("uq_docs_pages_scope_path_hash", ["scopeType", "scopeId", "pathHash"], { unique: true })
@Index("idx_docs_pages_parent_id", ["parentId"])
@Index("idx_docs_pages_scope_status", ["scopeType", "scopeId", "status"])
export class DocsPageEntity {
  @PrimaryColumn("char", { length: 36 })
  id!: string;

  @Column("varchar", { name: "scope_type", length: 32, default: "site" })
  scopeType!: DocsScopeType;

  @Column("char", { name: "scope_id", length: 36, nullable: true })
  scopeId!: string | null;

  @Column("varchar", { length: 255 })
  title!: string;

  @Column("varchar", { length: 255 })
  slug!: string;

  @Column("varchar", { length: 1024 })
  path!: string;

  @Column("char", { name: "path_hash", length: 64 })
  pathHash!: string;

  @Column("char", { name: "parent_id", length: 36, nullable: true })
  parentId!: string | null;

  @Column("int", { name: "depth", unsigned: true, default: 0 })
  depth!: number;

  @Column("varchar", { length: 32, default: "public" })
  visibility!: DocsVisibility;

  @Column("varchar", { length: 32, default: "published" })
  status!: DocsPageStatus;

  // Soft-lock columns
  @Column("tinyint", { name: "is_locked", default: 0 })
  isLocked!: number;

  @Column("char", { name: "locked_by_user_id", length: 36, nullable: true })
  lockedByUserId!: string | null;

  @Column("datetime", { name: "locked_at", precision: 3, nullable: true })
  lockedAt!: Date | null;

  @Column("datetime", { name: "lock_expires_at", precision: 3, nullable: true })
  lockExpiresAt!: Date | null;

  @Column("char", { name: "current_revision_id", length: 36, nullable: true })
  currentRevisionId!: string | null;

  @Column("char", { name: "created_by_user_id", length: 36 })
  createdByUserId!: string;

  @Column("datetime", { name: "created_at", precision: 3, default: () => "CURRENT_TIMESTAMP(3)" })
  createdAt!: Date;

  @Column("datetime", {
    name: "updated_at",
    precision: 3,
    default: () => "CURRENT_TIMESTAMP(3)",
    onUpdate: "CURRENT_TIMESTAMP(3)"
  })
  updatedAt!: Date;

  /**
   * Relation for the current revision. The FK constraint is created in the migration;
   * `createForeignKeyConstraints: false` prevents TypeORM from generating a duplicate
   * constraint. Use `relations: ["currentRevision"]` to eager-load via the ORM.
   */
  @ManyToOne(() => DocsRevisionEntity, { nullable: true, onDelete: "SET NULL", createForeignKeyConstraints: false })
  @JoinColumn({ name: "current_revision_id" })
  currentRevision!: DocsRevisionEntity | null;

  @OneToMany(() => DocsRevisionEntity, (revision) => revision.page)
  revisions!: DocsRevisionEntity[];

  @ManyToOne(() => UserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "created_by_user_id" })
  createdByUser!: UserEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "locked_by_user_id" })
  lockedByUser!: UserEntity | null;
}
