"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "../app/layout.module.css";

const navigation = [{ href: "/", label: "Home" }];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className={styles.nav}>
      {navigation.map((item) => {
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`.trim()}
            href={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
