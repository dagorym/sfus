import { Column, Entity, Index, OneToMany, PrimaryColumn } from "typeorm";

import { ForumBoardEntity } from "./forum-board.entity";

@Entity("forum_categories")
@Index("uq_forum_categories_slug", ["slug"], { unique: true })
@Index("idx_forum_categories_sort_order", ["sortOrder"])
export class ForumCategoryEntity {
  @PrimaryColumn("char", { length: 36 })
  id!: string;

  @Column("varchar", { length: 128 })
  name!: string;

  @Column("varchar", { length: 255, nullable: true })
  description!: string | null;

  @Column("varchar", { length: 128 })
  slug!: string;

  @Column("smallint", { name: "sort_order", unsigned: true, default: 0 })
  sortOrder!: number;

  @Column("datetime", { name: "created_at", precision: 3, default: () => "CURRENT_TIMESTAMP(3)" })
  createdAt!: Date;

  @Column("datetime", {
    name: "updated_at",
    precision: 3,
    default: () => "CURRENT_TIMESTAMP(3)",
    onUpdate: "CURRENT_TIMESTAMP(3)"
  })
  updatedAt!: Date;

  @OneToMany(() => ForumBoardEntity, (board) => board.category)
  boards!: ForumBoardEntity[];
}
