Implementer Report — ST-6 Remediation Pass 1

## Task

Fix 2 BLOCKING and 1 WARNING defects from the ST-6 verifier-1-fail pass.

## Changes Made

### BLOCKING-1: 409 holder metadata stripped by JsonExceptionFilter

**File:** `apps/api/src/common/filters/json-exception.filter.ts`

Extended the `ErrorPayload` interface with an optional `details?: unknown` field on the `error` object. Added an `extractDetails` helper that reads `responseBody.details` from the HttpException body and returns it when present (undefined otherwise, preserving backward-compatible envelopes). Updated `buildPayload` to spread `details` conditionally into the response envelope.

**File:** `apps/api/src/docs/docs.service.ts`

Changed both lock-conflict `ConflictException` throws (in `assertNotForeignLocked` at line 455 and in `acquireLock` at line 514) from `{ message, lock: conflict }` to `{ message, details: conflict }`. This places `lockedByUserId` and `lockExpiresAt` under the `details` key, which the updated filter passes through to HTTP clients as `error.details`.

### BLOCKING-2: acquireLock 200 response double-nested

**File:** `apps/api/src/docs/docs.controller.ts`

Changed `acquireLock` controller method return type from `Promise<{ lock: DocsLockResultShape }>` to `Promise<DocsLockResultShape>` and return statement from `return { lock }` to `return this.docsService.acquireLock(...)` directly. The 200 response body is now `{ pageId, lock: DocsLockState }` per AC1.

### WARNING-1: softDeletePage lock check outside transaction

**File:** `apps/api/src/docs/docs.service.ts`

Refactored `softDeletePage` to wrap all operations in `this.pageRepository.manager.transaction`. The page load, lock check (`assertNotForeignLocked`), child count, and soft-delete update all now execute inside a single transaction, consistent with `addRevision`, `renamePage`, and `rollbackPage`.

### Test updates (required to keep existing tests green after code changes)

**File:** `apps/api/src/docs/docs.service.test.ts`
- Added `manager`, `count`, `update` to `MinimalRepo` interface (pre-existing typecheck gap)
- Added defaults for `count`, `update`, `manager` to `createMinimalRepo`
- Updated `assertNotForeignLocked` holder-metadata test: `response.lock.*` → `response.details.*`
- Updated `acquireLock` ConflictException test: `response.lock.*` → `response.details.*`
- Updated `softDeletePage` AC6 test: replaced direct-repo mock with transaction manager mock

**File:** `apps/api/src/docs/docs.controller.test.ts`
- Updated acquireLock success assertion: `{ lock: makeLockResult() }` → `makeLockResult()`
- Updated 409 propagation test: `{ lock: {} }` → `{ details: {} }`

## Validation Results

- `npx tsc --noEmit --project apps/api/tsconfig.json` — PASS (0 errors)
- `npx vitest run --passWithNoTests` (from repo root) — PASS (1851 passed, 26 skipped integration)
- `npx eslint` on changed files — PASS (0 errors)
- `npx tsc --project apps/api/tsconfig.json` (build) — PASS (0 errors)

## Implementation Commit

`c914da4`

## Artifact Directory

`artifacts/ms5-documents-wiki/ST-6/`
