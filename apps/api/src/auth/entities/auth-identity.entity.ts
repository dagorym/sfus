import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";

import { UserEntity } from "../../users/entities/user.entity";

@Entity("auth_identities")
@Index("uq_auth_identities_provider_subject", ["provider", "providerSubject"], { unique: true })
@Index("uq_auth_identities_user_provider", ["userId", "provider"], { unique: true })
export class AuthIdentityEntity {
  @PrimaryColumn("char", { length: 36 })
  id!: string;

  @Column("char", { name: "user_id", length: 36 })
  userId!: string;

  @Column("varchar", { length: 32 })
  provider!: string;

  @Column("varchar", { name: "provider_subject", length: 191 })
  providerSubject!: string;

  @Column("varchar", { name: "provider_email", length: 320, nullable: true })
  providerEmail!: string | null;

  @Column("datetime", { name: "created_at", precision: 3, default: () => "CURRENT_TIMESTAMP(3)" })
  createdAt!: Date;

  @ManyToOne(() => UserEntity, (user) => user.authIdentities, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;
}
