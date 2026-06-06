import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");

async function readWebFile(relativePath: string) {
  return readFile(path.join(webRoot, relativePath), "utf8");
}

describe("public web shell source contracts", () => {
  it("uses centralized design tokens and responsive shell styles", async () => {
    // Acceptance criterion: the shell is responsive and uses centralized tokens.
    const [globalsCss, layoutCss, pageStateCss] = await Promise.all([
      readWebFile("app/globals.css"),
      readWebFile("app/layout.module.css"),
      readWebFile("components/page-state.module.css")
    ]);

    expect(globalsCss).toContain("--color-background");
    expect(globalsCss).toContain("--surface-shell-width");
    expect(globalsCss).toContain("--space-xl");
    expect(layoutCss).toContain("@media (max-width: 720px)");
    expect(layoutCss).toContain(".navLink");
    expect(pageStateCss).toContain("var(--color-accent)");
  });

  it("keeps the homepage branded and static", async () => {
    // Acceptance criterion: the homepage is static and branded.
    const [pageSource, layoutSource] = await Promise.all([
      readWebFile("app/page.tsx"),
      readWebFile("app/layout.tsx")
    ]);

    expect(pageSource).toContain("Chart the next frontier for Star Frontiers US.");
    expect(pageSource).toContain("Public Landing Experience");
    expect(pageSource).toContain("This Milestone 2 foundation delivers");
    expect(pageSource).not.toContain("Milestone 1");
    expect(pageSource).toContain('process.env.NEXT_PUBLIC_API_BASE_PATH || "/api"');
    expect(pageSource).not.toMatch(/\bfetch\s*\(/);
    expect(pageSource).not.toContain("useEffect(");
    expect(layoutSource).toContain("Milestone 2 Auth Foundation");
    expect(layoutSource).toContain("Built for the Milestone 2 auth launch baseline.");
    expect(layoutSource).not.toContain("Milestone 1");
  });

  it("supports signed-out and authenticated navigation states", async () => {
    // AC3: Shell now renders nav from NavigationModule config (dynamic API fetch)
    // instead of hardcoded publicNavigation arrays. Auth-specific fixed links
    // remain but are now defined in authNavLinks, not publicNavigation.
    const [navigationSource, layoutSource] = await Promise.all([
      readWebFile("components/navigation.tsx"),
      readWebFile("app/layout.tsx")
    ]);

    // Hardcoded publicNavigation array replaced by dynamic fetch from NavigationService API.
    expect(navigationSource).not.toContain('const publicNavigation = [');
    expect(navigationSource).toContain('fetchNavItems');
    expect(navigationSource).toContain('navigation/items/public');
    expect(navigationSource).toContain('navigation/items/authenticated');
    // Auth-specific fixed links remain (sign-in, register, app, profile, settings).
    expect(navigationSource).toContain('{ href: "/login", label: "Sign in" }');
    expect(navigationSource).toContain('{ href: "/register", label: "Register" }');
    expect(navigationSource).toContain('{ href: "/profile", label: "Profile" }');
    expect(navigationSource).toContain('{ href: "/settings", label: "Settings" }');
    expect(navigationSource).toContain('fetch("/api/auth/logout"');
    expect(layoutSource).toContain("<Navigation />");
  });

  it("provides branded 404 and error pages through the shared page-state shell", async () => {
    // Acceptance criterion: 404 and error pages exist and use the shared shell/theme conventions.
    const [notFoundSource, errorSource] = await Promise.all([
      readWebFile("app/not-found.tsx"),
      readWebFile("app/error.tsx")
    ]);

    expect(notFoundSource).toContain('import { PageState } from "../components/page-state"');
    expect(notFoundSource).toContain('title="404 · Sector not found"');
    expect(errorSource).toContain('import { PageState } from "../components/page-state"');
    expect(errorSource).toContain('title="A hyperspace fault disrupted this page."');
  });

  it("gates authenticated routes and profile/settings contracts", async () => {
    const [loginPageSource, loginClientSource, appShellSource, onboardingSource, profileSource, settingsSource] =
      await Promise.all([
      readWebFile("app/login/page.tsx"),
      readWebFile("app/login/login-client.tsx"),
      readWebFile("app/app/page.tsx"),
      readWebFile("app/onboarding/username/page.tsx"),
      readWebFile("app/profile/page.tsx"),
      readWebFile("app/settings/page.tsx")
      ]);

    expect(loginPageSource).toContain("<Suspense");
    expect(loginPageSource).toContain("<LoginClient />");
    expect(loginClientSource).toContain('fetch("/api/auth/login"');
    expect(loginClientSource).toContain(
      'href={`/api/auth/external/${provider.key}/start?next=${encodedNextPath}`}'
    );
    expect(loginClientSource).toContain('href="/register"');
    expect(loginClientSource).toContain('fetch("/api/auth/mfa/challenge"');
    expect(loginClientSource).toContain("setUsingRecoveryCode");
    expect(loginClientSource).toContain("challengeToken");
    expect(appShellSource).toContain('await resolveProtectedSession("/app")');
    expect(appShellSource).toContain('href="/profile"');
    expect(appShellSource).toContain('href="/settings"');
    expect(appShellSource).toContain('await resolveProtectedSession("/app")');
    expect(onboardingSource).toContain('fetch("/api/auth/onboarding/username"');
    expect(onboardingSource).toContain('router.replace("/app")');
    expect(profileSource).toContain('await resolveProtectedSession("/profile")');
    expect(profileSource).toContain('await readProfile()');
    expect(profileSource).toContain('await updateProfile(displayName)');
    expect(settingsSource).toContain('await resolveProtectedSession("/settings")');
    expect(settingsSource).toContain('await readSettings()');
    expect(settingsSource).toContain('await updateSettings(username)');
  });

  it("includes registration flow source contracts", async () => {
    const [registerSource, loginClientSource] = await Promise.all([
      readWebFile("app/register/page.tsx"),
      readWebFile("app/login/login-client.tsx")
    ]);
    const registerFormIndex = registerSource.indexOf('<form className={styles.form} onSubmit={handleSubmit}>');
    const providerActionsIndex = registerSource.indexOf("<div className={styles.actions}>");
    const providerLinkTemplateIndex = registerSource.indexOf(
      "href={`/api/auth/external/${provider.key}/start`}"
    );

    expect(registerSource).toContain('fetch("/api/auth/register"');
    expect(registerSource).toContain('fetch("/api/auth/verify-email"');
    expect(registerSource).toContain('fetch("/api/auth/login"');
    expect(registerSource).toContain("Start with Google or GitHub for the fastest setup.");
    expect(registerSource).toContain("Prefer local email and password?");
    expect(registerSource).toContain("Use local registration as a fallback option.");
    expect(providerActionsIndex).toBeGreaterThan(-1);
    expect(providerLinkTemplateIndex).toBeGreaterThan(-1);
    expect(registerFormIndex).toBeGreaterThan(-1);
    expect(providerActionsIndex).toBeLessThan(registerFormIndex);
    expect(providerLinkTemplateIndex).toBeLessThan(registerFormIndex);
    expect(registerSource).toContain("statusCode === 409");
    expect(registerSource).toContain("statusCode === 400");
    expect(registerSource).toContain("statusCode >= 500");
    expect(registerSource).toContain("The service is temporarily unavailable. Please try again in a moment.");
    expect(registerSource).toContain(
      "An account with this email or username already exists. Try signing in instead."
    );
    expect(registerSource).toContain(
      "Username must be 3-32 characters: letters, numbers, periods, dashes, or underscores."
    );
    expect(registerSource).toContain("Password must be at least 12 characters.");
    expect(loginClientSource).toContain("Returning Users");
    expect(loginClientSource).toContain("New here? Start at Register for");
    expect(loginClientSource).toContain("New here? Create an account");
    expect(registerSource).toContain('router.replace("/app")');
  });
});
