import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from "typeorm";

export const navigationLinkTypes = ["internal", "external"] as const;
export type NavigationLinkType = (typeof navigationLinkTypes)[number];

export const navigationVisibilities = ["public", "authenticated", "admin"] as const;
export type NavigationVisibility = (typeof navigationVisibilities)[number];

@Entity("navigation_items")
@Index("idx_navigation_items_parent_sort", ["parentId", "sortOrder"])
export class NavigationItemEntity {
  @PrimaryColumn("char", { length: 36 })
  id!: string;

  @Column("char", { name: "parent_id", length: 36, nullable: true })
  parentId!: string | null;

  @Column("varchar", { length: 128 })
  label!: string;

  @Column("varchar", { name: "link_type", length: 16, default: "internal" })
  linkType!: NavigationLinkType;

  @Column("varchar", { length: 512 })
  url!: string;

  @Column("varchar", { length: 32, default: "public" })
  visibility!: NavigationVisibility;

  @Column("smallint", { name: "sort_order", unsigned: true, default: 0 })
  sortOrder!: number;

  @Column("tinyint", { name: "is_active", width: 1, default: 1 })
  isActive!: boolean;

  @Column("datetime", { name: "created_at", precision: 3, default: () => "CURRENT_TIMESTAMP(3)" })
  createdAt!: Date;

  @Column("datetime", {
    name: "updated_at",
    precision: 3,
    default: () => "CURRENT_TIMESTAMP(3)",
    onUpdate: "CURRENT_TIMESTAMP(3)"
  })
  updatedAt!: Date;

  @ManyToOne(() => NavigationItemEntity, (item) => item.children, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "parent_id" })
  parent!: NavigationItemEntity | null;

  @OneToMany(() => NavigationItemEntity, (item) => item.parent)
  children!: NavigationItemEntity[];
}
