import { expect, test } from 'bun:test';
import { parseBuildHtmlCommandOptions } from '../src/commands/build-options';

test('HTML build flags distinguish external mods, pure game, and compression', () => {
  const normal = parseBuildHtmlCommandOptions(['--skip-prepare']);
  expect(normal.html.embedIndexDBMods).toBeUndefined();
  expect(normal.html.modloader).toBeUndefined();
  expect(normal.html.minify).toBeUndefined();

  const noInputMods = parseBuildHtmlCommandOptions(['--skip-prepare', '--fast', '--no-input-mods']);
  expect(noInputMods.html.embedIndexDBMods).toBe(false);
  expect(noInputMods.html.modloader).toBeUndefined();
  expect(noInputMods.html.minify).toBe(false);

  const pure = parseBuildHtmlCommandOptions(['--skip-prepare', '--pure']);
  expect(pure.html.embedIndexDBMods).toBe(false);
  expect(pure.html.modloader).toBe(false);
});
