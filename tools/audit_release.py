#!/usr/bin/env python3
"""Release artifact auditor for DoL-Thalia.

Verifies the invariants that a successful build does not by itself prove:
that the finished HTML really carries the bundled mods as valid ZIP payloads,
that a built ZIP package contains an HTML entry point, and that an APK has
a signing block and aligned uncompressed entries. Every check is read-only.

Exit status is 0 when all checks pass, 1 when any check fails.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import io
import json
import mmap
import re
import struct
import sys
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

# Bundled mods are embedded as base64 in a runtime global; the exact assignment
# is written by src/builders/html.ts.
BUNDLED_MOD_PATTERN = re.compile(r"window\.modDataValueZipList\s*=\s*(\[.*?\])\s*;", re.DOTALL)
INDEXED_DB_MOD_PATTERN = re.compile(r"window\.modDataValueZipListIndexDB\s*=\s*(\[.*?\])\s*;", re.DOTALL)

APK_SIGNATURE_BLOCK_MAGIC = b"APK Sig Block 42"
ZIP_LOCAL_HEADER = b"PK\x03\x04"
MODPACK_MAGIC = b"JeremieModLoader"


@dataclass
class Report:
    """Collects check results so the CLI can print a summary and pick an exit code."""

    failures: list[str] = field(default_factory=list)
    checks: int = 0

    def ok(self, message: str) -> None:
        self.checks += 1
        print(f"  ok   {message}")

    def fail(self, message: str) -> None:
        self.checks += 1
        self.failures.append(message)
        print(f"  FAIL {message}")

    def note(self, message: str) -> None:
        print(f"       {message}")


def load_json_assignment(html: str, pattern: re.Pattern[str], label: str) -> list:
    match = pattern.search(html)
    if not match:
        raise SystemExit(f"error: {label} assignment not found in HTML")
    try:
        value = json.loads(match.group(1))
    except json.JSONDecodeError as error:
        raise SystemExit(f"error: {label} is not valid JSON: {error}") from error
    if not isinstance(value, list):
        raise SystemExit(f"error: {label} is not a list")
    return value


def decode_base64(payload: str, label: str) -> bytes:
    if not isinstance(payload, str):
        raise ValueError(f"{label} is not a base64 string")
    try:
        return base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError(f"{label} is not valid base64: {error}") from error


def audit_html(path: Path, report: Report) -> None:
    print(f"HTML {path}")
    html = path.read_text(encoding="utf-8", errors="replace")
    report.note(f"{len(html):,} characters")

    bundled = load_json_assignment(html, BUNDLED_MOD_PATTERN, "window.modDataValueZipList")
    indexed_db = load_json_assignment(html, INDEXED_DB_MOD_PATTERN, "window.modDataValueZipListIndexDB")

    if not bundled:
        report.fail("no bundled mods are embedded in the HTML")
    else:
        report.ok(f"{len(bundled)} bundled mod payloads embedded")

    valid_bundled = 0
    for index, payload in enumerate(bundled):
        label = f"bundled mod #{index + 1}"
        try:
            data = decode_base64(payload, label)
        except ValueError as error:
            report.fail(str(error))
            continue
        if check_zip_payload(data, label, report):
            valid_bundled += 1

    if valid_bundled == len(bundled) and bundled:
        report.ok(f"all {len(bundled)} bundled mod ZIP payloads decode and pass CRC")

    if not indexed_db:
        report.note("no IndexedDB mod entries (expected for a preset without extra mods)")
    else:
        valid_indexed_db = sum(
            audit_indexed_db_mod(entry, index, report)
            for index, entry in enumerate(indexed_db, start=1)
        )
        if valid_indexed_db == len(indexed_db):
            report.ok(f"all {len(indexed_db)} IndexedDB mod payloads pass hash and archive checks")


def check_zip_payload(data: bytes, label: str, report: Report) -> bool:
    if not data.startswith(ZIP_LOCAL_HEADER):
        report.fail(f"{label} does not decode to a ZIP archive")
        return False
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if not archive.namelist():
                report.fail(f"{label} ZIP archive is empty")
                return False
            corrupt = archive.testzip()
            if corrupt is not None:
                report.fail(f"{label} ZIP member failed CRC check: {corrupt}")
                return False
    except zipfile.BadZipFile:
        report.fail(f"{label} is not a readable ZIP archive")
        return False
    return True


def audit_indexed_db_mod(entry: object, index: int, report: Report) -> bool:
    label = f"IndexedDB mod #{index}"
    if not isinstance(entry, dict):
        report.fail(f"{label} is not an object")
        return False
    name, parts, expected_hash = (entry.get(key) for key in ("name", "dataParts", "hash"))
    if not isinstance(name, str) or not name or not isinstance(parts, list) or not parts:
        report.fail(f"{label} has invalid name or dataParts")
        return False
    if not isinstance(expected_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_hash):
        report.fail(f"{label} has an invalid SHA-256 hash")
        return False
    if not all(isinstance(part, str) for part in parts):
        report.fail(f"{label} contains a non-string data part")
        return False
    try:
        data = decode_base64("".join(parts), label)
    except ValueError as error:
        report.fail(str(error))
        return False
    if hashlib.sha256(data).hexdigest() != expected_hash:
        report.fail(f"{label} SHA-256 mismatch: {name}")
        return False
    if data.startswith(ZIP_LOCAL_HEADER):
        return check_zip_payload(data, label, report)
    # .modpack 是加密容器；这里只验证头部，无法检查其内部 ZIP。
    if data.startswith(MODPACK_MAGIC) and len(data) >= 80:
        return True
    report.fail(f"{label} is neither a ZIP archive nor a ModPack: {name}")
    return False


def audit_zip(path: Path, report: Report) -> None:
    print(f"ZIP  {path}")
    report.note(f"{path.stat().st_size:,} bytes")
    try:
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            if not names:
                report.fail("package ZIP is empty")
                return
            corrupt = archive.testzip()
            if corrupt is not None:
                report.fail(f"package ZIP member failed CRC check: {corrupt}")
                return
            report.ok(f"{len(names)} members, all CRC checks pass")

            html_members = [name for name in names if name.lower().endswith(".html")]
            if not html_members:
                report.fail("package ZIP has no HTML entry point")
            else:
                report.ok(f"HTML entry point present: {html_members[0]}")
    except zipfile.BadZipFile:
        report.fail("package ZIP is not readable")


def read_apk_signing_block(data: bytes | mmap.mmap) -> tuple[bool, int | None]:
    """Return (has_signing_block, central_directory_offset).

    Layout immediately before the central directory:
        [uint64 block size][id-value pairs][uint64 block size]["APK Sig Block 42"]
    so the magic starts 16 bytes before the central directory offset, and the
    leading size (block start) mirrors the size written directly before the magic.
    """
    if len(data) < 22:
        return False, None
    # The end of central directory record is followed by an optional comment, so
    # scan backwards for its signature rather than assuming a fixed position.
    eocd_index = -1
    search_end = len(data)
    while True:
        found = data.rfind(b"PK\x05\x06", 0, search_end)
        if found == -1:
            break
        if found + 22 <= len(data):
            comment_length = struct.unpack_from("<H", data, found + 20)[0]
            if found + 22 + comment_length == len(data):
                eocd_index = found
                break
        search_end = found
    if eocd_index == -1:
        return False, None
    central_offset = struct.unpack_from("<I", data, eocd_index + 16)[0]
    if central_offset < 24:
        return False, None
    magic_index = central_offset - 16
    if data[magic_index:magic_index + 16] != APK_SIGNATURE_BLOCK_MAGIC:
        return False, central_offset
    # The size field written just before the magic also terminates the block.
    block_size = struct.unpack_from("<Q", data, magic_index - 8)[0]
    block_start = central_offset - block_size - 8
    if block_start < 0 or block_start + 8 > len(data):
        return False, central_offset
    if struct.unpack_from("<Q", data, block_start)[0] != block_size:
        return False, central_offset
    return True, central_offset


def audit_apk(path: Path, report: Report) -> None:
    print(f"APK  {path}")
    report.note(f"{path.stat().st_size:,} bytes")

    if not zipfile.is_zipfile(path):
        report.fail("APK is not a readable ZIP archive")
        return
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
    report.ok(f"{len(names)} entries, readable as ZIP")

    if "AndroidManifest.xml" not in names:
        report.fail("APK is missing AndroidManifest.xml")
    else:
        report.ok("AndroidManifest.xml present")

    if "classes.dex" not in names:
        report.fail("APK is missing classes.dex")
    else:
        report.ok("classes.dex present")

    # 映射文件以便随机读取 ZIP 头，避免把整个 APK 复制进 Python 堆内存。
    with path.open("rb") as apk_file, mmap.mmap(apk_file.fileno(), 0, access=mmap.ACCESS_READ) as data:
        signed, _ = read_apk_signing_block(data)
        if signed:
            report.ok("APK signing block present (v2+ signature)")
        else:
            report.fail("APK signing block missing: the package is not v2/v3 signed")

        # zipalign 只要求未压缩条目对齐。
        misaligned: list[str] = []
        stored = 0
        with zipfile.ZipFile(path) as archive:
            for info in archive.infolist():
                if info.compress_type != zipfile.ZIP_STORED:
                    continue
                stored += 1
                header_offset = info.header_offset
                # 本地头 30 字节，后接文件名和 extra 字段。
                name_len, extra_len = struct.unpack_from("<HH", data, header_offset + 26)
                data_offset = header_offset + 30 + name_len + extra_len
                if data_offset % 4 != 0:
                    misaligned.append(info.filename)
    if misaligned:
        preview = ", ".join(misaligned[:3])
        report.fail(f"{len(misaligned)} uncompressed entries are not 4-byte aligned: {preview}")
    else:
        report.ok(f"all {stored} uncompressed entries are 4-byte aligned")


def resolve_targets(args: argparse.Namespace) -> list[tuple[str, Path]]:
    targets: list[tuple[str, Path]] = []
    if args.html:
        targets.append(("html", Path(args.html)))
    if args.zip:
        targets.append(("zip", Path(args.zip)))
    if args.apk:
        targets.append(("apk", Path(args.apk)))
    if args.dist:
        dist = Path(args.dist)
        html = dist / "html" / "index.html"
        if html.exists():
            targets.append(("html", html))
        for archive in sorted((dist / "zip").glob("*.zip")):
            targets.append(("zip", archive))
        for archive in sorted((dist / "apk").glob("*.apk")):
            targets.append(("apk", archive))
    return targets


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit DoL-Thalia build artifacts.")
    parser.add_argument("--html", help="built game HTML to verify")
    parser.add_argument("--zip", help="release ZIP package to verify")
    parser.add_argument("--apk", help="release APK package to verify")
    parser.add_argument("--dist", help="verify every artifact under this dist directory")
    args = parser.parse_args()

    targets = resolve_targets(args)
    if not targets:
        parser.error("nothing to audit: pass --html, --zip, --apk, or --dist")

    report = Report()
    for kind, path in targets:
        if not path.exists():
            report.fail(f"missing artifact: {path}")
            continue
        if kind == "html":
            audit_html(path, report)
        elif kind == "zip":
            audit_zip(path, report)
        else:
            audit_apk(path, report)

    print()
    if report.failures:
        print(f"{len(report.failures)} of {report.checks} checks failed")
        return 1
    print(f"all {report.checks} checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
