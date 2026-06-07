# OAuth Provider Setup Instructions

## Purpose
The current SFUS Milestone 2 auth implementation already contains Google and GitHub OAuth start/callback flows, but those flows require real provider credentials and callback URLs in `apps/api/.env`. Placeholder values from `apps/api/.env.example` are not sufficient for real sign-in.

This document covers the operational setup for item 3 and is intentionally separate from the product-fix plan.

## Current Repository Contract
Set these values in `apps/api/.env`:

```dotenv
AUTH_GOOGLE_CLIENT_ID=...
AUTH_GOOGLE_CLIENT_SECRET=...
AUTH_GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/external/google/callback
AUTH_GITHUB_CLIENT_ID=...
AUTH_GITHUB_CLIENT_SECRET=...
AUTH_GITHUB_CALLBACK_URL=http://localhost:3001/api/auth/external/github/callback
```

For local development, the callback URLs should stay:
- `http://localhost:3001/api/auth/external/google/callback`
- `http://localhost:3001/api/auth/external/github/callback`

For a deployed environment, change them to your public API origin:
- `https://<public-host>/api/auth/external/google/callback`
- `https://<public-host>/api/auth/external/github/callback`

The provider configuration lives on the API side because the browser starts auth through `/api/auth/external/:provider/start`, and the API performs the callback code exchange.

## Google Setup
1. Open the Google Cloud Console and select or create a project for SFUS.
2. Configure the OAuth consent screen if the project has not done that yet.
3. Create an OAuth 2.0 Client ID for a web application.
4. Add the authorized redirect URI that exactly matches the callback URL you will put in `AUTH_GOOGLE_CALLBACK_URL`.
5. Copy the generated client ID and client secret into `apps/api/.env` as `AUTH_GOOGLE_CLIENT_ID` and `AUTH_GOOGLE_CLIENT_SECRET`.
6. Set `AUTH_GOOGLE_CALLBACK_URL` to the same redirect URI you registered in Google.

Notes:
- Google requires the redirect URI used at runtime to exactly match one of the authorized redirect URIs configured for the client.
- If you test both local and deployed environments, register both callback URLs if your Google project setup allows multiple redirect URIs for the same web client. Otherwise use separate OAuth clients per environment.

Official references:
- Google OAuth web-server flow docs: https://developers.google.com/identity/protocols/oauth2/web-server
- Google web app setup guidance: https://developers.google.com/identity/oauth2/web/guides/load-3p-authorization-library

## GitHub Setup
1. In GitHub, open your account or organization settings.
2. Go to Developer settings.
3. Open OAuth Apps.
4. Create a new OAuth App.
5. Set the application homepage URL to your local or deployed web origin as appropriate.
6. Set the authorization callback URL to the exact value you will put in `AUTH_GITHUB_CALLBACK_URL`.
7. Copy the client ID and generate a client secret.
8. Set `AUTH_GITHUB_CLIENT_ID`, `AUTH_GITHUB_CLIENT_SECRET`, and `AUTH_GITHUB_CALLBACK_URL` in `apps/api/.env`.

Notes:
- GitHub OAuth Apps use the registered callback URL for the user redirect after authorization.
- If you need separate local and deployed callback URLs, it is often simpler to use separate OAuth app registrations per environment.

Official references:
- GitHub OAuth app creation docs: https://docs.github.com/en/developers/apps/creating-an-oauth-app
- GitHub OAuth authorization docs: https://docs.github.com/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps

## Local Verification Steps
1. Copy env templates if you have not already:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
```

2. Replace the placeholder Google and GitHub values in `apps/api/.env` with real credentials.
3. Start the local stack:

```bash
docker compose --env-file .env -f cicd/docker/compose.dev.yml --profile fullstack up -d --build
```

4. Run the explicit API migration step:

```bash
docker compose --env-file .env -f cicd/docker/compose.dev.yml --profile fullstack run --rm api node dist/index.js migration:run
```

5. Open `http://localhost:3000/login` and `http://localhost:3000/register`.
6. Start Google or GitHub sign-in and confirm the provider redirects back to:
- `http://localhost:3001/api/auth/external/google/callback`
- `http://localhost:3001/api/auth/external/github/callback`
7. Confirm the browser ends on either:
- `/app` for an already-onboarded account
- `/onboarding/username` for a first-time external account

## Common Failure Modes
- `redirect_uri_mismatch` from Google:
  - `AUTH_GOOGLE_CALLBACK_URL` does not exactly match an authorized redirect URI in Google Cloud.
- GitHub callback or authorization error:
  - `AUTH_GITHUB_CALLBACK_URL` does not match the OAuth app callback URL you registered.
- Provider sign-in starts but callback fails in SFUS:
  - the `AUTH_*_CLIENT_ID` or `AUTH_*_CLIENT_SECRET` values are wrong
  - the API container is still running with old env values and needs a restart/rebuild
  - the local stack is up but the database migrations were not applied
- Sign-in appears to work at the provider but SFUS cannot finish login:
  - verify the API is reachable on `http://localhost:3001`
  - verify the callback URL points to the API origin, not the web origin
  - verify the provider credentials belong to the same app registration as the callback URL

## Recommended Environment Split
- Local development:
  - separate local Google/GitHub credentials with localhost callback URLs
- Shared staging or production:
  - separate credentials with public callback URLs under the deployed host

Using separate provider registrations per environment avoids callback drift and reduces the risk of breaking local sign-in while changing deployed settings.
