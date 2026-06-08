/**
 * Public profile projection helper — /users/[username]
 *
 * Extracted from page.tsx because Next.js App Router route files (page.tsx)
 * may only export a default component plus a fixed allowlist of route fields
 * (metadata, generateMetadata, dynamic, etc.). Exporting the projection helper
 * and its shape from the page broke `next build` with:
 *   "profileProjection" is not a valid Page export field.
 * Keeping it here preserves unit-testability without violating that contract.
 *
 * Security:
 * - Renders ONLY the five allowlisted fields returned by the ST14 API:
 *   username, displayName, avatar, bio, joinDate.
 *   profileProjection() enforces this at runtime — unknown keys are dropped
 *   even if the API response contains them.
 */

// ---------------------------------------------------------------------------
// Types — five allowlisted fields only
// ---------------------------------------------------------------------------

/**
 * Exactly the five fields the ST14 /users/:username endpoint returns.
 * Adding any field here is a security-relevant change: confirm against
 * ST14 users.types.ts PublicProfileShape before doing so.
 */
export interface PublicProfileShape {
  username: string;
  displayName: string | null;
  avatar: string | null;
  bio: string | null;
  joinDate: string;
}

// ---------------------------------------------------------------------------
// profileProjection — drops unknown keys (output guard)
// ---------------------------------------------------------------------------

/**
 * Project an API response object into ONLY the five permitted public profile
 * fields. Any keys not in this allowlist are silently dropped.
 *
 * Regression contract: if a required field is missing the function returns
 * null, preventing rendering of incomplete data.
 */
export function profileProjection(raw: unknown): PublicProfileShape | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  // All five fields must be present (username and joinDate are required strings).
  if (typeof r["username"] !== "string" || r["username"].trim() === "") return null;
  if (typeof r["joinDate"] !== "string" || r["joinDate"].trim() === "") return null;

  return {
    username: r["username"],
    displayName: typeof r["displayName"] === "string" ? r["displayName"] : null,
    avatar: typeof r["avatar"] === "string" && r["avatar"].trim() !== "" ? r["avatar"] : null,
    bio: typeof r["bio"] === "string" ? r["bio"] : null,
    joinDate: r["joinDate"]
  };
}
