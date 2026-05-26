import type { Metadata } from "next";
import Link from "next/link";
import { Navigation } from "../components/navigation";
import "./globals.css";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://starfrontiers.us"),
  title: {
    default: "Star Frontiers US",
    template: "%s | Star Frontiers US"
  },
  description:
    "Public landing page and auth-enabled shell foundation for the Star Frontiers US Milestone 2 experience."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className={styles.shell}>
          <header className={styles.header}>
            <div className={styles.headerInner}>
              <div className={styles.brandBlock}>
                <p className={styles.brandEyebrow}>Milestone 2 Auth Foundation</p>
                <Link className={styles.brandLink} href="/">
                  <h1 className={styles.brandTitle}>Star Frontiers US</h1>
                </Link>
                <p className={styles.brandSubtitle}>
                  A clean public entry point for the tabletop RPG campaign hub.
                </p>
              </div>
              <Navigation />
            </div>
          </header>
          <main className={styles.main}>
            <div className={styles.mainInner}>{children}</div>
          </main>
          <footer className={styles.footer}>
            <div className={styles.footerInner}>
              <p className={styles.footerText}>Star Frontiers US · Public foundation shell</p>
              <p className={styles.footerText}>Built for the Milestone 2 auth launch baseline.</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
