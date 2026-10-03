import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workflow = Bun.YAML.parse(await Bun.file('.github/workflows/release.yml').text()) as {
  jobs: { release: { steps: Array<{ name?: string; run?: string }> } };
};
const validation = workflow.jobs.release.steps.find(step => step.name === 'Validate release tag and source commit')?.run;
if (!validation) throw new Error('Release workflow has no tag validation script');
const sourceCommit = 'a'.repeat(40);
const englishPresets = ['thalia', 'goose-f-mysterious', 'goose-m-mysterious', 'goose-f', 'goose-m', 'mysterious'];
const standardPresets = [...englishPresets, ...englishPresets.map(name => (name === 'thalia' ? 'chs' : `chs-${name}`))];

// Only ref syntax reaches real Git; commit lookups are controlled and every other action fails.
const mockGit = `
git() {
  case "$1" in
    check-ref-format) command git "$@" ;;
    rev-parse)
      if [ "$2" = "HEAD" ]; then printf '%s\\n' "$THALIA_TEST_SOURCE_COMMIT"
      elif [ "$2" = "-q" ]; then test "$THALIA_TEST_TAG_STATE" != "absent"
      else printf '%s\\n' "$THALIA_TEST_TAG_COMMIT"
      fi ;;
    *) echo "Unexpected Git action: $1" >&2; return 1 ;;
  esac
}
`;

async function validateTag(tag: string, state = 'absent', triggerTag?: string) {
  const root = await mkdtemp(join(tmpdir(), 'thalia-workflow-'));
  const envFile = join(root, 'github-env');
  try {
    await writeFile(envFile, '');
    const result = Bun.spawnSync(['bash', '--noprofile', '--norc', '-e', '-o', 'pipefail'], {
      cwd: root,
      env: {
        ...process.env,
        INPUT_TAG: tag,
        GITHUB_REF_TYPE: triggerTag ? 'tag' : 'branch',
        GITHUB_REF_NAME: triggerTag ?? 'main',
        GITHUB_ENV: envFile,
        THALIA_TEST_SOURCE_COMMIT: sourceCommit,
        THALIA_TEST_TAG_STATE: state,
        THALIA_TEST_TAG_COMMIT: state === 'same' ? sourceCommit : 'b'.repeat(40)
      },
      stdin: Buffer.from(mockGit + validation),
      stdout: 'pipe',
      stderr: 'pipe'
    });
    const rows = (await readFile(envFile, 'utf8')).trimEnd().split('\n').filter(Boolean);
    const values = Object.fromEntries(rows.map(row => [row.slice(0, row.indexOf('=')), row.slice(row.indexOf('=') + 1)]));
    return { status: result.exitCode, values, error: result.stderr.toString() };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('release workflow resolves standard and DoLP tags, dates and complete preset lists', async () => {
  for (const [tag, game, version, date, presets] of [
    ['v0.5.12.13', 'standard', '0.5.12.13', '', standardPresets],
    ['v0.5.12.13-1003', 'standard', '0.5.12.13', '1003', standardPresets],
    ['vdolp-0.778', 'dolp', '0.778', '', englishPresets],
    ['vdolp-0.778-1003', 'dolp', '0.778', '1003', englishPresets]
  ] as const) {
    const result = await validateTag(tag);
    expect(result.status).toBe(0);
    expect(result.values.THALIA_RELEASE_TAG).toBe(tag);
    expect(result.values.THALIA_GAME).toBe(game);
    expect(result.values.THALIA_GAME_VERSION).toBe(version);
    expect(result.values.THALIA_RELEASE_DATE).toBe(date);
    expect(result.values.THALIA_PRESETS.split(',')).toEqual(presets);
  }
  const triggered = await validateTag('', 'absent', 'vdolp-0.778-1003');
  expect(triggered.status).toBe(0);
  expect(triggered.values.THALIA_RELEASE_TAG).toBe('vdolp-0.778-1003');
});

test('release workflow refuses malformed input before writing the build environment', async () => {
  for (const tag of ['', 'dolp-0.778', 'v0.5.12', 'v0.5.12.13/bad', 'v0.5.12.13-100', 'v0.5.12.13\nTHALIA_GAME=dolp']) {
    const result = await validateTag(tag);
    expect(result.status).not.toBe(0);
    expect(result.values).toEqual({});
  }
});

test('release workflow refuses a preexisting tag pointing to another commit', async () => {
  const result = await validateTag('v0.5.12.13', 'different');
  expect(result.status).not.toBe(0);
  expect(result.error).toContain('points to');
  expect(result.values).toEqual({});
});

test('release workflow permits a preexisting tag pointing to the checkout commit', async () => {
  const result = await validateTag('v0.5.12.13', 'same');
  expect(result.status).toBe(0);
  expect(result.values.THALIA_RELEASE_TAG).toBe('v0.5.12.13');
});

test('release validates the signing keystore after Java setup and before costly build preparation', () => {
  const steps = workflow.jobs.release.steps;
  const java = steps.findIndex(step => step.name === 'Setup Java');
  const signing = steps.findIndex(step => step.name === 'Restore and validate APK signing keystore');
  const sdk = steps.findIndex(step => step.name === 'Setup Android SDK');
  const build = steps.findIndex(step => step.name === 'Build release assets');
  expect(java).toBeGreaterThanOrEqual(0);
  expect(signing).toBeGreaterThan(java);
  expect(signing).toBeLessThan(sdk);
  expect(signing).toBeLessThan(build);
});
