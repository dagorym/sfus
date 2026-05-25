import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";

import { UserEntity } from "../../users/entities/user.entity";

@Entity("authorization_grants")
@Index("uq_authorization_grants_subject_resource_role", ["subjectUserId", "resourceType", "resourceId", "role"], {
  unique: true
})
@Index("idx_authorization_grants_resource", ["resourceType", "resourceId"])
export class AuthorizationGrantEntity {
  @PrimaryColumn("char", { length: 36 })
  id!: string;

  @Column("char", { name: "subject_user_id", length: 36 })
  subjectUserId!: string;

  @Column("varchar", { name: "resource_type", length: 64 })
  resourceType!: string;

  @Column("char", { name: "resource_id", length: 36 })
  resourceId!: string;

  @Column("varchar", { length: 32 })
  role!: string;

  @Column("char", { name: "granted_by_user_id", length: 36, nullable: true })
  grantedByUserId!: string | null;

  @Column("datetime", { name: "created_at", precision: 3, default: () => "CURRENT_TIMESTAMP(3)" })
  createdAt!: Date;

  @ManyToOne(() => UserEntity, (user) => user.authorizationGrants, { onDelete: "CASCADE" })
  @JoinColumn({ name: "subject_user_id" })
  subjectUser!: UserEntity;

  @ManyToOne(() => UserEntity, { onDelete: "SET NULL" })
  @JoinColumn({ name: "granted_by_user_id" })
  grantedByUser!: UserEntity | null;
}
