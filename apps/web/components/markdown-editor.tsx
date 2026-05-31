"use client";

/**
 * MarkdownEditor
 *
 * Shared editor component for Milestone 3 content types (blog posts, standalone
 * pages, blog comments). Provides two modes over a single stored Markdown
 * representation:
 *
 *  - "write"   — raw Markdown textarea for direct Markdown entry.
 *  - "preview" — sanitized rendered output via MarkdownRenderer.
 *
 * The component is fully controlled: it owns no internal body state. Callers
 * pass `value` and `onChange` and decide when to persist.
 *
 * Design decisions (Milestone 3):
 * - One stored representation: Markdown only. WYSIWYG/preview is a rendering
 *   concern; the persisted form is always Markdown.
 * - No external Markdown library; the preview uses the shared MarkdownRenderer.
 * - Reusable across blog-post editor, standalone-page editor, and comment forms.
 */

import React, { useState } from "react";

import { MarkdownRenderer } from "./markdown-renderer";
import styles from "./markdown-editor.module.css";

type EditorMode = "write" | "preview";

export interface MarkdownEditorProps {
  /** The current Markdown value (controlled). */
  value: string;
  /** Called with the updated Markdown string on each keystroke. */
  onChange: (value: string) => void;
  /** Placeholder shown in the write textarea. */
  placeholder?: string;
  /** Minimum rows for the textarea. Defaults to 8. */
  rows?: number;
  /** Optional label shown above the editor. */
  label?: string;
  /** When true the editor and mode controls are disabled. */
  disabled?: boolean;
  /** Optional id attribute forwarded to the textarea. */
  id?: string;
}

/**
 * Shared Markdown editor used across all Milestone 3 authoring surfaces.
 *
 * Renders a mode toggle (Write / Preview) above the editing surface. In Write
 * mode a plain textarea is shown. In Preview mode the Markdown is rendered via
 * MarkdownRenderer.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write Markdown here...",
  rows = 8,
  label,
  disabled = false,
  id
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<EditorMode>("write");

  return (
    <div className={styles.container}>
      {label && <label className={styles.label} htmlFor={id}>{label}</label>}
      <div className={styles.toolbar} role="group" aria-label="Editor mode">
        <button
          type="button"
          className={mode === "write" ? styles.tabActive : styles.tab}
          onClick={() => setMode("write")}
          disabled={disabled}
          aria-pressed={mode === "write"}
        >
          Write
        </button>
        <button
          type="button"
          className={mode === "preview" ? styles.tabActive : styles.tab}
          onClick={() => setMode("preview")}
          disabled={disabled}
          aria-pressed={mode === "preview"}
        >
          Preview
        </button>
      </div>

      {mode === "write" ? (
        <textarea
          id={id}
          className={styles.textarea}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          aria-label={label ?? "Markdown editor"}
        />
      ) : (
        <div className={styles.preview} aria-label="Markdown preview">
          {value.trim() ? (
            <MarkdownRenderer content={value} />
          ) : (
            <span className={styles.emptyPreview}>Nothing to preview yet.</span>
          )}
        </div>
      )}
    </div>
  );
}
