import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";

import { UserEntity } from "../../users/entities/user.entity";

@Entity("email_verifications")
@Index("uq_email_verifications_token_hash", ["tokenHash"], { unique: true })
@Index("idx_email_verifications_user_purpose", ["userId", "purpose"])
export class EmailVerificationEntity {
  @PrimaryColumn("char", { length: 36 })
  id!: string;

  @Column("char", { name: "user_id", length: 36 })
  userId!: string;

  @Column("varchar", { length: 32, default: "primary_email" })
  purpose!: string;

  @Column("char", { name: "token_hash", length: 64 })
  tokenHash!: string;

  @Column("datetime", { name: "expires_at", precision: 3 })
  expiresAt!: Date;

  @Column("datetime", { name: "consumed_at", precision: 3, nullable: true })
  consumedAt!: Date | null;

  @Column("datetime", { name: "created_at", precision: 3, default: () => "CURRENT_TIMESTAMP(3)" })
  createdAt!: Date;

  @ManyToOne(() => UserEntity, (user) => user.emailVerifications, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;
}
