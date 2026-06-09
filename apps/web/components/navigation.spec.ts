import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const navPath = path.resolve(__dirname, "navigation.tsx");

async function readNav(): Promise<string> {
  return readFile(navPath, "utf8");
}

// ---------------------------------------------------------------------------
// AC1 (subtask-6): Dropdown child rendering — keyboard-accessible
// ---------------------------------------------------------------------------

describe("navigation.tsx — dropdown keyboard accessibility (AC1 subtask-6)", () => {
  it("uses aria-haspopup on the dropdown trigger button", async () => {
    // AC1: Dropdown trigger must have aria-haspopup.
    const source = await readNav();
    expect(source).toContain("aria-haspopup");
  });

  it("uses aria-expanded on the dropdown trigger button", async () => {
    // AC1: Dropdown trigger must have aria-expanded.
    const source = await readNav();
    expect(source).toContain("aria-expanded");
  });

  it("closes dropdown on Escape key", async () => {
    // AC1: Escape key handler sets open to false.
    const source = await readNav();
    expect(source).toContain('e.key === "Escape"');
    // The setOpen call on Escape must explicitly set closed (false)
    expect(source).toMatch(/Escape[\s\S]{0,80}setOpen\(false\)/);
  });

  it("closes dropdown on blur (focus leaves container)", async () => {
    // AC1: onBlur handler closes the dropdown when focus leaves the container.
    const source = await readNav();
    expect(source).toContain("onBlur");
    expect(source).toContain("containerRef");
    // The blur handler checks relatedTarget against the container
    expect(source).toContain("relatedTarget");
  });

  it("renders one level of dropdown children inside a role=menu container", async () => {
    // AC1: Children rendered inside role=menu container.
    const source = await readNav();
    expect(source).toContain('role="menu"');
    // Children are mapped inside the dropdown
    expect(source).toContain("item.children.map");
  });
});

// ---------------------------------------------------------------------------
// AC1 (subtask-6): External links — target=_blank rel=noopener noreferrer
// ---------------------------------------------------------------------------

describe("navigation.tsx — external link attributes (AC1 subtask-6)", () => {
  it('renders external links with target="_blank"', async () => {
    // AC1: External items must use target=_blank.
    const source = await readNav();
    expect(source).toContain('target="_blank"');
  });

  it('renders external links with rel="noopener noreferrer"', async () => {
    // AC1: External items must use rel=noopener noreferrer.
    const source = await readNav();
    expect(source).toContain('rel="noopener noreferrer"');
  });

  it("uses NavItemLink sub-component that branches on linkType=external", async () => {
    // AC1: NavItemLink branches on linkType to choose between <a> and <Link>.
    const source = await readNav();
    expect(source).toContain('linkType === "external"');
  });

  it("uses Next.js Link for internal link items", async () => {
    // AC1: Internal links use Next.js <Link>.
    const source = await readNav();
    expect(source).toContain("import Link from");
    // NavItemLink returns a Link for non-external items
    expect(source).toContain("<Link");
  });
});

// ---------------------------------------------------------------------------
// AC4 (subtask-6): Safe fallback — error and empty API responses produce []
// ---------------------------------------------------------------------------

describe("navigation.tsx — safe [] fallback behavior (AC4 subtask-6)", () => {
  it("fetchNavItems returns [] on fetch error (catch block)", async () => {
    // AC4: catch block in fetchNavItems must return [].
    const source = await readNav();
    // The catch block in fetchNavItems should return []
    expect(source).toMatch(/catch[\s\S]{0,50}return \[\]/);
  });

  it("fetchNavItems returns [] on non-ok HTTP response", async () => {
    // AC4: Non-ok response must return [].
    const source = await readNav();
    expect(source).toContain("!response.ok");
    expect(source).toMatch(/!response\.ok\s*\)\s*return \[\]/);
  });

  it("fetchNavItems uses data.items ?? [] to guard undefined items", async () => {
    // AC4: Uses ?? [] to guard against malformed API response shape.
    const source = await readNav();
    expect(source).toContain("data.items ?? []");
  });

  it("does not contain hardcoded route arrays like publicNavigation", async () => {
    // AC4: No hardcoded route arrays — replaced by dynamic API fetch.
    const source = await readNav();
    expect(source).not.toContain("const publicNavigation =");
    expect(source).not.toContain("publicNavigation.map");
  });
});

// ---------------------------------------------------------------------------
// AC3 (CO7): Admin nav link — shown only for admin-role sessions
// ---------------------------------------------------------------------------

describe("navigation.tsx — Admin nav link visibility (AC3 CO7)", () => {
  it("imports hasGlobalRole from auth-client", async () => {
    // AC3: hasGlobalRole must be imported to gate the Admin link.
    const source = await readNav();
    expect(source).toContain("hasGlobalRole");
    expect(source).toContain('from "../app/auth-client"');
  });

  it("renders an Admin link pointing to /admin", async () => {
    // AC3: Admin link must href="/admin".
    const source = await readNav();
    expect(source).toContain('href="/admin"');
    // The link label must include "Admin" as a text node
    expect(source).toMatch(/href="\/admin"[\s\S]{0,200}Admin[\s\S]{0,10}<\/Link>/);
  });

  it('gates the Admin link with hasGlobalRole(session.user, "admin")', async () => {
    // AC3: Admin link only shown when hasGlobalRole returns true for "admin".
    const source = await readNav();
    expect(source).toContain('hasGlobalRole(session.user, "admin")');
  });

  it("requires session to be present (non-null) for Admin link", async () => {
    // AC3: Admin link is absent for guest (no session).
    const source = await readNav();
    // The conditional must reference `session` and `hasGlobalRole` together
    expect(source).toMatch(/session\b[\s\S]{0,150}hasGlobalRole[\s\S]{0,80}"admin"/);
  });

  it("requires onboardingRequired to be false for Admin link", async () => {
    // AC3: Admin link absent for onboarding sessions.
    const source = await readNav();
    // The Admin link gate must exclude onboarding sessions
    expect(source).toMatch(/!session\.user\.onboardingRequired[\s\S]{0,200}hasGlobalRole|hasGlobalRole[\s\S]{0,200}!session\.user\.onboardingRequired/);
  });

  it("applies pathname-based active style for /admin and /admin/* paths", async () => {
    // AC3: Active style matches /admin exactly and /admin/* prefix.
    const source = await readNav();
    expect(source).toContain('pathname === "/admin"');
    expect(source).toMatch(/startsWith\(["']\/admin\/["']\)/);
  });
});
