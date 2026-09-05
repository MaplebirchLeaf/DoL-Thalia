import type { BuildReleaseOptions, ReleaseTarget } from '../builders/release';
import { readListOption, readOption } from '../core/args';

const RELEASE_TARGETS: ReleaseTarget[] = ['html', 'zip', 'apk'];

export function parseReleaseOptions(args: string[]): BuildReleaseOptions {
  const game = readOption(args, ['--game=']);
  const versions = readListOption(args, ['--version=', '--versions=']);
  const presets = readListOption(args, ['--preset=', '--presets=', '--config=', '--configs=']);
  const targets = [
    ...readListOption(args, ['--target=', '--targets=']),
    ...(args.includes('--html') ? ['html'] : []),
    ...(args.includes('--zip') ? ['zip'] : []),
    ...(args.includes('--apk') ? ['apk'] : [])
  ];

  for (const target of targets) {
    if (!RELEASE_TARGETS.includes(target as ReleaseTarget)) throw new Error(`Unknown release target: ${target}. Available targets: ${RELEASE_TARGETS.join(', ')}`);
  }

  return {
    fast: args.includes('--fast'),
    game,
    presets,
    skipModSources: args.includes('--skip-mod-sources'),
    skipPrepare: args.includes('--skip-prepare'),
    targets: targets as ReleaseTarget[],
    versions
  };
}
