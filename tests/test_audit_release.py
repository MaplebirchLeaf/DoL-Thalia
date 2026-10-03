import base64
import contextlib
import hashlib
import io
import json
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
        report = self.audit(base64.b64encode(self.archive()).decode())
        self.assertEqual(report.failures, [])
        self.assertEqual(report.checks, 2)

    def test_indexed_db_zip_checks_hash_and_crc(self):
        archive = self.archive()
        entry = self.indexed_entry(archive)
        report = self.audit(base64.b64encode(archive).decode(), [entry])
        self.assertEqual(report.failures, [])
        self.assertEqual(report.checks, 3)

        entry['hash'] = '0' * 64
        report = self.audit(base64.b64encode(archive).decode(), [entry])
        self.assertIn('SHA-256 mismatch', report.failures[0])

        corrupt_archive = archive.replace(b'ok', b'no')
        report = self.audit(
            base64.b64encode(archive).decode(),
            [self.indexed_entry(corrupt_archive)],
        )
        self.assertIn('CRC check', report.failures[0])

    def test_indexed_db_modpack_header_is_accepted(self):
        archive = self.archive()
        modpack = b'JeremieModLoader' + bytes(64)
        report = self.audit(base64.b64encode(archive).decode(), [self.indexed_entry(modpack)])
        self.assertEqual(report.failures, [])

    def test_indexed_db_rejects_invalid_parts_and_container(self):
        archive = self.archive()
        entry = self.indexed_entry(b'not an archive')
        report = self.audit(base64.b64encode(archive).decode(), [entry])
        self.assertIn('neither a ZIP archive nor a ModPack', report.failures[0])

        entry['dataParts'] = [None]
        report = self.audit(base64.b64encode(archive).decode(), [entry])
        self.assertIn('non-string data part', report.failures[0])

    def test_online_play_accepts_only_twenty_bundled_mods_without_external_entries(self):
        payload = base64.b64encode(self.archive()).decode()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'index.html'
            for count, extra, should_pass in [
                (20, None, True),
                (20, [], True),
                (19, None, False),
                (21, None, False),
                (20, [self.indexed_entry(self.archive())], False),
            ]:
                html = f'window.modDataValueZipList = {json.dumps([payload] * count)};'
                if extra is not None:
                    html += f'window.modDataValueZipListIndexDB = {json.dumps(extra)};'
                path.write_text(html, encoding='utf-8')
                report = Report()
                with contextlib.redirect_stdout(io.StringIO()):
                    audit_html(path, report, online_play=True)
                self.assertEqual(not report.failures, should_pass)
                if not should_pass:
                    self.assertIn('exactly 20 bundled mods', report.failures[0])

    @staticmethod
    def archive():
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w') as output:
            output.writestr('mod.txt', 'ok')
        return archive.getvalue()

    @staticmethod
    def indexed_entry(data):
        return {
            'name': 'example',
            'dataParts': [base64.b64encode(data).decode()],
            'hash': hashlib.sha256(data).hexdigest(),
        }

    def audit(self, payload, indexed_db=None):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'index.html'
            path.write_text(
                f'window.modDataValueZipList = ["{payload}"]; '
                f'window.modDataValueZipListIndexDB = {json.dumps(indexed_db or [])};',
                encoding='utf-8',
            )
            report = Report()
            with contextlib.redirect_stdout(io.StringIO()):
                audit_html(path, report)
            return report


if __name__ == '__main__':
    unittest.main()
