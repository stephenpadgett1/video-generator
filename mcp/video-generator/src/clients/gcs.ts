import fs from "fs";
import path from "path";
import { getGoogleAccessToken } from "./google-auth.js";
import { resolvePath } from "../utils/paths.js";

/**
 * Upload a local file to GCS via the JSON upload API.
 * Uses the same OAuth access token as the Vertex client (cloud-platform scope covers storage).
 * Returns the gs:// URI of the uploaded object.
 */
export async function uploadFileToGcs(
  localPath: string,
  bucket: string,
  objectName: string,
  mimeType: string
): Promise<string> {
  const resolved = resolvePath(localPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  const data = fs.readFileSync(resolved);
  return uploadBytesToGcs(data, bucket, objectName, mimeType);
}

export async function uploadBytesToGcs(
  data: Buffer,
  bucket: string,
  objectName: string,
  mimeType: string
): Promise<string> {
  const { accessToken } = await getGoogleAccessToken();
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(
    bucket
  )}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": mimeType,
      "Content-Length": String(data.length),
    },
    body: new Uint8Array(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GCS upload failed: ${response.status} ${errorText}`);
  }

  return `gs://${bucket}/${objectName}`;
}

/**
 * Build a short unique object name for an uploaded file.
 */
export function buildObjectName(prefix: string, localPath: string): string {
  const base = path.basename(localPath);
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}/${stamp}-${rand}-${base}`;
}

export function inferImageMimeType(localPath: string): string {
  const ext = path.extname(localPath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "image/png";
}
