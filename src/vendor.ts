import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { UpstreamConfig } from './config';
import { run } from './process';

export async function syncGitRepo(repo: UpstreamConfig): Promise<void> {
  if (!existsSync(repo.path)) {
    await mkdir(dirname(repo.path), { recursive: true });
    await run(['git', 'clone', repo.url, repo.path]);
  }

  await run(['git', 'fetch', '--all', '--tags'], {
    cwd: repo.path
  });

  await run(['git', 'checkout', repo.ref], {
    cwd: repo.path
  });
}
