import { BadGatewayException, BadRequestException } from "@nestjs/common";

import type { ApplicationEnvironment } from "../config/environment";

export interface ExternalIdentityProfile {
  provider: string;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
}

export interface ExternalAuthProviderAdapter {
  provider: string;
  getAuthorizationUrl(state: string): string;
  exchangeCodeForIdentity(code: string): Promise<ExternalIdentityProfile>;
}

export interface ExternalAuthProviderRegistry {
  resolve(provider: string): ExternalAuthProviderAdapter;
}

class StaticExternalAuthProviderRegistry implements ExternalAuthProviderRegistry {
  constructor(private readonly providers: Map<string, ExternalAuthProviderAdapter>) {}

  resolve(provider: string): ExternalAuthProviderAdapter {
    const adapter = this.providers.get(provider);
    if (!adapter) {
      throw new BadRequestException("Unsupported authentication provider.");
    }
    return adapter;
  }
}

const encodeQuery = (parameters: Record<string, string>): string =>
  Object.entries(parameters)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

const normalizeDisplayName = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
};

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
};

class GoogleAuthProviderAdapter implements ExternalAuthProviderAdapter {
  readonly provider = "google";

  constructor(
    private readonly configuration: ApplicationEnvironment["auth"]["externalProviders"]["google"]
  ) {}

  getAuthorizationUrl(state: string): string {
    const query = encodeQuery({
      response_type: "code",
      client_id: this.configuration.clientId,
      redirect_uri: this.configuration.callbackUrl,
      scope: "openid email profile",
      state,
      prompt: "select_account"
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
  }

  async exchangeCodeForIdentity(code: string): Promise<ExternalIdentityProfile> {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: encodeQuery({
        code,
        client_id: this.configuration.clientId,
        client_secret: this.configuration.clientSecret,
        redirect_uri: this.configuration.callbackUrl,
        grant_type: "authorization_code"
      })
    });
    if (!tokenResponse.ok) {
      throw new BadGatewayException("Google token exchange failed.");
    }

    const tokenPayload = (await tokenResponse.json()) as Record<string, unknown>;
    const accessToken =
      typeof tokenPayload.access_token === "string" ? tokenPayload.access_token : null;
    if (!accessToken) {
      throw new BadGatewayException("Google token exchange did not return an access token.");
    }

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    if (!profileResponse.ok) {
      throw new BadGatewayException("Google profile lookup failed.");
    }

    const profile = (await profileResponse.json()) as Record<string, unknown>;
    const subject = typeof profile.sub === "string" ? profile.sub.trim() : "";
    if (!subject) {
      throw new BadGatewayException("Google profile payload is missing the subject claim.");
    }

    return {
      provider: this.provider,
      subject,
      email: normalizeEmail(profile.email),
      emailVerified: Boolean(profile.email_verified),
      displayName: normalizeDisplayName(profile.name)
    };
  }
}

class GitHubAuthProviderAdapter implements ExternalAuthProviderAdapter {
  readonly provider = "github";

  constructor(
    private readonly configuration: ApplicationEnvironment["auth"]["externalProviders"]["github"]
  ) {}

  getAuthorizationUrl(state: string): string {
    const query = encodeQuery({
      client_id: this.configuration.clientId,
      redirect_uri: this.configuration.callbackUrl,
      scope: "read:user user:email",
      state
    });
    return `https://github.com/login/oauth/authorize?${query}`;
  }

  async exchangeCodeForIdentity(code: string): Promise<ExternalIdentityProfile> {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "sfus-api"
      },
      body: encodeQuery({
        code,
        client_id: this.configuration.clientId,
        client_secret: this.configuration.clientSecret,
        redirect_uri: this.configuration.callbackUrl
      })
    });
    if (!tokenResponse.ok) {
      throw new BadGatewayException("GitHub token exchange failed.");
    }

    const tokenPayload = (await tokenResponse.json()) as Record<string, unknown>;
    const accessToken =
      typeof tokenPayload.access_token === "string" ? tokenPayload.access_token : null;
    if (!accessToken) {
      throw new BadGatewayException("GitHub token exchange did not return an access token.");
    }

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/vnd.github+json",
        "user-agent": "sfus-api"
      }
    });
    if (!userResponse.ok) {
      throw new BadGatewayException("GitHub profile lookup failed.");
    }
    const userProfile = (await userResponse.json()) as Record<string, unknown>;
    const subject = String(userProfile.id || "").trim();
    if (!subject) {
      throw new BadGatewayException("GitHub profile payload is missing the user id.");
    }

    const emailsResponse = await fetch("https://api.github.com/user/emails", {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/vnd.github+json",
        "user-agent": "sfus-api"
      }
    });
    const emailCandidates = emailsResponse.ok
      ? ((await emailsResponse.json()) as Array<Record<string, unknown>>)
      : [];
    const primaryVerifiedEmail =
      emailCandidates.find(
        (candidate) => candidate.primary === true && candidate.verified === true
      ) ||
      emailCandidates.find((candidate) => candidate.verified === true) ||
      null;

    const email =
      normalizeEmail(primaryVerifiedEmail?.email) || normalizeEmail(userProfile.email) || null;
    const emailVerified = Boolean(primaryVerifiedEmail?.verified);

    return {
      provider: this.provider,
      subject,
      email,
      emailVerified,
      displayName: normalizeDisplayName(userProfile.name) || normalizeDisplayName(userProfile.login)
    };
  }
}

export const createExternalAuthProviderRegistry = (
  environment: ApplicationEnvironment
): ExternalAuthProviderRegistry => {
  const providers = new Map<string, ExternalAuthProviderAdapter>();

  providers.set(
    "google",
    new GoogleAuthProviderAdapter(environment.auth.externalProviders.google)
  );
  providers.set(
    "github",
    new GitHubAuthProviderAdapter(environment.auth.externalProviders.github)
  );

  return new StaticExternalAuthProviderRegistry(providers);
};
