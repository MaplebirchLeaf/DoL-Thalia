import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/core/process';

const classes = await mkdtemp(join(tmpdir(), 'thalia-native-classes-'));
const executable = (name: string) => (Bun.env.JAVA_HOME ? join(Bun.env.JAVA_HOME, 'bin', `${name}${process.platform === 'win32' ? '.exe' : ''}`) : name);
try {
  await run([executable('javac'), '-d', classes, 'cordova-plugins/thalia-native-download/src/android/DownloadArchive.java', 'tests/java/DownloadArchiveTest.java']);
  await run([executable('java'), '-Xmx16m', '-cp', classes, 'app.thalia.native_download.DownloadArchiveTest']);
} finally {
  await rm(classes, { recursive: true, force: true });
}
