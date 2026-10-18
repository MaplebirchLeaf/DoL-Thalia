"""Refresh existing ModI18N translations from a private ParaTranz raw export.

Source anchors remain those of the versioned upstream ModI18N archive unless
paired original/patched combat HTML is supplied for explicit rebinding.
See NumberSir/vrelnir_localization/src/project_dol.py for the TypeB format.
"""
import argparse
from collections import Counter, defaultdict
import json
from html.parser import HTMLParser
from difflib import SequenceMatcher
import os
from pathlib import Path, PurePosixPath
import re
import zipfile

EXCLUDED = {"失效词条", "移除文件", "更新日志"}
IDENTIFIER = r"[$A-Z_a-z][$0-9A-Z_a-z]*"
VARIABLE = re.compile(rf"(?<![$0-9A-Z_a-z])[$_]{IDENTIFIER}(?:\.{IDENTIFIER})*")
CONTROL = re.compile(r"<<\s*(/?(?:if|elseif|else|set|run|goto|pass|for|switch|case|default|break|continue))\b")
STRINGS = re.compile(r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*' ''', re.VERBOSE)
COMBAT_DESCRIPTIONS = {
    '<<set _text_output to "the " + $description>>',
    '<<set _text_output to "the " + $description + " " + $role>>',
    '<<set _text_output to "the " + $description + " man">>',
    '<<set _text_output to "the " + $description + " woman">>',
}


def safe(row, translation):
    original = row["f"]
    variables = translation
    if row.get('fileName') == 'text.twee' and row.get('pN') == 'Widgets Text' and original in COMBAT_DESCRIPTIONS:
        variables = variables.replace('($description_CN || $description)', '$description')
    if Counter(VARIABLE.findall(original)) != Counter(VARIABLE.findall(variables)):
        return False
    if CONTROL.findall(original) != CONTROL.findall(translation):
        return False
    if row.get("js"):
        # Only string content may change in JavaScript translation fragments.
        if STRINGS.sub('""', row['t']) != STRINGS.sub('""', translation):
            return False
    return True


class StoryPassages(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.passages = {}
        self.name = None
        self.content = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        if tag == 'tw-passagedata':
            self.name = dict(attrs)['name']
            self.content = []

    def handle_data(self, data):
        if self.name is not None:
            self.content.append(data)

    def handle_endtag(self, tag):
        if tag == 'tw-passagedata' and self.name is not None:
            self.passages[self.name] = ''.join(self.content)
            self.name = None


def adapt_combat(document, original, patched):
    before = StoryPassages(Path(original).read_text()).passages
    after = StoryPassages(Path(patched).read_text()).passages
    changed = {name for name in before.keys() | after.keys() if before.get(name) != after.get(name)}
    if not changed:
        raise ValueError('Combat localization requires changed source passages')
    # 只迁移已观察到的原版文本，移除跨越修复代码的旧规则。
    mappings = {}
    for name in changed & before.keys() & after.keys():
        old_lines = before[name].splitlines(keepends=True)
        new_lines = after[name].splitlines(keepends=True)
        old_offsets = [0]
        new_offsets = [0]
        for line in old_lines:
            old_offsets.append(old_offsets[-1] + len(line))
        for line in new_lines:
            new_offsets.append(new_offsets[-1] + len(line))
        mappings[name] = [(old_offsets[a], new_offsets[b], old_offsets[a + size] - old_offsets[a])
                          for a, b, size in SequenceMatcher(None, old_lines, new_lines, autojunk=False).get_matching_blocks()]
    rows = document['typeB']['TypeBInputStoryScript']
    output = []
    migrated = []
    counts = Counter()
    locations = {}
    for row in rows:
        name = row.get('pN')
        if name not in changed:
            output.append(row)
            continue
        source = row['f']
        translated = row['t']
        if not source:
            counts['combat_removed'] += 1
            continue
        old = before.get(name, '')
        position = row.get('pos', 0)
        matches = list(re.finditer(re.escape(source), old))
        if not matches:
            counts['combat_removed'] += 1
            continue
        old_position = min(matches, key=lambda match: abs(len(old[:match.start()].encode('utf-16-le')) // 2 - position)).start()
        destinations = []
        mapped = False
        for old_offset, new_offset, size in mappings.get(name, []):
            if old_offset <= old_position and old_position + len(source) <= old_offset + size:
                destinations = [(name, new_offset + old_position - old_offset)]
                mapped = True
                break
        if not destinations:
            # 宏抽离后文本可以进入多个新段落，仅迁移译文一致的精确片段。
            for target in sorted(changed & after.keys()):
                for match in re.finditer(re.escape(source), after[target]):
                    destinations.append((target, match.start()))
        if not destinations:
            counts['combat_removed'] += 1
            continue
        for target, offset in destinations:
            key = target, offset, source
            if key in locations:
                if locations[key] != translated:
                    raise ValueError(f'Conflicting combat translation in {target} at {offset}')
                continue
            locations[key] = translated
            migrated.append((mapped, {**row, 'pN': target, 'pos': offset}))
    occupied = defaultdict(list)
    for mapped, row in sorted(migrated, key=lambda item: (not item[0], -len(item[1]['f']))):
        start = row['pos']
        end = start + len(row['f'])
        if any(start < right and left < end for left, right in occupied[row['pN']]):
            counts['combat_overlap_removed'] += 1
            continue
        occupied[row['pN']].append((start, end))
        output.append({**row, 'pos': len(after[row['pN']][:start].encode('utf-16-le')) // 2})
        counts['combat_bound'] += 1
    document['typeB']['TypeBInputStoryScript'] = output
    return counts


def localize_combat_descriptions(document):
    # 只修复原版人物称呼的显示规则，不改写 NPC 的英文标识或生成逻辑。
    repaired = 0
    for row in document['typeB'].get('TypeBInputStoryScript', []):
        if row.get('fileName') != 'text.twee' or row.get('pN') != 'Widgets Text' or row['f'] not in COMBAT_DESCRIPTIONS:
            continue
        if '$description_CN' in row['t']:
            continue
        translated = re.sub(r'\$description\b', '($description_CN || $description)', row['t'])
        if translated != row['t']:
            row['t'] = translated
            repaired += 1
    return repaired


def update(base, raw, output, combat_original=None, combat_html=None):
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
        counts["combat_description_repaired"] = localize_combat_descriptions(document)
        if combat_html:
            if not combat_original:
                raise ValueError('Missing original combat source')
            counts.update(adapt_combat(document, combat_original, combat_html))
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
    parser.add_argument('--combat-original')
    parser.add_argument('--combat-html')
    args = parser.parse_args()
    print("ModI18N translation refresh:", json.dumps(update(args.base, args.raw, args.output, args.combat_original, args.combat_html)))
