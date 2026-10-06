import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { restoreSigningKeystore } from '../src/release/signing-keystore';

const keytool = Bun.env.JAVA_HOME ? join(Bun.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool') : 'keytool';
let root: string;
let fixture: string;
let bytes: Buffer;
let certificateSha256: string;

async function runKeytool(args: string[]) {
  const child = Bun.spawn([keytool, ...args], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).arrayBuffer(), new Response(child.stderr).text()]);
  if ((await child.exited) !== 0) throw new Error(`Test keytool failed: ${stderr}`);
  return Buffer.from(stdout);
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'thalia-signing-test-'));
  fixture = join(root, 'fixture.p12');
  await copyFile(new URL('./fixtures/signing-test.p12', import.meta.url), fixture);
  bytes = await readFile(fixture);
  const certificate = await runKeytool(['-exportcert', '-keystore', fixture, '-storepass', 'android', '-alias', 'dol-thalia']);
  certificateSha256 = createHash('sha256').update(certificate).digest('hex');
}, 10000);

afterAll(async () => await rm(root, { recursive: true, force: true }));

test('restores a real PKCS12 signing key from one or two Base64 layers with owner-only permissions', async () => {
  let encoded = bytes.toString('base64');
  for (const layers of [1, 2] as const) {
    const target = join(root, `restored-${layers}`, 'DoL-Thalia.keystore');
    const wrapped = encoded.match(/.{1,76}/g)!.join('\r\n') + '\n';
    const result = await restoreSigningKeystore(wrapped, target);
    expect(result).toEqual({ encodingLayers: layers, certificateSha256 });
    expect(await readFile(target)).toEqual(bytes);
    if (process.platform !== 'win32') expect((await stat(target)).mode & 0o777).toBe(0o600);
    encoded = Buffer.from(encoded).toString('base64');
  }
});

test('rejects empty, malformed, noncanonical and invalid keystore contents without creating the target', async () => {
  const cases = ['', ' \r\n\t', '__SECRET_NOT_BASE64__', 'YQ=', 'YR==', 'YQ==junk', Buffer.from('not a keystore').toString('base64')];
  for (const [index, encoded] of cases.entries()) {
    const target = join(root, `invalid-${index}`, 'DoL-Thalia.keystore');
    await expect(restoreSigningKeystore(encoded, target)).rejects.toThrow();
    expect(existsSync(target)).toBe(false);
    expect(existsSync(join(root, `invalid-${index}`))).toBe(false);
  }
  const triple = Buffer.from(Buffer.from(bytes.toString('base64')).toString('base64')).toString('base64');
  const target = join(root, 'triple', 'DoL-Thalia.keystore');
  await expect(restoreSigningKeystore(triple, target)).rejects.toThrow();
  expect(existsSync(target)).toBe(false);
});

test('an invalid secret leaves an existing destination unchanged and errors never include the secret', async () => {
  const target = join(root, 'existing.keystore');
  await writeFile(target, bytes);
  const secret = '__SECRET_NOT_BASE64__';
  let error: unknown;
  try {
    await restoreSigningKeystore(secret, target);
  } catch (cause) {
    error = cause;
  }
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).not.toContain(secret);
  expect(await readFile(target)).toEqual(bytes);
});

test('requires the signing alias and android store password before writing a destination', async () => {
  for (const kind of ['alias', 'password']) {
    const invalidFixture = join(root, `wrong-${kind}.p12`);
    await copyFile(fixture, invalidFixture);
    if (kind === 'alias') {
      await runKeytool(['-changealias', '-keystore', invalidFixture, '-storepass', 'android', '-alias', 'dol-thalia', '-destalias', 'another-key']);
    } else {
      await runKeytool(['-storepasswd', '-keystore', invalidFixture, '-storepass', 'android', '-new', 'wrong-password']);
    }
    const target = join(root, `rejected-${kind}`, 'DoL-Thalia.keystore');
    await expect(restoreSigningKeystore((await readFile(invalidFixture)).toString('base64'), target)).rejects.toThrow();
    expect(existsSync(target)).toBe(false);
  }
}, 10000);

test('a certificate-only keystore cannot replace the private signing key', async () => {
  const certificate = join(root, 'public-certificate.der');
  await writeFile(certificate, await runKeytool(['-exportcert', '-keystore', fixture, '-storepass', 'android', '-alias', 'dol-thalia']));
  const trusted = join(root, 'trusted.p12');
  await runKeytool(['-importcert', '-noprompt', '-storetype', 'PKCS12', '-keystore', trusted, '-storepass', 'android', '-alias', 'dol-thalia', '-file', certificate]);
  const target = join(root, 'certificate-only', 'DoL-Thalia.keystore');
  await expect(restoreSigningKeystore((await readFile(trusted)).toString('base64'), target)).rejects.toThrow();
  expect(existsSync(target)).toBe(false);
});

test('rejects a JKS whose store is readable but private-key password differs from android', async () => {
  const privatePasswordFixture = join(root, 'different-key-password.jks');
  await copyFile(new URL('./fixtures/signing-test-private-password.jks', import.meta.url), privatePasswordFixture);
  expect((await runKeytool(['-list', '-keystore', privatePasswordFixture, '-storepass', 'android', '-alias', 'dol-thalia'])).length).toBeGreaterThan(0);
  const target = join(root, 'different-key-password', 'DoL-Thalia.keystore');
  await expect(restoreSigningKeystore((await readFile(privatePasswordFixture)).toString('base64'), target)).rejects.toThrow();
  expect(existsSync(target)).toBe(false);
}, 10000);
