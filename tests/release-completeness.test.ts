import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/core/config';
import { verifyReleaseAssets } from '../src/release/verify';

test('release publication requires every ZIP and APK for the exact version and presets', async () => {
  const previousDate = Bun.env.THALIA_RELEASE_DATE;
  delete Bun.env.THALIA_RELEASE_DATE;
  const root = await mkdtemp(join(tmpdir(), 'thalia-release-'));
  const config = await loadConfig();
  config.game.version = '0.5.12.13';
  config.game.release_date = '1003';
  config.paths.output_zip = join(root, 'zip', 'unused.zip');
  config.paths.output_apk_dir = join(root, 'apk');
  try {
    for (const extension of ['zip', 'apk']) {
      await mkdir(join(root, extension));
      for (const preset of ['thalia', 'chs']) await writeFile(join(root, extension, `DoL-Thalia-0.5.12.13-${preset}-1003.${extension}`), 'fixture');
    }
    expect(await verifyReleaseAssets(config, ['thalia', 'chs'])).toHaveLength(4);
    const apk = join(root, 'apk', 'DoL-Thalia-0.5.12.13-chs-1003.apk');
    await rm(apk);
    await expect(verifyReleaseAssets(config, ['thalia', 'chs'])).rejects.toThrow('missing: DoL-Thalia-0.5.12.13-chs-1003.apk');
    await writeFile(apk, '');
    await expect(verifyReleaseAssets(config, ['thalia', 'chs'])).rejects.toThrow('Empty or invalid');
    await rm(apk);
    await writeFile(join(root, 'actual-apk'), 'fixture');
    await symlink(join(root, 'actual-apk'), apk);
    await expect(verifyReleaseAssets(config, ['thalia', 'chs'])).rejects.toThrow('Empty or invalid');
    await rm(apk);
    await writeFile(apk, 'fixture');
    const stale = join(root, 'zip', 'DoL-Thalia-0.5.12.12-thalia-1003.zip');
    await writeFile(stale, 'fixture');
    await expect(verifyReleaseAssets(config, ['thalia', 'chs'])).rejects.toThrow('unexpected: DoL-Thalia-0.5.12.12-thalia-1003.zip');
    await rm(stale);
    config.game.version = '0.778';
    await expect(verifyReleaseAssets(config, ['thalia', 'chs'])).rejects.toThrow('missing: DoL-Thalia-0.778');
    await expect(verifyReleaseAssets(config, [])).rejects.toThrow('nonempty');
    await expect(verifyReleaseAssets(config, ['thalia', 'thalia'])).rejects.toThrow('unique');
  } finally {
    if (previousDate === undefined) delete Bun.env.THALIA_RELEASE_DATE;
    else Bun.env.THALIA_RELEASE_DATE = previousDate;
    await rm(root, { recursive: true, force: true });
  }
});
