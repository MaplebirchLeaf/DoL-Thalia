import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { UpstreamConfig } from '../core/config';
import { logWarn } from '../core/log';
import { run } from '../core/process';

export async function syncGitRepository(repository: UpstreamConfig): Promise<void> {
  const repoPath = resolve(repository.path);
  let cloned = false;
  if (!existsSync(repoPath)) {
    await mkdir(dirname(repoPath), { recursive: true });
    await run(['git', 'clone', repository.url, repoPath], { quiet: true });
    cloned = true;
  }

  if (cloned) await run(['git', 'checkout', repository.ref], { cwd: repoPath, quiet: true });
  if (Bun.env.GITHUB_ACTIONS === 'true') return;

  try {
    await run(['git', 'fetch', '--all', '--tags'], { cwd: repoPath, quiet: true, printOutputOnError: false });
    await run(['git', 'checkout', repository.ref], { cwd: repoPath, quiet: true, printOutputOnError: false });
    await run(['git', 'pull', '--ff-only'], { cwd: repoPath, quiet: true, printOutputOnError: false });
  } catch {
    logWarn(`同步失败，继续使用本地仓库：${repoPath}`);
  }
}
