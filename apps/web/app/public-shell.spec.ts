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
    const pageSource = await readWebFile("app/page.tsx");

    expect(pageSource).toContain("Chart the next frontier for Star Frontiers US.");
    expect(pageSource).toContain("Public Landing Experience");
    expect(pageSource).toContain('process.env.NEXT_PUBLIC_API_BASE_PATH || "/api"');
    expect(pageSource).not.toMatch(/\bfetch\s*\(/);
    expect(pageSource).not.toContain("useEffect(");
  });

  it("supports signed-out and authenticated navigation states", async () => {
    const [navigationSource, layoutSource] = await Promise.all([
      readWebFile("components/navigation.tsx"),
      readWebFile("app/layout.tsx")
    ]);

    expect(navigationSource).toContain('const publicNavigation = [');
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
    const [loginSource, appShellSource, onboardingSource, profileSource, settingsSource] =
      await Promise.all([
      readWebFile("app/login/page.tsx"),
      readWebFile("app/app/page.tsx"),
      readWebFile("app/onboarding/username/page.tsx"),
      readWebFile("app/profile/page.tsx"),
      readWebFile("app/settings/page.tsx")
      ]);

    expect(loginSource).toContain('fetch("/api/auth/login"');
    expect(loginSource).toContain('href={`/api/auth/external/${provider.key}/start?next=${encodedNextPath}`}');
    expect(loginSource).toContain('href="/register"');
    expect(loginSource).toContain('fetch("/api/auth/mfa/challenge"');
    expect(loginSource).toContain("setUsingRecoveryCode");
    expect(loginSource).toContain("challengeToken");
    expect(appShellSource).toContain('router.replace("/onboarding/username")');
    expect(appShellSource).toContain('href="/profile"');
    expect(appShellSource).toContain('href="/settings"');
    expect(appShellSource).toContain('await readSession()');
    expect(onboardingSource).toContain('fetch("/api/auth/onboarding/username"');
    expect(onboardingSource).toContain('router.replace("/app")');
    expect(profileSource).toContain('router.replace("/login?next=/profile")');
    expect(profileSource).toContain('await readProfile()');
    expect(profileSource).toContain('await updateProfile(displayName)');
    expect(settingsSource).toContain('router.replace("/login?next=/settings")');
    expect(settingsSource).toContain('await readSettings()');
    expect(settingsSource).toContain('await updateSettings(username)');
  });

  it("includes registration flow source contracts", async () => {
    const registerSource = await readWebFile("app/register/page.tsx");
    expect(registerSource).toContain('fetch("/api/auth/register"');
    expect(registerSource).toContain('fetch("/api/auth/verify-email"');
    expect(registerSource).toContain('fetch("/api/auth/login"');
    expect(registerSource).toContain('router.replace("/app")');
  });
});
