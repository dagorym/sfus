"use client";

/**
 * ImageUpload
 *
 * Shared image-upload widget used across Milestone 3 content types (blog posts,
 * standalone pages, blog comments). Sends a multipart/form-data request to the
 * protected API upload endpoint and returns the resulting media URL to the
 * caller via the onUpload callback.
 *
 * Authorization: the endpoint requires an active session cookie. Unauthorized
 * requests receive a 401; callers must redirect to login in that case.
 *
 * Design decisions (Milestone 3):
 * - Only image/* files are selectable via the file input accept attribute.
 * - Final MIME and size validation is enforced server-side; the client
 *   performs an early rejection of obviously non-image files as UX only.
 * - The resourceType prop scopes the upload to the correct Milestone 3 type.
 * - No external file-upload library is used.
 */

import React, { useRef, useState } from "react";

import styles from "./image-upload.module.css";

/** Resource type values accepted by the API upload endpoint. */
export type ImageUploadResourceType = "blog-post" | "standalone-page" | "blog-comment";

export interface ImageUploadResult {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
}

export interface ImageUploadProps {
  /**
   * Scopes the upload to a Milestone 3 content type. Must match the
   * resourceType values accepted by the API.
   */
  resourceType: ImageUploadResourceType;
  /**
   * Called with the upload result when the server successfully processes the
   * file. Callers typically insert the returned URL into the Markdown body.
   */
  onUpload: (result: ImageUploadResult) => void;
  /**
   * Called when the upload fails. Receives a human-readable error message.
   */
  onError?: (message: string) => void;
  /** API base path. Defaults to the NEXT_PUBLIC_API_BASE_PATH env var or "/api". */
  apiBasePath?: string;
  /** When true the upload button and file input are disabled. */
  disabled?: boolean;
  /** Label text for the upload control. Defaults to "Upload image". */
  label?: string;
}

const DEFAULT_API_BASE = process.env.NEXT_PUBLIC_API_BASE_PATH ?? "/api";

/**
 * Shared image-upload widget for all Milestone 3 content authoring surfaces.
 *
 * Uploads are sent to POST /api/media/upload with the correct resourceType
 * query parameter. The API enforces authorization and MIME/size validation.
 */
export function ImageUpload({
  resourceType,
  onUpload,
  onError,
  apiBasePath = DEFAULT_API_BASE,
  disabled = false,
  label = "Upload image"
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "error" | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Early client-side MIME check (UX only — server validates authoritatively).
    if (!file.type.startsWith("image/")) {
      const msg = "Only image files are allowed.";
      setStatusMessage(msg);
      setStatusType("error");
      onError?.(msg);
      return;
    }

    setUploading(true);
    setStatusMessage(null);
    setStatusType(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const url = `${apiBasePath}/media/upload?resourceType=${encodeURIComponent(resourceType)}`;
      const response = await fetch(url, {
        method: "POST",
        body: formData,
        credentials: "include"
      });

      if (response.status === 401) {
        const msg = "Authentication required. Please sign in to upload images.";
        setStatusMessage(msg);
        setStatusType("error");
        onError?.(msg);
        return;
      }

      if (!response.ok) {
        let msg = "Upload failed.";
        try {
          const body = (await response.json()) as { message?: string };
          if (body.message) msg = body.message;
        } catch {
          // ignore JSON parse error
        }
        setStatusMessage(msg);
        setStatusType("error");
        onError?.(msg);
        return;
      }

      const result = (await response.json()) as ImageUploadResult;
      setStatusMessage(`Uploaded: ${result.originalFilename}`);
      setStatusType("success");
      onUpload(result);
    } catch {
      const msg = "Upload failed due to a network error. Please try again.";
      setStatusMessage(msg);
      setStatusType("error");
      onError?.(msg);
    } finally {
      setUploading(false);
      // Reset so the same file can be re-selected if needed.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className={styles.container}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={disabled || uploading}
        className={styles.fileInput}
        aria-label={label}
        id="image-upload-input"
      />
      <label
        htmlFor="image-upload-input"
        className={`${styles.uploadButton}${disabled || uploading ? ` ${styles.uploadButtonDisabled}` : ""}`}
      >
        {uploading ? "Uploading…" : label}
      </label>
      {statusMessage && (
        <span
          className={statusType === "error" ? styles.statusError : styles.statusSuccess}
          role={statusType === "error" ? "alert" : "status"}
        >
          {statusMessage}
        </span>
      )}
    </div>
  );
}
