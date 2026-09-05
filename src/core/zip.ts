import { readFile } from 'node:fs/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { unzipSync } from 'fflate';

export async function extractZipSafe(zipPath: string, outputDir: string, label = 'zip archive'): Promise<void> {
  const files = unzipSync(await readFile(zipPath));
  const outputRoot = resolve(outputDir);
  for (const [name, data] of Object.entries(files)) {
    const output = resolve(outputDir, name);
    if (!output.startsWith(`${outputRoot}${sep}`) && output !== outputRoot) throw new Error(`Unsafe path in ${label}: ${name}`);
    if (name.endsWith('/')) {
      await mkdir(output, { recursive: true });
    } else {
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, data);
    }
  }
}
