import { beforeAll, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { applyCombatBackport } from '../patches/dol-0.5.12.13-combat';

let original: string;
let result: ReturnType<typeof applyCombatBackport>;

beforeAll(async () => {
  original = gunzipSync(await readFile(new URL('../patches/dol-0.5.12.13-combat/fixtures/vanilla.html.gz', import.meta.url))).toString();
  result = applyCombatBackport(original);
});

function transition(name: string) {
  const target = result.transitions.find(target => target.name === name);
  if (!target) throw new Error(`Missing fixture transition: ${name}`);
  return target;
}

function combatRuntime() {
  const handlers = new Map<string, { handler: (this: { args: string[] }) => void }>();
  const registered = new Set<string>();
  const warnings: unknown[] = [];
  const State = { temporary: {} as { args?: string[] } };
  const V = {
    NPCList: [
      { fullDescription: 'Robin', type: 'human' },
      { fullDescription: 'Avery', type: 'human' },
      { fullDescription: 'Ivory Wraith', type: 'human' }
    ],
    npcrow: [1, 0],
    npc: ['Avery', 'Robin'],
    position: '',
    walltype: '',
    punishmentposition: '',
    gloryhole: false
  };
  const T = { silent: false, noNameComment: false };
  const context = {
    State,
    V,
    T,
    setup: { NPCNameList: ['Robin', 'Avery', 'Ivory Wraith'] },
    window: {},
    Macro: {
      has: (name: string) => registered.has(name),
      add: (name: string, definition: { handler: (this: { args: string[] }) => void }) => {
        if (handlers.has(name)) throw new Error(`Duplicate macro ${name}`);
        handlers.set(name, definition);
        registered.add(name);
      }
    },
    console: { warn: (...args: unknown[]) => warnings.push(args) }
  };
  const base = transition('game/03-JavaScript/base.js').after;
  const helpers = base.slice(base.indexOf('function DefineMacro('), base.indexOf('/**\n * Pluralises'));
  runInNewContext(`${helpers}\n${transition('game/base-combat/combat.js').after}`, context);
  return { context, handlers, registered, warnings, State, V, T };
}

test('backport validates released targets, adds two widgets and is byte-idempotent', () => {
  expect(result.applied).toBe(true);
  expect(result.transitions).toHaveLength(7);
  expect(result.transitions.filter(target => target.before === '').map(target => target.name)).toEqual(['Widgets Ejaculation-AVERY', 'Widgets Ejaculation-WHITNEY']);
  const second = applyCombatBackport(result.html);
  expect(second).toEqual({ html: result.html, applied: false, transitions: [] });
  expect(result.html).toContain('tags="widget"');
  const pids = [...result.html.matchAll(/\bpid="(\d+)"/g)].map(match => match[1]);
  expect(new Set(pids).size).toBe(pids.length);
});

test('unrelated HTML, passages and script source are untouched', () => {
  for (const unchanged of [
    '<head><title>Unchanged fixture</title></head>',
    '<tw-passagedata pid="1" name="Unchanged Passage" tags="">&lt;span&gt;Original &amp; unchanged&lt;/span&gt;</tw-passagedata>',
    '/* twine-user-script #999: "game\\\\fixture.js" */\nwindow.unrelatedCombatFixture = true;'
  ]) {
    expect(original).toContain(unchanged);
    expect(result.html).toContain(unchanged);
  }
});

test('changed, missing or duplicate targets fail without modifying the input', () => {
  const changed = original.replace('function namedNpcEjaculation(index, ...args)', 'function namedNpcEjaculation(index, ...parameters)');
  expect(() => applyCombatBackport(changed)).toThrow('source mismatch game/base-combat/combat.js');
  expect(changed).not.toContain('function getCombatNpcName(');
  expect(() => applyCombatBackport(original.replace('name="Widgets Ejaculation"', 'name="Missing Ejaculation"'))).toThrow('source mismatch Widgets Ejaculation');
  expect(() => applyCombatBackport(original.replace('</tw-storydata>', '<tw-passagedata pid="99999" name="Widgets Ejaculation" tags="">duplicate</tw-passagedata></tw-storydata>'))).toThrow(
    'duplicate passage'
  );
  expect(() => applyCombatBackport(result.html.replace('function getCombatNpcName(npc)', 'function getCombatNpcName(modified)'))).toThrow('source mismatch');
});

test('generic combat rules remain released0.5.12.13 rules instead of importing MR parent expansions', () => {
  const source = transition('Widgets Ejaculation');
  const before = source.before.slice(source.before.indexOf('\t\t\t\t<!-- Female Gender NPC Start -->'), source.before.indexOf('\t\t\t\t<<if _postOrgasmSpeech and'));
  const after = source.after.slice(
    source.after.indexOf('\t<!-- Female Gender NPC Start -->'),
    source.after.indexOf('\t<<ejaculation-post-speech>>', source.after.indexOf('<<widget "ejaculation-generic">>'))
  );
  expect(after).toBe(before.replace(/^\t{3}/gm, ''));
  expect(source.after).toContain('($NPCList[_nn].penis is "none" or !$NPCList[_nn].penisdesc.includes("strap-on"))');
  expect(source.after).toContain('<<if _args[0] isnot "short" and $NPCList[0]>>');
  expect(source.after).toContain('<<unset _postOrgasmSpeech _ejacStatDisplay>>');
  expect(source.after).toContain('<<if _postOrgasmSpeech and $speechDisable isnot 1>>');
});

test('all extracted widget and control blocks remain balanced', () => {
  for (const target of result.transitions.filter(target => target.kind === 'passage')) {
    const source = target.after.replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, '');
    const stack: string[] = [];
    for (const match of source.matchAll(/<<(\/?(?:widget|if|switch|for))\b/g)) {
      const name = match[1];
      if (name.startsWith('/')) expect(stack.pop()).toBe(name.slice(1));
      else stack.push(name);
    }
    expect(stack).toEqual([]);
  }
});

test('combat dispatch selects the actual row, prioritizes scenes and safely quotes arguments', () => {
  const runtime = combatRuntime();
  for (const name of [
    'ejaculation-generic',
    'ejaculation-named-common',
    'ejaculation-avery',
    'ejaculation-wall',
    'ejaculation-pillory',
    'ejaculation-gloryhole',
    'ejaculation-plant',
    'ejaculation-wraith'
  ])
    runtime.registered.add(name);
  const invoke = (expression: string) => runInNewContext(expression, runtime.context);
  expect(invoke('npcEjaculation(1)')).toBe('<<ejaculation-avery>>');
  expect(invoke('npcEjaculation(0)')).toBe('<<ejaculation-named-common>>');
  expect(invoke('npcEjaculation(2)')).toBe('<<ejaculation-wraith>>');
  expect(invoke('npcEjaculation(99)')).toBe('');
  expect(invoke('npcEjaculation(1, "short with \\"quotes\\"")')).toBe('<<ejaculation-avery "short with \\"quotes\\"">>');
  runtime.V.position = 'wall';
  expect(invoke('npcEjaculation(1)')).toBe('<<ejaculation-wall>>');
  runtime.V.walltype = 'pillory';
  expect(invoke('npcEjaculation(1)')).toBe('<<ejaculation-pillory>>');
  runtime.V.position = '';
  runtime.V.gloryhole = true;
  expect(invoke('npcEjaculation(1)')).toBe('<<ejaculation-gloryhole>>');
  runtime.V.gloryhole = false;
  runtime.V.NPCList[1].type = 'plant';
  expect(invoke('npcEjaculation(1)')).toBe('<<ejaculation-plant>>');
  runtime.V.NPCList[1] = { fullDescription: 'Custom encounter', type: 'human' };
  runtime.V.npcrow = [];
  expect(invoke('npcEjaculation(1)')).toBe('<<ejaculation-generic>>');
});

test('comments and reactions resolve one implementation against the requested NPC', () => {
  const runtime = combatRuntime();
  runtime.registered.add('speech-avery');
  runtime.registered.add('reaction-avery-choke');
  const invoke = (expression: string) => runInNewContext(expression, runtime.context);
  expect(invoke('namedNpcComments(1)')).toBe('<<speech-avery>>');
  expect(invoke('namedNpcReaction(1, "choke")')).toBe('<<reaction-avery-choke>>');
  expect(invoke('namedNpcReaction(0, "choke")')).toBe('');
  expect(invoke('namedNpcComments(0)')).toBe('');
  expect(runtime.T.noNameComment).toBe(true);
  runtime.T.silent = true;
  expect(invoke('namedNpcComments(1)')).toBe('');
  expect(runtime.T.noNameComment).toBeUndefined();
  expect(runtime.handlers.has('namedNpcComments')).toBe(true);
  expect(runtime.handlers.has('namedNpcReaction')).toBe(true);
});

test('DefineMacro restores existing or absent temporary arguments after a throw', () => {
  for (const previous of [undefined, ['outer args']]) {
    const runtime = combatRuntime();
    if (previous) runtime.State.temporary.args = previous;
    runInNewContext('DefineMacro("throws", function () { throw new Error("fixture failure"); })', runtime.context);
    runtime.handlers.get('throws')!.handler.call({ args: ['inner args'] });
    expect(runtime.State.temporary.args).toBe(previous);
    expect(Object.hasOwn(runtime.State.temporary, 'args')).toBe(previous !== undefined);
    expect(runtime.warnings).toHaveLength(1);
  }
});
