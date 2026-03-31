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

  it("limits navigation to implemented destinations and omits auth UI", async () => {
    // Acceptance criterion: navigation includes only implemented destinations, and auth UI is absent.
    const [navigationSource, layoutSource] = await Promise.all([
      readWebFile("components/navigation.tsx"),
      readWebFile("app/layout.tsx")
    ]);

    expect(navigationSource).toContain('const navigation = [{ href: "/", label: "Home" }]');
    expect(navigationSource).not.toMatch(/href:\s*"\/(login|logout|register|account|profile)/i);
    expect(layoutSource).not.toMatch(/>\s*(sign in|sign up|login|log in|logout|log out)\s*</i);
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
});
