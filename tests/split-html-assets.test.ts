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
        '<style id="style-module-base" type="text/css">.base { color: red }</style>\n\n\n' +
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
    expect(html).toContain('<link rel="stylesheet" href="./thalia-game-styles.css"><style id="twine-user-stylesheet"');
    const files = await readdir(root);
    expect(files.filter(file => file.endsWith('.js'))).toHaveLength(3);
    expect(files.filter(file => file.endsWith('.css'))).toHaveLength(1);
    const css = await readFile(join(root, files.find(file => file.endsWith('.css'))!), 'utf8');
    expect(css.indexOf('.base')).toBeLessThan(css.indexOf('.theme'));
    expect(html.indexOf('thalia-before-sc2.js')).toBeLessThan(html.indexOf('thalia-script-libraries.js'));
    expect(html.indexOf('thalia-script-libraries.js')).toBeLessThan(html.indexOf('thalia-script-sugarcube.js'));

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

test('migrates existing hashed asset references to stable names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'thalia-split-html-'));
  const path = join(root, 'index.html');
  const oldFile = 'thalia-script-libraries-123456abcdef.js';
  try {
    await writeFile(path, `<script id="script-libraries" src="./${oldFile}"></script>`);
    await writeFile(join(root, oldFile), 'window.library = true;');
    await splitHtmlAssets(path);
    expect(await readFile(path, 'utf8')).toContain('src="./thalia-script-libraries.js"');
    expect(await readFile(join(root, 'thalia-script-libraries.js'), 'utf8')).toBe('window.library = true;');
    expect((await readdir(root)).sort()).toEqual(['index.html', 'thalia-script-libraries.js']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
