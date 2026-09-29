# DoL-Thalia

[简体中文](README.zh-CN.md) | English

[![Game](https://img.shields.io/badge/Game-Degrees%20of%20Lewdity-purple)](https://gitgud.io/Vrelnir/degrees-of-lewdity)
[![CHS](https://img.shields.io/badge/CHS-Localization-red)](https://github.com/Eltirosto/Degrees-of-Lewdity-Chinese-Localization)
[![ModLoader](https://img.shields.io/badge/SC2-ModLoader-blue)](https://github.com/MaplebirchLeaf/sugarcube-2-ModLoader)
[![Release](https://img.shields.io/github/v/release/MaplebirchLeaf/DoL-Thalia?label=release)](https://github.com/MaplebirchLeaf/DoL-Thalia/releases/latest)

DoL-Thalia is a build and release toolkit for creating modded [Degrees of Lewdity](https://gitgud.io/Vrelnir/degrees-of-lewdity) packages. It combines the game, SugarCube, a customized ModLoader, localization resources, and optional visual packs into playable HTML, ZIP, and Android APK releases.

This is an unofficial third-party project. It is not maintained or endorsed by the Degrees of Lewdity developers, the Chinese localization team, or the authors of the bundled mods.

## Download and play

Use the [DoL-Thalia Hub](https://maplebirchleaf.github.io/DoL-Thalia/) to compare packages, or download files directly from [GitHub Releases](https://github.com/MaplebirchLeaf/DoL-Thalia/releases).

- **ZIP:** Extract the archive and open the included HTML file in a browser. A release ZIP is a complete game package; do not import it as a ModLoader mod.
- **APK:** Install it on an Android device. Export your saves before updating or uninstalling the app.
- **Online:** Intended for quick access and may only offer the default preset.

Browser and Android WebView saves depend on local site data. Export your saves before clearing browser data, uninstalling an APK, switching releases, or moving to another device.

## Reporting problems

Before opening an issue, reproduce the problem with the upstream Chinese localization release or its online version when applicable.

- If the same problem occurs upstream, report it to the localization project.
- If it occurs only in DoL-Thalia, report it in this repository.
- If it is caused by a specific optional mod or visual pack, consult that project's documentation first.

Include the game version, preset, package type, platform, and reproduction steps in the report.

## Development setup

Requirements:

- [Bun](https://bun.sh/) 1.4.2 or later
- Git
- Node.js 20.17+ or 22.9+ for Cordova and upstream ModLoader build tools
- JDK 17 and Android SDK 35 only when building APKs

Clone the repository and install dependencies:

```bash
git clone https://github.com/MaplebirchLeaf/DoL-Thalia.git
cd DoL-Thalia
git submodule update --init vendor/sugarcube-2-ModLoader
bun install --frozen-lockfile
```

Prepare the local toolchain once, then create a quick development build:

```bash
bun run build:env
bun run build:local
```

The standard game can be built from a ZIP placed under `input/game/`. When no matching local ZIP exists, the standard build can fetch and compile the configured upstream game version. DoLP packages must be placed under `input/game-dolp/`.

## Commands

| Command               | Purpose                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `bun run build:env`   | Prepare SugarCube, ModLoader, story format, tools, and bundled mods |
| `bun run build:local` | Build a fast local HTML package with the selected preset            |
| `bun run build:html`  | Build a compressed HTML package for a selected version and preset   |
| `bun run build:zip`   | Run a complete release build and produce ZIP files                  |
| `bun run build:apk`   | Run a complete release build and produce APK files                  |
| `bun run build:all`   | Build HTML, ZIP, and APK release targets                            |
| `bun run check`       | Run TypeScript, lint, and formatting checks                         |
| `bun run site:dev`    | Start the release site locally                                      |
| `bun run site:build`  | Build the release site                                              |

Examples:

```bash
bun run build:html --preset=chs --version=0.5.12.13
bun run build:zip --preset=chs --version=0.5.12.13
bun run build:apk --preset=chs --version=0.5.12.13
bun run build:local --game=dolp --pure
```

See the [documentation index](docs/README.md) for commands, the build pipeline, private mod sources, and Android SDK setup.

## Project layout

| Path                 | Responsibility                                                           |
| -------------------- | ------------------------------------------------------------------------ |
| `src/commands/`      | Command-line entry points and option parsing                             |
| `src/builders/`      | Story, ModLoader, HTML, ZIP, and APK build stages                        |
| `src/sources/`       | Game, mod, and upstream source synchronization                           |
| `input/modList.json` | Release preset definitions                                               |
| `thalia.config.toml` | Game variants, source locations, outputs, and Android toolchain versions |
| `site/`              | DoL-Thalia Hub source and release metadata                               |

Generated files are written to `dist/`; local caches and generated Cordova projects are stored under `.cache/`.

## Related projects

- [Degrees of Lewdity](https://gitgud.io/Vrelnir/degrees-of-lewdity)
- [Degrees of Lewdity Chinese Localization](https://github.com/Eltirosto/Degrees-of-Lewdity-Chinese-Localization)
- [Thalia ModLoader fork](https://github.com/MaplebirchLeaf/sugarcube-2-ModLoader)
- [maplebirchFramework](https://github.com/MaplebirchLeaf/SCML-DOL-maplebirchFramework)
- [DoL-Lyra](https://github.com/DoL-Lyra/Lyra)

## License

Repository code is available under the [MIT License](LICENSE). Distributed game content, localization data, mods, and visual assets remain subject to their respective upstream licenses and terms. See [LICENSE-CC-BY-NC-SA-4.0](LICENSE-CC-BY-NC-SA-4.0) where applicable.
