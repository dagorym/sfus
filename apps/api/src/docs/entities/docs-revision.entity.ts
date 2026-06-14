import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";

import { UserEntity } from "../../users/entities/user.entity";
import { DocsPageEntity } from "./docs-page.entity";

@Entity("docs_revisions")
@Index("uq_docs_revisions_page_revision_number", ["pageId", "revisionNumber"], { unique: true })
@Index("idx_docs_revisions_page_created", ["pageId", "createdAt"])
export class DocsRevisionEntity {
  @PrimaryColumn("char", { length: 36 })
  id!: string;

  @Column("char", { name: "page_id", length: 36 })
  pageId!: string;

  @Column("char", { name: "author_user_id", length: 36 })
  authorUserId!: string;

  @Column("char", { name: "editor_user_id", length: 36, nullable: true })
  editorUserId!: string | null;

  @Column("varchar", { length: 255 })
  title!: string;

  @Column("mediumtext")
  body!: string;

  @Column("varchar", { name: "summary", length: 512, nullable: true })
  summary!: string | null;

  @Column("int", { name: "revision_number", unsigned: true })
  revisionNumber!: number;

  @Column("datetime", { name: "created_at", precision: 3, default: () => "CURRENT_TIMESTAMP(3)" })
  createdAt!: Date;

  /**
   * FK to docs_pages. The FK constraint is created in the migration; TypeORM
   * `createForeignKeyConstraints: false` on the DocsPageEntity.currentRevision side
   * prevents a duplicate constraint for the circular FK.
   */
  @ManyToOne(() => DocsPageEntity, (page) => page.revisions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "page_id" })
  page!: DocsPageEntity;

  @ManyToOne(() => UserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "author_user_id" })
  author!: UserEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "editor_user_id" })
  editorUser!: UserEntity | null;
}
