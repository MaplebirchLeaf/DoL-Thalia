import { expect, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadFile } from '../src/core/download';

test('a completed download atomically replaces the destination', async () => {
  const root = await mkdtemp(join(tmpdir(), 'thalia-download-'));
  const output = join(root, 'asset.zip');
  const originalFetch = globalThis.fetch;
  try {
    await writeFile(output, 'previous archive');
    globalThis.fetch = async () => new Response('complete archive');
    await downloadFile('https://example.invalid/asset.zip', output);
    expect(await readFile(output, 'utf8')).toBe('complete archive');
    expect(await readdir(root)).toEqual(['asset.zip']);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test('a failed download preserves the previous file and cleans its temporary file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'thalia-download-'));
  const output = join(root, 'asset.zip');
  const originalFetch = globalThis.fetch;
  try {
    await writeFile(output, 'previous archive');
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('partial archive'));
            controller.error(new Error('connection lost'));
          }
        })
      );

    await expect(downloadFile('https://example.invalid/asset.zip', output)).rejects.toThrow('connection lost');
    expect(await readFile(output, 'utf8')).toBe('previous archive');
    expect(await readdir(root)).toEqual(['asset.zip']);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});
