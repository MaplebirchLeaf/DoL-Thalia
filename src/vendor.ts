import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { UpstreamConfig } from './config';
import { logWarn } from './log';
import { run } from './process';

export async function syncGitRepo(repo: UpstreamConfig): Promise<void> {
  const repoPath = resolve(repo.path);
  if (!existsSync(repoPath)) {
    await mkdir(dirname(repoPath), { recursive: true });
    await run(['git', 'clone', repo.url, repoPath], { quiet: true });
  }

  if (Bun.env.GITHUB_ACTIONS === 'true') return;

  try {
    await run(['git', 'fetch', '--all', '--tags'], { cwd: repoPath, quiet: true, printOutputOnError: false });
    await run(['git', 'checkout', repo.ref], { cwd: repoPath, quiet: true, printOutputOnError: false });
    await run(['git', 'pull', '--ff-only'], { cwd: repoPath, quiet: true, printOutputOnError: false });
  } catch {
    logWarn(`同步失败，继续使用本地仓库：${repoPath}`);
  }
}
