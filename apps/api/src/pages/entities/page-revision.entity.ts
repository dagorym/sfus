import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";

import { MediaReferenceEntity } from "../../media/entities/media-reference.entity";
import { UserEntity } from "../../users/entities/user.entity";
import { StandalonePageEntity } from "./standalone-page.entity";

@Entity("page_revisions")
@Index("uq_page_revisions_page_revision_number", ["pageId", "revisionNumber"], { unique: true })
@Index("idx_page_revisions_page_created", ["pageId", "createdAt"])
export class PageRevisionEntity {
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

  @Column("varchar", { name: "summary", length: 512, nullable: true })
  summary!: string | null;

  @Column("mediumtext")
  body!: string;

  @Column("varchar", { name: "change_note", length: 512, nullable: true })
  changeNote!: string | null;

  @Column("char", { name: "featured_media_id", length: 36, nullable: true })
  featuredMediaId!: string | null;

  @Column("int", { name: "revision_number", unsigned: true })
  revisionNumber!: number;

  @Column("datetime", { name: "created_at", precision: 3, default: () => "CURRENT_TIMESTAMP(3)" })
  createdAt!: Date;

  @ManyToOne(() => StandalonePageEntity, (page) => page.revisions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "page_id" })
  page!: StandalonePageEntity;

  @ManyToOne(() => UserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "author_user_id" })
  author!: UserEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "editor_user_id" })
  editorUser!: UserEntity | null;

  @ManyToOne(() => MediaReferenceEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "featured_media_id" })
  featuredMedia!: MediaReferenceEntity | null;
}
