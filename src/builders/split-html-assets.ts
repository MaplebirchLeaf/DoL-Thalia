import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const SCRIPT_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const GAME_STYLE_PATTERN = /<style\s+id="style-module-[^"]+"\s+type="text\/css"\s*>([\s\S]*?)<\/style\s*>/gi;

/**
 * 仅拆分构建完成后的普通资源。Twine 的用户脚本、用户样式和模组数据仍须留在 HTML 中，
 * 因为 ModLoader 在运行时读取这些节点的文本。
 */
export async function splitHtmlAssets(htmlPath: string): Promise<void> {
  const outputDir = dirname(htmlPath);
  const original = await readFile(htmlPath, 'utf8');
  const assets = new Map<string, string>();
  let html = original.replace(SCRIPT_PATTERN, (element, attributes: string, source: string) => {
    if (/\bsrc\s*=/.test(attributes)) return element;
    const id = attributes.match(/\bid="(script-libraries|script-sugarcube)"/)?.[1];
    const name = id ?? (source.includes('BeforeSC2.js.LICENSE.txt') ? 'before-sc2' : undefined);
    if (!name || !source.trim()) return element;
    const file = assetName(name, 'js', source);
    assets.set(file, source);
    return `<script${attributes} src="./${file}"></script>`;
  });

  const styles = [...html.matchAll(GAME_STYLE_PATTERN)];
  if (styles.length) {
    // 合并连续的游戏样式，既保留层叠顺序，也避免为每个样式节点发起请求。
    for (let index = 1; index < styles.length; index++) {
      const previous = styles[index - 1];
      const current = styles[index];
      const between = html.slice(previous.index! + previous[0].length, current.index);
      if (between.trim()) throw new Error('Game style modules are no longer contiguous; refusing to reorder CSS');
    }
    const css = styles.map(style => style[1]).join('\n');
    const file = assetName('game-styles', 'css', css);
    assets.set(file, css);
    let first = true;
    html = html.replace(GAME_STYLE_PATTERN, () => {
      if (!first) return '';
      first = false;
      return `<link rel="stylesheet" href="./${file}">`;
    });
  }

  if (html === original) return;
  for (const [file, content] of assets) await writeFile(join(outputDir, file), content, 'utf8');
  await writeFile(htmlPath, html, 'utf8');
}

function assetName(name: string, extension: 'css' | 'js', content: string): string {
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 12);
  return `thalia-${name}-${hash}.${extension}`;
}
