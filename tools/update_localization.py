"""Refresh existing ModI18N translations from a private ParaTranz raw export.

Source anchors remain those of the versioned upstream ModI18N archive.
See NumberSir/vrelnir_localization/src/project_dol.py for the TypeB format.
"""
import argparse
from collections import Counter, defaultdict
import json
import os
from pathlib import Path, PurePosixPath
import re
import zipfile

EXCLUDED = {"失效词条", "移除文件", "更新日志"}
VARIABLE = re.compile(r"(?<![\w])(?:\$|_)[A-Za-z][\w]*(?:\.[A-Za-z][\w]*)*")
CONTROL = re.compile(r"<<\s*(/?(?:if|elseif|else|set|run|goto|pass|for|switch|case|default|break|continue))\b")
STRINGS = re.compile(r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*' ''', re.VERBOSE)


def safe(row, translation):
    original = row["f"]
    if Counter(VARIABLE.findall(original)) != Counter(VARIABLE.findall(translation)):
        return False
    if CONTROL.findall(original) != CONTROL.findall(translation):
        return False
    if row.get("js"):
        # Only string content may change in JavaScript translation fragments.
        if STRINGS.sub('""', row['t']) != STRINGS.sub('""', translation):
            return False
    return True


def update(base, raw, output):
    candidates = defaultdict(set)
    counts = Counter()
    with zipfile.ZipFile(raw) as archive:
        for name in archive.namelist():
            path = PurePosixPath(name)
            if not name.startswith("raw/") or not name.endswith(".csv.json"):
                continue
            if EXCLUDED.intersection(path.parts):
                counts["excluded_files"] += 1
                continue
            filename = path.name.removesuffix(".csv.json")
            if not filename.endswith((".js", ".css", ".twee")):
                filename += ".twee"
            for entry in json.loads(archive.read(name)):
                translation = entry.get("translation", "").strip()
                if entry.get("stage") not in {1, 3, 5, 9} or not translation:
                    continue
                candidates[filename, entry["original"]].add(translation)
    with zipfile.ZipFile(base) as archive:
        document = json.loads(archive.read("i18n.json"))
        for rows in document["typeB"].values():
            for row in rows:
                matches = candidates.get((row.get("fileName"), row["f"]))
                if not matches:
                    counts["unmatched"] += 1
                    continue
                if len(matches) != 1:
                    counts["ambiguous"] += 1
                    continue
                translation = next(iter(matches))
                if translation == row["t"]:
                    counts["unchanged"] += 1
                elif safe(row, translation):
                    row["t"] = translation
                    counts["updated"] += 1
                else:
                    counts["rejected"] += 1
        output = Path(output)
        output.parent.mkdir(parents=True, exist_ok=True)
        temporary = output.with_suffix(output.suffix + f".{os.getpid()}.tmp")
        with zipfile.ZipFile(temporary, "w") as target:
            target.comment = archive.comment
            for info in archive.infolist():
                content = (json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode()
                           if info.filename == "i18n.json" else archive.read(info))
                target.writestr(info, content)
        temporary.replace(output)
    report = dict(sorted(counts.items()))
    output.with_suffix(output.suffix + ".report.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ("base", "raw", "output"):
        parser.add_argument("--" + option, required=True)
    args = parser.parse_args()
    print("ModI18N translation refresh:", json.dumps(update(args.base, args.raw, args.output)))
