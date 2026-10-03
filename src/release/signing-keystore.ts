import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface RestoredSigningKeystore {
  encodingLayers: 1 | 2;
  certificateSha256: string;
}

function decodeBase64(encoded: string): Buffer {
  const compact = encoded.replace(/[ \t\r\n]/g, '');
  if (!compact || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact)) throw new Error('APK signing secret is not valid Base64.');
  const bytes = Buffer.from(compact, 'base64');
  if (!bytes.length || bytes.toString('base64') !== compact) throw new Error('APK signing secret is not canonical Base64.');
  return bytes;
}

async function signingCertificate(path: string): Promise<string | undefined> {
  const keytool = Bun.env.JAVA_HOME ? join(Bun.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool') : 'keytool';
  const child = Bun.spawn([keytool, '-J-Duser.language=en', '-J-Duser.country=US', '-list', '-v', '-keystore', path, '-storepass', 'android', '-alias', 'dol-thalia'], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...Bun.env, THALIA_KEYSTORE_BASE64: undefined }
  });
  const [output] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if ((await child.exited) !== 0 || !/Entry type: PrivateKeyEntry/.test(output)) return undefined;
  const fingerprint = output
    .match(/^\s*SHA256:\s*([0-9A-F:]+)\s*$/m)?.[1]
    ?.replaceAll(':', '')
    .toLowerCase();
  if (!fingerprint || !/^[0-9a-f]{64}$/.test(fingerprint)) return undefined;
  // Listing verifies the store password; creating a CSR also verifies access to the private key.
  const request = Bun.spawn([keytool, '-certreq', '-keystore', path, '-storepass', 'android', '-keypass', 'android', '-alias', 'dol-thalia'], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
    env: { ...Bun.env, THALIA_KEYSTORE_BASE64: undefined }
  });
  return (await request.exited) === 0 ? fingerprint : undefined;
}

export async function restoreSigningKeystore(encoded: string, destination: string): Promise<RestoredSigningKeystore> {
  let bytes = decodeBase64(encoded);
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'thalia-signing-'));
  const candidate = join(temporaryRoot, 'candidate.keystore');
  let staged: string | undefined;
  try {
    for (const encodingLayers of [1, 2] as const) {
      await writeFile(candidate, bytes, { mode: 0o600 });
      const certificateSha256 = await signingCertificate(candidate);
      if (certificateSha256) {
        await mkdir(dirname(destination), { recursive: true });
        staged = join(dirname(destination), `.thalia-keystore-${randomUUID()}.tmp`);
        await writeFile(staged, bytes, { flag: 'wx', mode: 0o600 });
        await rename(staged, destination);
        return { encodingLayers, certificateSha256 };
      }
      if (encodingLayers === 1) {
        try {
          bytes = decodeBase64(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        } catch {
          break;
        }
      }
    }
    throw new Error('APK signing secret must contain a readable private key matching the configured signing credentials, wrapped in one or two Base64 layers.');
  } finally {
    if (staged) await rm(staged, { force: true });
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
