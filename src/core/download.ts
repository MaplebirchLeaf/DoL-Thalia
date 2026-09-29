import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface DownloadOptions {
  /** Extra request headers, merged over the defaults. */
  headers?: Record<string, string>;
  /** Human-readable label used in error messages. */
  label?: string;
  /** Send the GitHub token when one is configured (release asset downloads). */
  githubAuth?: boolean;
}

/** Default headers shared by every outbound request. */
export function defaultHeaders(): Record<string, string> {
  return { 'User-Agent': 'DoL-Thalia' };
}

/**
 * GitHub API/asset headers: JSON accept, identifying user agent, and the token
 * from GITHUB_TOKEN when present (required for private release assets).
 */
export function githubHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    ...defaultHeaders(),
    ...(Bun.env.GITHUB_TOKEN ? { Authorization: `Bearer ${Bun.env.GITHUB_TOKEN}` } : {})
  };
}

/**
 * Fetch a URL and return the response body, failing with a labelled error on a
 * non-2xx status. Centralised so error messages stay consistent across callers.
 */
export async function fetchOk(url: string, options: DownloadOptions = {}): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      ...defaultHeaders(),
      ...(options.githubAuth ? githubHeaders() : {}),
      ...options.headers
    }
  });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${options.label ?? url}`);
  return response;
}

/**
 * Download a URL to a file, creating the parent directory first.
 *
 * The body is streamed to disk rather than buffered, so large release assets
 * (mod packs and toolchain archives) do not have to fit in memory.
 */
export async function downloadFile(url: string, output: string, options: DownloadOptions = {}): Promise<void> {
  await mkdir(dirname(output), { recursive: true });
  const response = await fetchOk(url, options);
  const temporary = `${output}.${randomUUID()}.part`;
  try {
    if (response.body) await writeFile(temporary, response.body);
    else await writeFile(temporary, new Uint8Array(await response.arrayBuffer()));
    await rename(temporary, output);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
