import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";

import { UserEntity } from "../../users/entities/user.entity";

@Entity("totp_secrets")
export class TotpSecretEntity {
  @PrimaryColumn("char", { length: 36 })
  id!: string;

  @Column("char", { name: "user_id", length: 36, unique: true })
  userId!: string;

  @Column("text", { name: "secret_encrypted" })
  secretEncrypted!: string;

  @Column("varchar", { length: 16, default: "SHA1" })
  algorithm!: string;

  @Column("tinyint", { unsigned: true, default: 6 })
  digits!: number;

  @Column("smallint", { name: "period_seconds", unsigned: true, default: 30 })
  periodSeconds!: number;

  @Column("datetime", { name: "verified_at", precision: 3, nullable: true })
  verifiedAt!: Date | null;

  @Column("datetime", { name: "created_at", precision: 3, default: () => "CURRENT_TIMESTAMP(3)" })
  createdAt!: Date;

  @Column("datetime", {
    name: "updated_at",
    precision: 3,
    default: () => "CURRENT_TIMESTAMP(3)",
    onUpdate: "CURRENT_TIMESTAMP(3)"
  })
  updatedAt!: Date;

  @ManyToOne(() => UserEntity, (user) => user.totpSecrets, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;
}
