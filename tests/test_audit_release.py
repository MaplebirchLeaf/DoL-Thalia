import base64
import contextlib
import io
import tempfile
import unittest
import zipfile
from pathlib import Path

from tools.audit_release import Report, audit_html


class AuditHtmlTest(unittest.TestCase):
    def test_invalid_payload_does_not_report_all_zips_valid(self):
        report = self.audit('invalid')
        self.assertEqual(len(report.failures), 1)
        self.assertEqual(report.checks, 2)

    def test_valid_payload_reports_all_zips_valid(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w') as output:
            output.writestr('mod.txt', 'ok')
        report = self.audit(base64.b64encode(archive.getvalue()).decode())
        self.assertEqual(report.failures, [])
        self.assertEqual(report.checks, 2)

    def audit(self, payload):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'index.html'
            path.write_text(
                f'window.modDataValueZipList = ["{payload}"]; '
                'window.modDataValueZipListIndexDB = [];',
                encoding='utf-8',
            )
            report = Report()
            with contextlib.redirect_stdout(io.StringIO()):
                audit_html(path, report)
            return report


if __name__ == '__main__':
    unittest.main()
