"use client";

/**
 * MentionAutocomplete
 *
 * Listens for "@" followed by characters in a Markdown editor textarea and
 * shows a dropdown of matching active users fetched from the session-gated
 * suggest endpoint (GET /api/users/suggest?q=). Selecting a suggestion
 * inserts "@username " at the current cursor position.
 *
 * Security:
 * - Calls the ST14 suggest endpoint only; never builds a parallel user listing.
 * - Suggest results expose only username/displayName/avatarUrl — nothing else.
 * - Inserted handle is the raw username string (safe plain text).
 * - The component never renders user-supplied HTML.
 *
 * Keyboard accessibility:
 * - Arrow keys navigate the suggestion list.
 * - Enter selects the highlighted suggestion.
 * - Escape closes the dropdown.
 * - All interactive elements are keyboard-reachable.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

import { suggestUsers, type UserSuggestItem } from "../app/forums/forums-client";
import { UserAvatar } from "./user-avatar";
import styles from "./mention-autocomplete.module.css";

export interface MentionAutocompleteProps {
  /**
   * Current value of the editor textarea (controlled).
   */
  value: string;
  /**
   * Called when the value changes (user types or a suggestion is inserted).
   */
  onChange: (value: string) => void;
  /**
   * Forwarded to the underlying textarea.
   */
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}

/**
 * Debounce helper — returns a debounced version of `fn`.
 */
function useDebounce<T extends (...args: Parameters<T>) => void>(fn: T, delay: number): T {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (...args: Parameters<T>) => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => fn(...args), delay);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn, delay]
  ) as T;
}

export function MentionAutocomplete({
  value,
  onChange,
  placeholder = "Write Markdown here…",
  rows = 8,
  disabled = false,
  id,
  "aria-label": ariaLabel
}: MentionAutocompleteProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<UserSuggestItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  /** The start position of the current @-mention being typed. */
  const mentionStartRef = useRef<number | null>(null);

  // Debounced fetch so we don't hammer the endpoint on every keystroke.
  const fetchSuggestions = useCallback(async (q: string) => {
    const results = await suggestUsers(q);
    setSuggestions(results);
    setActiveIndex(0);
    setShowDropdown(results.length > 0);
  }, []);

  const debouncedFetch = useDebounce(
    (q: string) => {
      void fetchSuggestions(q);
    },
    200
  );

  /**
   * Detect an active @-mention at the cursor: scan backward from the cursor
   * for an "@" character not preceded by a word char.
   */
  const detectMention = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const cursorPos = el.selectionStart;
    const textBefore = value.slice(0, cursorPos);

    // Find last "@" that's at word boundary (start of string, or preceded by space/newline/punct).
    const atIndex = textBefore.lastIndexOf("@");
    if (atIndex === -1) {
      setShowDropdown(false);
      mentionStartRef.current = null;
      return;
    }

    // Confirm the character before "@" is a word-boundary character (or start of string).
    const charBefore = atIndex > 0 ? textBefore[atIndex - 1] : " ";
    if (!/[\s,.([\n]/u.test(charBefore) && atIndex !== 0) {
      setShowDropdown(false);
      mentionStartRef.current = null;
      return;
    }

    const fragment = textBefore.slice(atIndex + 1);
    // Only trigger for a valid username prefix (alphanumeric/underscore/hyphen, max 30 chars).
    if (/^[a-zA-Z0-9_-]{0,30}$/.test(fragment)) {
      mentionStartRef.current = atIndex;
      debouncedFetch(fragment);
    } else {
      setShowDropdown(false);
      mentionStartRef.current = null;
    }
  }, [value, debouncedFetch]);

  /** Insert the selected suggestion handle into the textarea value. */
  const insertSuggestion = useCallback(
    (item: UserSuggestItem) => {
      const el = textareaRef.current;
      if (!el || mentionStartRef.current === null) return;
      const cursorPos = el.selectionStart;
      const mentionStart = mentionStartRef.current;
      const before = value.slice(0, mentionStart);
      const after = value.slice(cursorPos);
      // Insert "@username " — plain text, no HTML injection.
      const newValue = `${before}@${item.username} ${after}`;
      onChange(newValue);
      setShowDropdown(false);
      mentionStartRef.current = null;
      // Move cursor after the inserted mention: @username + space = username.length + 2.
      const newPos = mentionStart + item.username.length + 2;
      requestAnimationFrame(() => {
        el.setSelectionRange(newPos, newPos);
        el.focus();
      });
    },
    [value, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showDropdown) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        const item = suggestions[activeIndex];
        if (item) {
          e.preventDefault();
          insertSuggestion(item);
        }
      } else if (e.key === "Escape") {
        setShowDropdown(false);
      }
    },
    [showDropdown, suggestions, activeIndex, insertSuggestion]
  );

  useEffect(() => {
    detectMention();
  }, [value, detectMention]);

  return (
    <div className={styles.wrapper}>
      <textarea
        ref={textareaRef}
        id={id}
        className={styles.textarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        aria-label={ariaLabel ?? "Markdown editor with @mention autocomplete"}
        aria-autocomplete="list"
        aria-controls={showDropdown ? "mention-listbox" : undefined}
        autoComplete="off"
      />
      {showDropdown && suggestions.length > 0 && (
        <ul
          id="mention-listbox"
          role="listbox"
          aria-label="User suggestions"
          className={styles.dropdown}
        >
          {suggestions.map((item, idx) => (
            <li
              key={item.username}
              role="option"
              aria-selected={idx === activeIndex}
              className={`${styles.dropdownItem}${idx === activeIndex ? ` ${styles.dropdownItemActive}` : ""}`}
              onMouseDown={(e) => {
                // Use mousedown instead of click so the textarea doesn't lose focus.
                e.preventDefault();
                insertSuggestion(item);
              }}
            >
              <UserAvatar
                avatarSrc={item.avatarUrl}
                displayName={item.displayName}
                username={item.username}
                size={24}
              />
              <span className={styles.username}>@{item.username}</span>
              {item.displayName ? (
                <span className={styles.displayName}>{item.displayName}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
