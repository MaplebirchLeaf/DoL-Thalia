import { createHash } from 'node:crypto';
import payload from './payload.json';

export interface CombatTransition {
  kind: 'script' | 'passage';
  path: string;
  name: string;
  before: string;
  after: string;
}

interface CombatPatch {
  kind: CombatTransition['kind'];
  path: string;
  name: string;
  beforeHash: string | null;
  afterHash: string;
  after?: string;
  edits?: { before: string; after: string }[];
}

interface SourceRange {
  start: number;
  end: number;
  content: string;
}

const patches = payload as CombatPatch[];

function fingerprint(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function decode(content: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return content.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, name: string) => {
    if (!name.startsWith('#')) return entities[name.toLowerCase()] ?? entity;
    const number = name.toLowerCase().startsWith('#x') ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
    return number <= 0x10ffff ? String.fromCodePoint(number) : entity;
  });
}

function encode(content: string): string {
  return content.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function passages(html: string): { sources: Map<string, SourceRange>; maxPid: number } {
  const sources = new Map<string, SourceRange>();
  let maxPid = 0;
  for (const match of html.matchAll(/<tw-passagedata\b([^>]*)>([\s\S]*?)<\/tw-passagedata>/g)) {
    const name = /\bname="([^"]*)"/.exec(match[1])?.[1];
    const pid = /\bpid="(\d+)"/.exec(match[1])?.[1];
    if (pid) maxPid = Math.max(maxPid, Number(pid));
    if (name === undefined) continue;
    const key = decode(name);
    if (sources.has(key)) throw new Error(`Combat backport: duplicate passage ${key}`);
    const start = match.index + match[0].indexOf('>') + 1;
    sources.set(key, { start, end: start + match[2].length, content: decode(match[2]) });
  }
  return { sources, maxPid };
}

function scripts(html: string): Map<string, SourceRange> {
  const matches = [...html.matchAll(/<script\b[^>]*\bid="twine-user-script"[^>]*>([\s\S]*?)<\/script>/g)];
  if (matches.length !== 1) throw new Error('Combat backport: expected one twine-user-script');
  const match = matches[0];
  const start = match.index + match[0].indexOf('>') + 1;
  const markers = [...match[1].matchAll(/\/\* twine-user-script #\d+: "([^"\n]+)" \*\/\r?\n/g)];
  const sources = new Map<string, SourceRange>();
  for (const [index, marker] of markers.entries()) {
    const name = marker[1].replaceAll(/\\+/g, '/');
    const contentStart = marker.index + marker[0].length;
    const content = match[1].slice(contentStart, markers[index + 1]?.index ?? match[1].length).replace(/\n+$/, '');
    if (sources.has(name)) throw new Error(`Combat backport: duplicate script ${name}`);
    sources.set(name, { start: start + contentStart, end: start + contentStart + content.length, content });
  }
  return sources;
}

export function applyCombatBackport(html: string): { html: string; applied: boolean; transitions: CombatTransition[] } {
  const passageData = passages(html);
  const scriptData = scripts(html);
  const replacements: { start: number; end: number; content: string }[] = [];
  const transitions: CombatTransition[] = [];
  const additions: string[] = [];
  for (const patch of patches) {
    const source = (patch.kind === 'passage' ? passageData.sources : scriptData).get(patch.name);
    const before = source?.content ?? '';
    const hash = fingerprint(before);
    if (source && hash === patch.afterHash) continue;
    if (patch.beforeHash ? hash !== patch.beforeHash : source !== undefined) throw new Error(`Combat backport: source mismatch ${patch.name}`);
    let after = patch.after ?? before;
    for (const edit of patch.edits ?? []) {
      const index = after.indexOf(edit.before);
      if (index < 0 || after.indexOf(edit.before, index + 1) >= 0) throw new Error(`Combat backport: ambiguous anchor ${patch.name}`);
      after = after.slice(0, index) + edit.after + after.slice(index + edit.before.length);
    }
    if (fingerprint(after) !== patch.afterHash) throw new Error(`Combat backport: invalid payload ${patch.name}`);
    transitions.push({ kind: patch.kind, path: patch.path, name: patch.name, before, after });
    if (source) {
      replacements.push({ start: source.start, end: source.end, content: patch.kind === 'script' ? after : encode(after) });
    } else if (patch.kind === 'passage') {
      additions.push(`<tw-passagedata pid="${++passageData.maxPid}" name="${encode(patch.name)}" tags="widget" position="100,100" size="100,100">${encode(after)}</tw-passagedata>`);
    } else {
      throw new Error(`Combat backport: missing script ${patch.name}`);
    }
  }
  if (additions.length) {
    const index = html.indexOf('</tw-storydata>');
    if (index < 0 || html.indexOf('</tw-storydata>', index + 1) >= 0) throw new Error('Combat backport: expected one tw-storydata');
    replacements.push({ start: index, end: index, content: additions.join('') });
  }
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    html = html.slice(0, replacement.start) + replacement.content + html.slice(replacement.end);
  }
  return { html, applied: replacements.length > 0, transitions };
}
