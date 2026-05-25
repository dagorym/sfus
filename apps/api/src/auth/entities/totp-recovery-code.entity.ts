import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";

import { UserEntity } from "../../users/entities/user.entity";

@Entity("totp_recovery_codes")
@Index("uq_totp_recovery_codes_code_hash", ["codeHash"], { unique: true })
@Index("idx_totp_recovery_codes_user_consumed", ["userId", "consumedAt"])
export class TotpRecoveryCodeEntity {
  @PrimaryColumn("char", { length: 36 })
  id!: string;

  @Column("char", { name: "user_id", length: 36 })
  userId!: string;

  @Column("char", { name: "code_hash", length: 64 })
  codeHash!: string;

  @Column("datetime", { name: "consumed_at", precision: 3, nullable: true })
  consumedAt!: Date | null;

  @Column("datetime", { name: "created_at", precision: 3, default: () => "CURRENT_TIMESTAMP(3)" })
  createdAt!: Date;

  @ManyToOne(() => UserEntity, (user) => user.recoveryCodes, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;
}
