export interface SessionUser {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  globalRole: string;
  onboardingRequired: boolean;
}

export interface SessionPayload {
  user: SessionUser;
}

const globalRoleRank = {
  user: 0,
  moderator: 1,
  admin: 2
} as const;

export class AuthorizationError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export function hasGlobalRole(user: SessionUser, requiredRole: keyof typeof globalRoleRank): boolean {
  const actorRank = globalRoleRank[user.globalRole as keyof typeof globalRoleRank];
  return actorRank !== undefined && actorRank >= globalRoleRank[requiredRole];
}

export function canAccessPrivateAccount(
  session: SessionPayload,
  targetUserId: string,
  action: "read" | "write"
): boolean {
  if (session.user.id === targetUserId) {
    return true;
  }
  if (hasGlobalRole(session.user, "admin")) {
    return true;
  }
  return action === "read" && hasGlobalRole(session.user, "moderator");
}

export async function resolveProtectedSession(nextPath: string): Promise<{
  session: SessionPayload | null;
  redirectTo: string | null;
}> {
  const session = await readSession();
  if (!session) {
    return {
      session: null,
      redirectTo: `/login?next=${encodeURIComponent(nextPath)}`
    };
  }
  if (session.user.onboardingRequired) {
    return {
      session: null,
      redirectTo: "/onboarding/username"
    };
  }
  return { session, redirectTo: null };
}

export const readSession = async (): Promise<SessionPayload | null> => {
  const response = await fetch("/api/auth/session", {
    credentials: "include"
  });

  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Failed to resolve current session.");
  }
  return (await response.json()) as SessionPayload;
};

export interface ProfilePayload {
  username: string;
  email: string;
  displayName: string | null;
}

export interface SettingsPayload {
  username: string;
  email: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
}

export async function readProfile(): Promise<ProfilePayload> {
  const response = await fetch("/api/auth/profile", {
    credentials: "include"
  });
  if (response.status === 401 || response.status === 403) {
    throw new AuthorizationError("Not authorized to access this profile.", response.status);
  }
  if (!response.ok) {
    throw new Error("Failed to load profile.");
  }
  return (await response.json()) as ProfilePayload;
}

export async function updateProfile(displayName: string): Promise<ProfilePayload> {
  const response = await fetch("/api/auth/profile", {
    method: "PATCH",
    credentials: "include",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      displayName
    })
  });
  if (response.status === 401 || response.status === 403) {
    throw new AuthorizationError("Not authorized to update this profile.", response.status);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to update profile.");
  }
  return (await response.json()) as ProfilePayload;
}

export async function readSettings(): Promise<SettingsPayload> {
  const response = await fetch("/api/auth/settings", {
    credentials: "include"
  });
  if (response.status === 401 || response.status === 403) {
    throw new AuthorizationError("Not authorized to access account settings.", response.status);
  }
  if (!response.ok) {
    throw new Error("Failed to load settings.");
  }
  return (await response.json()) as SettingsPayload;
}

export async function updateSettings(username: string): Promise<SettingsPayload> {
  const response = await fetch("/api/auth/settings", {
    method: "PATCH",
    credentials: "include",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      username
    })
  });
  if (response.status === 401 || response.status === 403) {
    throw new AuthorizationError("Not authorized to update account settings.", response.status);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to update settings.");
  }
  return (await response.json()) as SettingsPayload;
}
