import importlib.util
import json
from html import escape
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('localization', Path(__file__).parents[1] / 'tools/update_localization.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class LocalizationTests(unittest.TestCase):
    def test_upstream_description_fallback_is_accepted_only_for_known_combat_labels(self):
        row = dict(f='<<set _text_output to "the " + $description + " woman">>',
                   t='<<set _text_output to "" + $description + "女人">>',
                   fileName='text.twee', pN='Widgets Text')
        translated = '<<set _text_output to ($description_CN || $description) + "女人">>'
        self.assertTrue(module.safe(row, translated))
        self.assertFalse(module.safe({**row, 'pN': 'Other'}, translated))
        self.assertFalse(module.safe({**row, 'fileName': 'other.twee'}, translated))
        self.assertFalse(module.safe(row, translated.replace('$description_CN', '$other')))
        self.assertFalse(module.safe(row, translated + '<<set $other to 1>>'))

    def test_combat_descriptions_prefer_localized_field_without_changing_source(self):
        sources = [
            '<<set _text_output to "the " + $description>>',
            '<<set _text_output to "the " + $description + " " + $role>>',
            '<<set _text_output to "the " + $description + " man">>',
            '<<set _text_output to "the " + $description + " woman">>',
        ]
        rows = [dict(f=source, t=source, fileName='text.twee', pN='Widgets Text', pos=i)
                for i, source in enumerate(sources)]
        foreign = {**rows[0], 'pN': 'Foreign Widget'}
        translated = {**rows[0], 't': '<<set _text_output to $description_CN || $description>>'}
        document = {'typeB': {'TypeBInputStoryScript': rows + [foreign, translated]}}
        self.assertEqual(module.localize_combat_descriptions(document), 4)
        for index, row in enumerate(rows):
            self.assertEqual(row['f'], sources[index])
            self.assertEqual(row['pos'], index)
            self.assertIn('($description_CN || $description)', row['t'])
        self.assertEqual(foreign['t'], sources[0])
        self.assertEqual(translated['t'], '<<set _text_output to $description_CN || $description>>')
        self.assertEqual(module.localize_combat_descriptions(document), 0)

    def test_combat_translation_preserves_existing_localized_variable_adaptations(self):
        with tempfile.TemporaryDirectory() as directory:
            original = Path(directory) / 'original.html'
            patched = Path(directory) / 'patched.html'
            source = '<<set $_label to $worn.upper.name>>\nHello $NPCList[_n].name.\n<<oldReaction 0>>'
            original.write_text(f'<tw-passagedata name="Combat">{escape(source)}</tw-passagedata>')
            patched.write_text(f'<tw-passagedata name="Combat">{escape(source.replace("<<oldReaction 0>>", "<<newReaction _n>>"))}</tw-passagedata>')
            translations = [
                dict(f='<<set $_label to $worn.upper.name>>', t='<<set $_label to $worn.upper.cn_name_cap>>', pN='Combat', pos=0),
                dict(f='Hello $NPCList[_n].name.', t='你看着$NPCList[_n].name。', pN='Combat', pos=source.index('Hello'))]
            document = {'typeB': {'TypeBInputStoryScript': translations.copy()}}
            module.adapt_combat(document, original, patched)
            self.assertEqual(document['typeB']['TypeBInputStoryScript'], translations)

    def test_translation_variables_use_sugarcube_ascii_identifier_boundaries(self):
        row = dict(f='Hello $NPCList[_n].name.', t='旧译文')
        self.assertTrue(module.safe(row, '你看着$NPCList[_n].name。'))
        self.assertFalse(module.safe(row, '你好。'))
        self.assertEqual(module.VARIABLE.findall('left_arm $NPCList[_n].name'), ['$NPCList', '_n'])
        self.assertEqual(module.VARIABLE.findall('$_label _label $$value'), ['$_label', '_label', '$$value'])
        self.assertFalse(module.safe(dict(f='$_label'), '_label'))

    def test_combat_translation_rejects_rules_without_original_source_binding(self):
        with tempfile.TemporaryDirectory() as directory:
            original = Path(directory) / 'original.html'
            patched = Path(directory) / 'patched.html'
            original.write_text('<tw-passagedata name="Room">Original text</tw-passagedata>')
            patched.write_text('<tw-passagedata name="Room">Original text\nNew text</tw-passagedata>')
            document = {'typeB': {'TypeBInputStoryScript': [dict(f='New text', t='新文本', pN='Room', pos=0)]}}
            report = module.adapt_combat(document, original, patched)
            self.assertEqual(document['typeB']['TypeBInputStoryScript'], [])
            self.assertEqual(report['combat_removed'], 1)

    def test_combat_translation_follows_moved_text_and_preserves_fixed_code(self):
        with tempfile.TemporaryDirectory() as directory:
            original = Path(directory) / 'original.html'
            patched = Path(directory) / 'patched.html'
            def story(passages):
                return ''.join(f'<tw-passagedata name="{escape(name)}">{escape(source)}</tw-passagedata>'
                               for name, source in passages.items())
            original.write_text(story({'Old': 'Hello $name\n<<if $old>>Old conditional<</if>>', 'Kept': 'Unchanged'}))
            patched.write_text(story({'Old': '<<npcEjaculation 0>>', 'New': 'Hello $name\n<<if $new>>Old conditional<</if>>', 'Kept': 'Unchanged'}))
            kept = dict(f='Unchanged', t='原样', pN='Kept', pos=0)
            document = {'typeB': {'TypeBInputStoryScript': [
                dict(f='Hello $name', t='你好 $name', pN='Old', pos=0, fileName='old.twee'),
                dict(f='<<if $old>>Old conditional<</if>>', t='<<if $old>>旧条件<</if>>', pN='Old', pos=12),
                kept]}}
            report = module.adapt_combat(document, original, patched)
            rows = document['typeB']['TypeBInputStoryScript']
            moved = next(row for row in rows if row['pN'] == 'New')
            self.assertEqual(report['combat_removed'], 1)
            self.assertEqual(moved['pos'], 0)
            self.assertEqual(moved['t'], '你好 $name')
            self.assertIn(kept, rows)

    def test_combat_translation_rejects_conflicting_migrations_and_unchanged_input(self):
        with tempfile.TemporaryDirectory() as directory:
            original = Path(directory) / 'original.html'
            patched = Path(directory) / 'patched.html'
            original.write_text('<tw-passagedata name="Old">Hello</tw-passagedata>')
            patched.write_text('<tw-passagedata name="New">Hello</tw-passagedata>')
            document = {'typeB': {'TypeBInputStoryScript': [dict(f='Hello', t=t, pN='Old', pos=0) for t in ['甲', '乙']]}}
            with self.assertRaisesRegex(ValueError, 'Conflicting combat translation'):
                module.adapt_combat(document, original, patched)
            with self.assertRaisesRegex(ValueError, 'requires changed source'):
                module.adapt_combat(document, original, original)

    def test_combat_translation_does_not_emit_overlapping_native_matcher_ranges(self):
        with tempfile.TemporaryDirectory() as directory:
            original = Path(directory) / 'original.html'
            patched = Path(directory) / 'patched.html'
            original.write_text('<tw-passagedata name="Old">Whole &lt;span&gt;Hi&lt;/span&gt;\n</tw-passagedata>')
            patched.write_text('<tw-passagedata name="Old">Whole &lt;span&gt;Hi&lt;/span&gt;\nFixed</tw-passagedata>')
            document = {'typeB': {'TypeBInputStoryScript': [
                dict(f='Whole <span>Hi</span>', t='完整 <span>你好</span>', pN='Old', pos=0),
                dict(f='<span>Hi</span>', t='<span>你好</span>', pN='Old', pos=6)]}}
            report = module.adapt_combat(document, original, patched)
            rows = document['typeB']['TypeBInputStoryScript']
            self.assertEqual(len(rows), 1)
            self.assertEqual(report['combat_overlap_removed'], 1)
            self.assertEqual(rows[0]['f'], 'Whole <span>Hi</span>')

    def test_combat_translation_uses_javascript_utf16_positions(self):
        with tempfile.TemporaryDirectory() as directory:
            original = Path(directory) / 'original.html'
            patched = Path(directory) / 'patched.html'
            original.write_text('<tw-passagedata name="Old">😀\nHello</tw-passagedata>')
            patched.write_text('<tw-passagedata name="New">😀😀\nHello</tw-passagedata>')
            document = {'typeB': {'TypeBInputStoryScript': [dict(f='Hello', t='你好', pN='Old', pos=3)]}}
            module.adapt_combat(document, original, patched)
            self.assertEqual(document['typeB']['TypeBInputStoryScript'][0]['pos'], 5)

    def test_refresh_preserves_anchors_and_non_dictionary_entries(self):
        with tempfile.TemporaryDirectory() as directory:
            base, raw, output = [Path(directory) / name for name in ('base.zip', 'raw.zip', 'output.zip')]
            rows = [dict(f='Hello $name', t='旧 $name', pos=7, fileName='main.twee', pN='Room'),
                    dict(f='Duplicate', t='保留', pos=20, fileName='main.twee'),
                    dict(f='Variable $name', t='变量 $name', fileName='main.twee'),
                    dict(f='initialAction: "run",', t='initialAction: "run",initialActionCN: "逃窜",', fileName='fishing.js', js=True)]
            with zipfile.ZipFile(base, 'w') as archive:
                archive.writestr('i18n.json', json.dumps({'typeB': {'TypeBInputStoryScript': rows}}))
                archive.writestr('boot.json', b'original metadata')
            entries = [dict(original='Hello $name', translation='你好 $name', stage=3),
                       dict(original='Duplicate', translation='甲', stage=1),
                       dict(original='Duplicate', translation='乙', stage=3),
                       dict(original='Variable $name', translation='缺失变量', stage=3)]
            with zipfile.ZipFile(raw, 'w') as archive:
                archive.writestr('raw/location/main.csv.json', json.dumps(entries))
                archive.writestr('raw/失效词条/main.csv.json', json.dumps([dict(original='Hello $name', translation='失效 $name', stage=5)]))
                archive.writestr('raw/fishing.js.csv.json', json.dumps([dict(original=rows[3]['f'], translation=rows[3]['f'], stage=3)]))
            report = module.update(base, raw, output)
            self.assertEqual(report['updated'], 1)
            self.assertEqual(report['ambiguous'], 1)
            self.assertEqual(report['rejected'], 2)
            with zipfile.ZipFile(output) as archive:
                updated = json.loads(archive.read('i18n.json'))['typeB']['TypeBInputStoryScript']
                self.assertEqual(updated[0], {**rows[0], 't': '你好 $name'})
                self.assertEqual(updated[1:], rows[1:])
                self.assertEqual(archive.read('boot.json'), b'original metadata')


if __name__ == '__main__':
    unittest.main()
