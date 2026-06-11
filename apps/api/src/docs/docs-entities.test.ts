import { describe, expect, it } from "vitest";

import { DocsPageEntity } from "./entities/docs-page.entity";
import { DocsRevisionEntity } from "./entities/docs-revision.entity";
import {
  docsScopeTypes,
  docsPageStatuses,
  docsVisibilities,
  DOCS_LOCK_TTL_MINUTES_DEFAULT
} from "./docs.types";

/**
 * Validates ST-1 acceptance criteria for entity schema correctness and type exports.
 *
 * These tests work at the TypeScript class/decorator metadata level without a live
 * database connection — they confirm the entity definitions compile and carry the
 * expected structural properties that back the migration DDL.
 */

describe("DocsPageEntity", () => {
  it("compiles and can be instantiated", () => {
    // Acceptance criterion: Both entities compile and are registered in reviewedEntityClasses.
    const entity = new DocsPageEntity();
    expect(entity).toBeInstanceOf(DocsPageEntity);
  });

  it("carries scopeType, scopeId, title, slug, path, pathHash columns", () => {
    // Acceptance criterion: docs_pages schema with path_hash char(64) unique per (scope_type, scope_id).
    const entity = new DocsPageEntity();
    expect("scopeType" in entity).toBe(true);
    expect("scopeId" in entity).toBe(true);
    expect("title" in entity).toBe(true);
    expect("slug" in entity).toBe(true);
    expect("path" in entity).toBe(true);
    expect("pathHash" in entity).toBe(true);
  });

  it("carries parentId and depth for tree structure", () => {
    // docs_pages tree structure: parent_id, depth
    const entity = new DocsPageEntity();
    expect("parentId" in entity).toBe(true);
    expect("depth" in entity).toBe(true);
  });

  it("carries visibility and status columns", () => {
    const entity = new DocsPageEntity();
    expect("visibility" in entity).toBe(true);
    expect("status" in entity).toBe(true);
  });

  it("carries soft-lock columns required by the schema", () => {
    // Acceptance criterion: Soft-lock columns (is_locked, locked_by_user_id, locked_at, lock_expires_at)
    // are present in the entity and migration; lock behaviour is wired in ST-6.
    const entity = new DocsPageEntity();
    expect("isLocked" in entity).toBe(true);
    expect("lockedByUserId" in entity).toBe(true);
    expect("lockedAt" in entity).toBe(true);
    expect("lockExpiresAt" in entity).toBe(true);
  });

  it("carries currentRevisionId and createdByUserId FK columns", () => {
    const entity = new DocsPageEntity();
    expect("currentRevisionId" in entity).toBe(true);
    expect("createdByUserId" in entity).toBe(true);
  });

  it("carries audit timestamp columns createdAt and updatedAt", () => {
    const entity = new DocsPageEntity();
    expect("createdAt" in entity).toBe(true);
    expect("updatedAt" in entity).toBe(true);
  });
});

describe("DocsRevisionEntity", () => {
  it("compiles and can be instantiated", () => {
    // Acceptance criterion: Both entities compile and are registered in reviewedEntityClasses.
    const entity = new DocsRevisionEntity();
    expect(entity).toBeInstanceOf(DocsRevisionEntity);
  });

  it("carries pageId, authorUserId, editorUserId FK columns", () => {
    const entity = new DocsRevisionEntity();
    expect("pageId" in entity).toBe(true);
    expect("authorUserId" in entity).toBe(true);
    expect("editorUserId" in entity).toBe(true);
  });

  it("carries title, body, summary content columns", () => {
    const entity = new DocsRevisionEntity();
    expect("title" in entity).toBe(true);
    expect("body" in entity).toBe(true);
    expect("summary" in entity).toBe(true);
  });

  it("carries revisionNumber for immutable content tracking", () => {
    // docs_revisions.revision_number supports per-page revision numbering
    const entity = new DocsRevisionEntity();
    expect("revisionNumber" in entity).toBe(true);
  });

  it("carries createdAt audit timestamp", () => {
    const entity = new DocsRevisionEntity();
    expect("createdAt" in entity).toBe(true);
  });
});

describe("docs.types vocabulary", () => {
  it("docsScopeTypes includes 'site' and 'project'", () => {
    // Acceptance criterion: DocsScopeType type alias exported from docs.types.ts.
    // forward-scaffolding for M7/M8 project scope.
    expect(docsScopeTypes).toContain("site");
    expect(docsScopeTypes).toContain("project");
  });

  it("docsPageStatuses includes 'published' and 'deleted'", () => {
    // Acceptance criterion: DocsPageStatus type alias exported from docs.types.ts.
    expect(docsPageStatuses).toContain("published");
    expect(docsPageStatuses).toContain("deleted");
  });

  it("docsVisibilities covers the standard authorization vocabulary", () => {
    // Acceptance criterion: DocsVisibility type alias exported from docs.types.ts.
    expect(docsVisibilities).toContain("public");
    expect(docsVisibilities).toContain("unlisted");
    expect(docsVisibilities).toContain("members");
    expect(docsVisibilities).toContain("private");
  });

  it("DOCS_LOCK_TTL_MINUTES_DEFAULT is a positive integer", () => {
    // Acceptance criterion: DOCS_LOCK_TTL_MINUTES_DEFAULT constant exported from docs.types.ts.
    expect(typeof DOCS_LOCK_TTL_MINUTES_DEFAULT).toBe("number");
    expect(DOCS_LOCK_TTL_MINUTES_DEFAULT).toBeGreaterThan(0);
    expect(Number.isInteger(DOCS_LOCK_TTL_MINUTES_DEFAULT)).toBe(true);
  });
});
