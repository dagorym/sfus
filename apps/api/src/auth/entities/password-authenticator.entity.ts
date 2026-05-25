import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";

import { UserEntity } from "../../users/entities/user.entity";

@Entity("password_authenticators")
export class PasswordAuthenticatorEntity {
  @PrimaryColumn("char", { length: 36 })
  id!: string;

  @Column("char", { name: "user_id", length: 36, unique: true })
  userId!: string;

  @Column("varchar", { name: "password_hash", length: 255 })
  passwordHash!: string;

  @Column("int", { name: "password_version", unsigned: true, default: 1 })
  passwordVersion!: number;

  @Column("datetime", {
    name: "password_updated_at",
    precision: 3,
    default: () => "CURRENT_TIMESTAMP(3)"
  })
  passwordUpdatedAt!: Date;

  @Column("datetime", { name: "created_at", precision: 3, default: () => "CURRENT_TIMESTAMP(3)" })
  createdAt!: Date;

  @Column("datetime", {
    name: "updated_at",
    precision: 3,
    default: () => "CURRENT_TIMESTAMP(3)",
    onUpdate: "CURRENT_TIMESTAMP(3)"
  })
  updatedAt!: Date;

  @ManyToOne(() => UserEntity, (user) => user.passwordAuthenticators, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;
}
