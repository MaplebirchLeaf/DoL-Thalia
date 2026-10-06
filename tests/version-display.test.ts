import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { versionDisplayScript } from '../src/builders/version-display';

test('version prefix survives repeated passage events and keeps the ModLoader suffix', () => {
  const suffix = { textContent: '-(ML-v2.102.0)' };
  let children = [{ textContent: '0.5.12.13' }, suffix];
  let patched = false;
  let refresh: () => void = () => {};
  const node = {
    querySelector: () => (patched ? children[0] : null),
    prepend: (marker: { textContent: string }) => {
      patched = true;
      children.unshift(marker);
    }
  };
  const document = {
    getElementById: () => node,
    createElement: () => ({ dataset: {}, textContent: '' }),
    addEventListener: (_event: string, ready: () => void) => ready()
  };
  const script = versionDisplayScript().replace(/^<script[^>]*>|<\/script>$/g, '');
  runInNewContext(script, {
    document,
    jQuery: () => ({ on: (_event: string, callback: () => void) => (refresh = callback) })
  });
  refresh();
  expect(children.map(child => child.textContent).join('')).toBe('DoL-Thalia-0.5.12.13-(ML-v2.102.0)');
  expect(children.at(-1)).toBe(suffix);
  children = [{ textContent: '0.5.12.13' }, suffix];
  patched = false;
  refresh();
  expect(children.map(child => child.textContent).join('')).toBe('DoL-Thalia-0.5.12.13-(ML-v2.102.0)');
});
