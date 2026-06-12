import type { BuildReleaseOptions, ReleaseTarget } from '../builders/release';

const RELEASE_TARGETS: ReleaseTarget[] = ['html', 'zip', 'apk'];

export function parseReleaseOptions(args: string[]): BuildReleaseOptions {
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
    presets,
    skipModSources: args.includes('--skip-mod-sources'),
    skipPrepare: args.includes('--skip-prepare'),
    targets: targets as ReleaseTarget[],
    versions
  };
}

function readListOption(args: string[], names: string[]): string[] {
  const values: string[] = [];
  for (const arg of args) {
    const name = names.find(item => arg.startsWith(item));
    if (!name) continue;
    values.push(
      ...arg
        .slice(name.length)
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
    );
  }
  return [...new Set(values)];
}
