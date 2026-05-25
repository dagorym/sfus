import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";

import { UserEntity } from "../../users/entities/user.entity";

@Entity("auth_sessions")
@Index("uq_auth_sessions_session_token_hash", ["sessionTokenHash"], { unique: true })
@Index("idx_auth_sessions_user_state", ["userId", "state"])
@Index("idx_auth_sessions_expires_at", ["expiresAt"])
export class AuthSessionEntity {
  @PrimaryColumn("char", { length: 36 })
  id!: string;

  @Column("char", { name: "user_id", length: 36 })
  userId!: string;

  @Column("char", { name: "session_token_hash", length: 64 })
  sessionTokenHash!: string;

  @Column("char", { name: "csrf_token_hash", length: 64, nullable: true })
  csrfTokenHash!: string | null;

  @Column("varchar", { length: 32, default: "active" })
  state!: string;

  @Column("datetime", { name: "last_seen_at", precision: 3 })
  lastSeenAt!: Date;

  @Column("datetime", { name: "expires_at", precision: 3 })
  expiresAt!: Date;

  @Column("datetime", { name: "revoked_at", precision: 3, nullable: true })
  revokedAt!: Date | null;

  @Column("varchar", { name: "ip_address", length: 45, nullable: true })
  ipAddress!: string | null;

  @Column("varchar", { name: "user_agent", length: 512, nullable: true })
  userAgent!: string | null;

  @Column("datetime", { name: "created_at", precision: 3, default: () => "CURRENT_TIMESTAMP(3)" })
  createdAt!: Date;

  @Column("datetime", {
    name: "updated_at",
    precision: 3,
    default: () => "CURRENT_TIMESTAMP(3)",
    onUpdate: "CURRENT_TIMESTAMP(3)"
  })
  updatedAt!: Date;

  @ManyToOne(() => UserEntity, (user) => user.sessions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;
}
