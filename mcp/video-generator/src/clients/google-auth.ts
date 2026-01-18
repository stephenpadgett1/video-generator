import fs from "fs";
import jwt from "jsonwebtoken";
import { loadConfig } from "../utils/config.js";
import { resolvePath } from "../utils/paths.js";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

interface AccessTokenResult {
  accessToken: string;
  projectId: string;
}

let cachedToken: { token: string; projectId: string; expiresAt: number } | null = null;

/**
 * Get Google Cloud access token for Vertex AI APIs (Veo, Gemini, Imagen)
 * Uses service account JWT exchange
 */
export async function getGoogleAccessToken(): Promise<AccessTokenResult> {
  const now = Math.floor(Date.now() / 1000);

  // Return cached token if still valid (with 5 minute buffer)
  if (cachedToken && cachedToken.expiresAt > now + 300) {
    return { accessToken: cachedToken.token, projectId: cachedToken.projectId };
  }

  const config = loadConfig();
  const serviceAccountPath = config.veoServiceAccountPath as string;

  if (!serviceAccountPath) {
    throw new Error("veoServiceAccountPath not configured in data/config.json");
  }

  const resolvedPath = resolvePath(serviceAccountPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Service account file not found: ${resolvedPath}`);
  }

  const serviceAccount: ServiceAccount = JSON.parse(
    fs.readFileSync(resolvedPath, "utf-8")
  );

  // Create JWT for token exchange
  const jwtPayload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/cloud-platform",
  };

  const signedJwt = jwt.sign(jwtPayload, serviceAccount.private_key, {
    algorithm: "RS256",
  });

  // Exchange JWT for access token
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedJwt}`,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get access token: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };

  // Cache the token
  cachedToken = {
    token: data.access_token,
    projectId: serviceAccount.project_id,
    expiresAt: now + data.expires_in,
  };

  return { accessToken: data.access_token, projectId: serviceAccount.project_id };
}

/**
 * Build Vertex AI endpoint URL
 *
 * @param location - Region or "global" for models that require global endpoint
 *                   (e.g., gemini-3-pro-image-preview is global-only)
 */
export function buildVertexUrl(
  projectId: string,
  model: string,
  method: string,
  location: string = "us-central1"
): string {
  if (location === "global") {
    // Global endpoint: no region prefix on hostname
    return `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/publishers/google/models/${model}:${method}`;
  }
  // Regional endpoint
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:${method}`;
}
