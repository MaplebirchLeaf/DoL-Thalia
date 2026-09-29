import { expect, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { splitHtmlAssets } from '../src/builders/split-html-assets';

test('splits ordinary scripts and adjacent game CSS while retaining Twine data and execution order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'thalia-split-html-'));
  const path = join(root, 'index.html');
  try {
    await writeFile(
      path,
      '<head><script>window.modDataValueZipList = ["zip"];</script>' +
        '<script>/*! BeforeSC2.js.LICENSE.txt */ window.beforeSc2 = true;</script>' +
        '<script id="script-libraries" type="text/javascript">window.library = true;</script>' +
        '<style id="style-module-base" type="text/css">.base { color: red }</style>\n' +
        '<style id="style-module-theme" type="text/css">.theme { color: blue }</style>' +
        '<style id="twine-user-stylesheet" type="text/twine-css">.twine { color: green }</style>' +
        '</head><body><script role="script" id="twine-user-script" type="text/twine-javascript">window.game = true;</script>' +
        '<script id="script-sugarcube" type="text/javascript">window.sugarcube = true;</script></body>'
    );

    await splitHtmlAssets(path);
    const html = await readFile(path, 'utf8');
    expect(html).toContain('window.modDataValueZipList = ["zip"]');
    expect(html).toContain('window.game = true');
    expect(html).toContain('.twine { color: green }');
    expect(html).not.toContain('window.beforeSc2 = true');
    expect(html).not.toContain('window.sugarcube = true');
    expect(html).not.toContain('.base { color: red }');
    const files = await readdir(root);
    expect(files.filter(file => file.endsWith('.js'))).toHaveLength(3);
    expect(files.filter(file => file.endsWith('.css'))).toHaveLength(1);
    const css = await readFile(join(root, files.find(file => file.endsWith('.css'))!), 'utf8');
    expect(css.indexOf('.base')).toBeLessThan(css.indexOf('.theme'));
    expect(html.indexOf('before-sc2-')).toBeLessThan(html.indexOf('script-libraries-'));
    expect(html.indexOf('script-libraries-')).toBeLessThan(html.indexOf('script-sugarcube-'));

    await splitHtmlAssets(path);
    expect(await readdir(root)).toEqual(files);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('refuses to merge game styles separated by other content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'thalia-split-html-'));
  const path = join(root, 'index.html');
  try {
    const html = '<style id="style-module-a" type="text/css">a{color:red}</style><script>window.marker=true</script><style id="style-module-b" type="text/css">b{color:blue}</style>';
    await writeFile(path, html);
    await expect(splitHtmlAssets(path)).rejects.toThrow('no longer contiguous');
    expect(await readFile(path, 'utf8')).toBe(html);
    expect(await readdir(root)).toEqual(['index.html']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
