"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { readSession, type SessionPayload } from "../app/auth-client";
import styles from "../app/layout.module.css";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_PATH || "/api";

interface DynamicNavItem {
  id: string;
  label: string;
  url: string;
  linkType: string;
  visibility: string;
  isActive: boolean;
  children: DynamicNavItem[];
}

/**
 * Fetches active navigation items from the NavigationService API.
 * Returns public items for guests; all active items for authenticated users.
 * Falls back to an empty array on error so the shell still renders.
 */
async function fetchNavItems(authenticated: boolean): Promise<DynamicNavItem[]> {
  try {
    const endpoint = authenticated
      ? `${apiBase}/navigation/items/authenticated`
      : `${apiBase}/navigation/items/public`;
    const response = await fetch(endpoint, { cache: "no-store", credentials: authenticated ? "include" : "omit" });
    if (!response.ok) return [];
    const data = (await response.json()) as { items: DynamicNavItem[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}

// Auth-aware nav links appended after dynamic items
const authNavLinks = {
  guest: [
    { href: "/login", label: "Sign in" },
    { href: "/register", label: "Register" }
  ],
  onboarding: [{ href: "/onboarding/username", label: "Complete onboarding" }],
  authenticated: [
    { href: "/app", label: "App" },
    { href: "/profile", label: "Profile" },
    { href: "/settings", label: "Settings" }
  ]
};

/**
 * Renders a single nav item link (internal or external).
 * External links use a real <a> with target="_blank" and rel="noopener noreferrer".
 * Internal links use Next.js <Link>.
 */
function NavItemLink({
  item,
  pathname,
  className
}: {
  item: DynamicNavItem;
  pathname: string;
  className: string;
}) {
  if (item.linkType === "external") {
    return (
      <a
        className={className}
        href={item.url}
        rel="noopener noreferrer"
        target="_blank"
      >
        {item.label}
      </a>
    );
  }
  const isActive = pathname === item.url || pathname.startsWith(item.url + "/");
  return (
    <Link className={`${className} ${isActive ? styles.navLinkActive : ""}`.trim()} href={item.url}>
      {item.label}
    </Link>
  );
}

/**
 * Renders a top-level nav item that has children as a keyboard-accessible dropdown.
 * Clicking or pressing Enter/Space on the trigger toggles the dropdown.
 * Pressing Escape or moving focus away closes it.
 */
function NavDropdown({
  item,
  pathname
}: {
  item: DynamicNavItem;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Close when focus leaves the dropdown container
  const onBlur = (e: React.FocusEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node)) {
      setOpen(false);
    }
  };

  const isParentActive =
    pathname === item.url || pathname.startsWith(item.url + "/") ||
    item.children.some((c) => pathname === c.url || pathname.startsWith(c.url + "/"));

  return (
    <div
      ref={containerRef}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      style={{ position: "relative" }}
    >
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={`${styles.navButton} ${isParentActive ? styles.navLinkActive : ""}`.trim()}
        onClick={() => setOpen((prev) => !prev)}
        type="button"
      >
        {item.label}
      </button>
      {open && (
        <div
          aria-label={`${item.label} submenu`}
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 10,
            minWidth: "10rem",
            padding: "0.25rem 0",
            background: "var(--color-background-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--surface-radius-large, 0.5rem)",
            boxShadow: "var(--shadow-soft)"
          }}
        >
          {item.children.map((child) => (
            <div key={child.id} role="none" style={{ display: "block" }}>
              <NavItemLink
                className={styles.navLink}
                item={child}
                pathname={pathname}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [dynamicItems, setDynamicItems] = useState<DynamicNavItem[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      let resolvedSession: SessionPayload | null = null;
      try {
        resolvedSession = await readSession();
      } catch {
        resolvedSession = null;
      }
      if (!mounted) return;
      setSession(resolvedSession);

      const items = await fetchNavItems(resolvedSession !== null);
      if (mounted) setDynamicItems(items);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [pathname]);

  const onSignOut = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include"
    }).catch(() => null);
    setSession(null);
    setDynamicItems([]);
    router.replace("/");
    router.refresh();
  };

  // Determine auth-specific fixed links
  const fixedLinks = session
    ? session.user.onboardingRequired
      ? authNavLinks.onboarding
      : authNavLinks.authenticated
    : authNavLinks.guest;

  // Filter dynamic items by visibility for the current session state
  const visibleItems = dynamicItems.filter((item) => {
    if (!item.isActive) return false;
    if (item.visibility === "authenticated" && !session) return false;
    return true;
  });

  return (
    <nav aria-label="Primary" className={styles.nav}>
      {/* Home link is always first */}
      <Link
        key="/"
        className={`${styles.navLink} ${pathname === "/" ? styles.navLinkActive : ""}`.trim()}
        href="/"
      >
        Home
      </Link>

      {/* Dynamic navigation items from NavigationService */}
      {visibleItems.map((item) => {
        // Items with visible children render as an accessible dropdown
        const visibleChildren = item.children.filter((c) => {
          if (!c.isActive) return false;
          if (c.visibility === "authenticated" && !session) return false;
          return true;
        });
        if (visibleChildren.length > 0) {
          return (
            <NavDropdown
              key={item.id}
              item={{ ...item, children: visibleChildren }}
              pathname={pathname}
            />
          );
        }
        return (
          <NavItemLink
            key={item.id}
            className={styles.navLink}
            item={item}
            pathname={pathname}
          />
        );
      })}

      {/* Auth-specific fixed links */}
      {fixedLinks.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link
            key={link.href}
            className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`.trim()}
            href={link.href}
          >
            {link.label}
          </Link>
        );
      })}

      {session ? (
        <button className={styles.navButton} onClick={onSignOut} type="button">
          Sign out
        </button>
      ) : null}
    </nav>
  );
}
