import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Like, Repository } from "typeorm";

import { MediaReferenceEntity } from "../media/entities/media-reference.entity";
import { UserEntity } from "./entities/user.entity";
import type { PublicProfileShape, UserSuggestItem } from "./users.types";

/** Maximum results returned by the suggest endpoint. */
const SUGGEST_RESULT_CAP = 10;

/** URL prefix for resolved media references. */
const MEDIA_URL_PREFIX = "/api/media/";

/** User status value that identifies an account accessible to public APIs. */
const ACTIVE_STATUS = "active";

/**
 * resourceType value that identifies an avatar-use media reference.
 * Used to enforce that only avatar uploads can be bound as a user's avatar.
 */
const AVATAR_RESOURCE_TYPE = "avatar";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(MediaReferenceEntity)
    private readonly mediaRepository: Repository<MediaReferenceEntity>
  ) {}

  async findById(id: string): Promise<UserEntity | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // Set / remove avatar (ST15)
  // ---------------------------------------------------------------------------

  /**
   * Binds a media_references row as the calling user's avatar.
   *
   * Validates BOTH conditions before persisting:
   *   (a) the row exists and resourceType === 'avatar', AND
   *   (b) ownerUserId === callerId.
   *
   * Oracle-parity: returns a uniform ForbiddenException for all not-allowed
   * cases (nonexistent id, wrong resourceType, foreign owner) to avoid leaking
   * whether a foreign media id exists.
   *
   * @param callerId The authenticated user's id.
   * @param mediaId  The media_references id to bind.
   * @returns The resolved /api/media/<id> URL on success.
   */
  async setAvatar(callerId: string, mediaId: string): Promise<string> {
    // Lookup — apply both predicates in one query to avoid leaking existence
    // of a foreign media id (oracle parity).
    const media = await this.mediaRepository.findOne({
      where: {
        id: mediaId,
        resourceType: AVATAR_RESOURCE_TYPE,
        ownerUserId: callerId
      }
    });

    if (!media) {
      // Uniform rejection — does not distinguish "nonexistent", "wrong type",
      // or "foreign owner" to avoid leaking others' media ids (oracle parity).
      throw new ForbiddenException("Media id not found or not usable as your avatar.");
    }

    await this.usersRepository.update({ id: callerId }, { avatarMediaId: mediaId });
    return `${MEDIA_URL_PREFIX}${mediaId}`;
  }

  /**
   * Clears the calling user's avatar by setting avatar_media_id to null.
   *
   * @param callerId The authenticated user's id.
   */
  async removeAvatar(callerId: string): Promise<void> {
    await this.usersRepository.update({ id: callerId }, { avatarMediaId: null });
  }

  // ---------------------------------------------------------------------------
  // Username suggest (ST14)
  // ---------------------------------------------------------------------------

  /**
   * Returns up to SUGGEST_RESULT_CAP active users whose username begins with `q`.
   *
   * Explicit allowlist mapping — only username, displayName, avatarUrl are
   * returned. Never email, globalRole, status, id, or any other field.
   *
   * @param q Prefix string (may be empty — returns capped list of active users).
   */
  async suggestByPrefix(q: string): Promise<UserSuggestItem[]> {
    const rows = await this.usersRepository.find({
      where: {
        status: ACTIVE_STATUS,
        username: Like(`${escapeLikePrefix(q)}%`)
      },
      order: { username: "ASC" },
      take: SUGGEST_RESULT_CAP
    });

    // Explicit allowlist mapping — only the three permitted fields.
    return rows.map((u) => ({
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarMediaId !== null ? `${MEDIA_URL_PREFIX}${u.avatarMediaId}` : null
    }));
  }

  // ---------------------------------------------------------------------------
  // Public profile (ST14)
  // ---------------------------------------------------------------------------

  /**
   * Returns the minimal public profile for an active user identified by username.
   *
   * Returns `null` for both nonexistent users AND users that exist but are not
   * active — callers must treat null as a uniform 404 (no enumeration oracle).
   *
   * Explicit allowlist mapping — only the five permitted fields are returned.
   */
  async findPublicProfile(username: string): Promise<PublicProfileShape | null> {
    const user = await this.usersRepository.findOne({
      where: { username, status: ACTIVE_STATUS }
    });

    if (!user) {
      // Uniform null for both "no such user" and "inactive user".
      return null;
    }

    // Explicit allowlist mapping — exactly five fields.
    return {
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatarMediaId !== null ? `${MEDIA_URL_PREFIX}${user.avatarMediaId}` : null,
      bio: user.bio,
      joinDate: user.createdAt.toISOString()
    };
  }
}

/**
 * Escapes TypeORM LIKE special characters (`%`, `_`, `\`) in a prefix string
 * so user-supplied `q` values cannot alter the intended prefix pattern.
 */
function escapeLikePrefix(q: string): string {
  return q.replace(/[%_\\]/g, (c) => `\\${c}`);
}
