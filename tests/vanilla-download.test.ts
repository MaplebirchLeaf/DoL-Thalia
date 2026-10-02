import { expect, test } from 'bun:test';
import { selectOfficialVanillaDownload } from '../src/sources/vanilla-game';

test('official vanilla download matches the requested version and normal edition', () => {
  const page =
    '<p>Current version: <b>0.5.12.13</b></p><a href="https://pixeldrain.com/api/file/text">Text only version</a><a href="https://pixeldrain.com/api/file/normal"><strong>Download normal version</strong></a>';
  expect(selectOfficialVanillaDownload(page, '0.5.12.13')).toBe('https://pixeldrain.com/api/file/normal');
  expect(selectOfficialVanillaDownload(page, '0.5.11.9')).toBeUndefined();
  expect(selectOfficialVanillaDownload(page.replace('Download normal version', 'Android version'), '0.5.12.13')).toBeUndefined();
});
