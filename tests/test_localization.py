import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('localization', Path(__file__).parents[1] / 'tools/update_localization.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class LocalizationTests(unittest.TestCase):
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
