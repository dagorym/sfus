"use client";

/**
 * UserAvatar
 *
 * Displays a user's avatar image, falling back to an initials placeholder
 * when no avatar URL is available or when the image fails to load.
 *
 * Security:
 * - avatarSrc MUST come from the /api/media/<id> serve path (ST15/ST12).
 *   Callers must never pass raw/un-gated storage URLs.
 * - On error the component degrades to the initials fallback — no broken
 *   image is shown and no raw URL leaks to the DOM.
 * - The initials are derived from displayName or username (both caller-supplied
 *   but rendered as text via React, not as HTML).
 */

import React, { useState } from "react";

import styles from "./user-avatar.module.css";

export interface UserAvatarProps {
  /**
   * The resolved /api/media/<id> avatar URL, or null when the user has no
   * avatar set. Must always be the gated API serve path — never a raw
   * storage URL.
   */
  avatarSrc: string | null;
  /**
   * Used to derive the initials fallback when no avatar is available.
   * Prefers displayName, falls back to username.
   */
  displayName: string | null;
  username: string;
  /**
   * Diameter of the circular avatar in pixels. Defaults to 40.
   */
  size?: number;
  /** Optional extra className for the container element. */
  className?: string;
}

/**
 * Derive up-to-two initials from a display name or username for the fallback
 * placeholder. This is a pure function exported for unit-testability.
 *
 * Rules:
 * - Prefer displayName when non-empty; fall back to username.
 * - Split on whitespace; take the first letter of each of the first two words.
 * - If a single token, take the first two characters.
 * - Upper-case the result.
 * - If no characters are available, returns "?".
 */
export function deriveInitials(displayName: string | null, username: string): string {
  const source = displayName?.trim() || username.trim();
  if (!source) return "?";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
  }
  const word = words[0] ?? "";
  const twoChars = word.slice(0, 2);
  return twoChars ? twoChars.toUpperCase() : "?";
}

/**
 * Resolve the avatar src to display. Returns the gated API URL when one is
 * provided and not yet in an error state; otherwise returns null (triggering
 * the initials fallback). Exported for unit-testability.
 */
export function resolveAvatarSrc(
  avatarSrc: string | null,
  hasError: boolean
): string | null {
  if (!avatarSrc || hasError) return null;
  return avatarSrc;
}

export function UserAvatar({
  avatarSrc,
  displayName,
  username,
  size = 40,
  className
}: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);

  const resolvedSrc = resolveAvatarSrc(avatarSrc, imgError);
  const initials = deriveInitials(displayName, username);
  const altText = displayName ?? username;

  const containerClass = [styles.avatar, className].filter(Boolean).join(" ");

  return (
    <span
      className={containerClass}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-label={`Avatar for ${altText}`}
      role="img"
    >
      {resolvedSrc ? (
        <img
          src={resolvedSrc}
          alt={`Avatar for ${altText}`}
          className={styles.avatarImg}
          onError={() => setImgError(true)}
          width={size}
          height={size}
        />
      ) : (
        <span className={styles.avatarInitials} aria-hidden="true">
          {initials}
        </span>
      )}
    </span>
  );
}
