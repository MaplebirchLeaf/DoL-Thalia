import { appendFile } from 'node:fs/promises';
import { readOption } from '../core/args';
import { loadConfig } from '../core/config';
import { createReleasePlan, releaseEnvironment } from '../release/plan';

const tag = readOption(process.argv.slice(2), ['--tag=']) ?? process.env.INPUT_TAG ?? '';
const requestedTag = tag || (process.env.GITHUB_REF_TYPE === 'tag' ? (process.env.GITHUB_REF_NAME ?? '') : '');
const plan = await createReleasePlan(requestedTag, await loadConfig());

function gitRevision(ref: string): string {
  const result = Bun.spawnSync(['git', 'rev-parse', ref], { stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error(`Cannot resolve Git revision: ${ref}`);
  return result.stdout.toString().trim();
}

const sourceCommit = gitRevision('HEAD');
const existingTag = Bun.spawnSync(['git', 'rev-parse', '-q', '--verify', `refs/tags/${plan.tag}`], { stdout: 'pipe', stderr: 'pipe' });
if (existingTag.exitCode === 0) {
  const tagCommit = gitRevision(`refs/tags/${plan.tag}^{commit}`);
  if (tagCommit !== sourceCommit) throw new Error(`Release tag ${plan.tag} points to ${tagCommit}, but checkout is ${sourceCommit}.`);
}

if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, releaseEnvironment(plan));
console.log(`Release: ${plan.tag} (${plan.edition} ${plan.gameVersion} at ${sourceCommit}; ${plan.presets.length} presets)`);
