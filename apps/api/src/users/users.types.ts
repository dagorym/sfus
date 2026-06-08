/**
 * users.types.ts
 *
 * Public-safe DTO shapes for the users module (ST14).
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
