import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync('cordova-plugins/thalia-native-download/www/NativeDownload.js', 'utf8');
type Exec = (ok: (value?: unknown) => void, fail: (value: string) => void, service: string, action: string, args: unknown[]) => void;
function createDownload(exec: Exec) {
  const exports: { download?: (url: string, options?: { signal?: AbortSignal; onProgress?: (loaded: number, total: number) => void }) => Promise<ArrayBuffer> } = {};
  runInNewContext(source, { exports, require: () => exec, Uint8Array, ArrayBuffer, Error, Number, Date });
  return exports.download!;
}

test('native archive is transferred in bounded ordered chunks and released', async () => {
  const data = new Uint8Array(600_000).map((_, index) => index % 251);
  const reads: number[] = [];
  const progress: number[] = [];
  let releases = 0;
  const download = createDownload((ok, _fail, service, action, args) => {
    expect(service).toBe('ThaliaNativeDownload');
    if (action === 'download') {
      ok({ loaded: 100, total: data.length, done: false });
      ok({ loaded: data.length, total: data.length, done: true });
    } else if (action === 'read') {
      const offset = args[1] as number;
      reads.push(offset);
      ok(data.slice(offset, offset + 256 * 1024).buffer);
    } else if (action === 'release') {
      releases++;
      ok();
    }
  });
  expect(new Uint8Array(await download('https://github.com/test/repo/releases/download/v1/test.mod.zip', { onProgress: loaded => progress.push(loaded) }))).toEqual(data);
  expect(reads).toEqual([0, 262_144, 524_288]);
  expect(progress).toEqual([100, data.length]);
  expect(releases).toBe(1);
});

test('native errors release the temporary archive', async () => {
  for (const stage of ['download', 'read']) {
    const actions: string[] = [];
    const download = createDownload((ok, fail, _service, action) => {
      actions.push(action);
      if (action === stage) fail('network or storage failure');
      else if (action === 'download') ok({ done: true, total: 5, loaded: 5 });
      else ok();
    });
    await expect(download('test')).rejects.toThrow('network or storage failure');
    expect(actions.at(-1)).toBe('release');
  }
});

test('rejects oversized or malformed bridge payloads and releases', async () => {
  for (const size of [0, -1, 128 * 1024 * 1024 + 1, 1.1]) {
    const actions: string[] = [];
    const download = createDownload((ok, _fail, _service, action) => {
      actions.push(action);
      if (action === 'download') ok({ done: true, total: size });
      else ok();
    });
    await expect(download('test')).rejects.toThrow('Invalid mod archive size');
    expect(actions).toEqual(['download', 'release']);
  }
  for (const chunk of [new ArrayBuffer(0), 5, [1, 2, 3, 4, 5], '12345', new ArrayBuffer(6)]) {
    const download = createDownload((ok, _fail, _service, action) => {
      if (action === 'download') ok({ done: true, total: 5 });
      else if (action === 'read') ok(chunk);
      else ok();
    });
    await expect(download('test')).rejects.toThrow('Invalid mod archive chunk');
  }
});

test('cancellation interrupts both download and chunk transfer', async () => {
  for (const stage of ['download', 'read']) {
    const controller = new AbortController();
    const actions: string[] = [];
    const download = createDownload((ok, _fail, _service, action) => {
      actions.push(action);
      if (action === stage) queueMicrotask(() => controller.abort());
      else if (action === 'download') ok({ done: true, total: 5 });
      else ok();
    });
    await expect(download('test', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(actions.at(-1)).toBe('release');
  }
});
