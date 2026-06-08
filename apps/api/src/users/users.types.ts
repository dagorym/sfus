/**
 * users.types.ts
 *
 * Public-safe DTO shapes for the users module (ST14, ST15).
 * All shapes use explicit allowlist mappings — no entity passthrough.
 */

// ---------------------------------------------------------------------------
// Suggest endpoint (GET /users/suggest?q=)
// ---------------------------------------------------------------------------

/**
 * One result row from the username-suggest endpoint.
 * Exposes ONLY these three fields — never email, globalRole, status, id, or
 * any other internal field.
 */
export interface UserSuggestItem {
  username: string;
  displayName: string | null;
  /** Resolved /api/media/<id> URL, or null when no avatar is set. */
  avatarUrl: string | null;
}

/**
 * Response shape for GET /users/suggest.
 */
export interface UserSuggestResponse {
  users: UserSuggestItem[];
}

// ---------------------------------------------------------------------------
// Set/remove-avatar endpoint (PUT/DELETE /users/me/avatar) — ST15
// ---------------------------------------------------------------------------

/**
 * Request body for PUT /users/me/avatar.
 * Accepts the `media_references` id of the avatar to bind.
 */
export interface SetAvatarBody {
  /** The `media_references` id of the avatar to bind (must be owned by the caller and resourceType='avatar'). */
  mediaId: string;
}

/**
 * Response for a successful set-avatar operation.
 */
export interface SetAvatarResponse {
  /** The resolved /api/media/<id> URL for the bound avatar. */
  avatarUrl: string;
}

/**
 * Response for a successful remove-avatar operation.
 */
export interface RemoveAvatarResponse {
  /** Always null after removal. */
  avatarUrl: null;
}

// ---------------------------------------------------------------------------
// Public profile endpoint (GET /users/:username)
// ---------------------------------------------------------------------------

/**
 * Minimal public profile shape.
 * Exposes EXACTLY five fields — no email, no role, no status, no id.
 */
export interface PublicProfileShape {
  username: string;
  displayName: string | null;
  /** Resolved /api/media/<id> URL, or null when no avatar is set. */
  avatar: string | null;
  bio: string | null;
  /** ISO-8601 string of the account creation date (joinDate). */
  joinDate: string;
}
