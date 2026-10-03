import { loadConfig, withGameVariant } from '../core/config';
import { readReleasePresets } from '../release/presets';
import { verifyReleaseAssets } from '../release/verify';
import { withGameVersion } from '../sources/game-input';
import { parseReleaseOptions } from './release-options';

const options = parseReleaseOptions(process.argv.slice(2));
if (options.versions?.length !== 1 || !options.presets?.length) throw new Error('verify-release requires one --version and an explicit --presets list');
const config = withGameVersion(withGameVariant(await loadConfig(), options.game), options.versions[0]);
const available = await readReleasePresets(config.paths.mod_list);
for (const name of options.presets) if (!available.some(preset => preset.name === name)) throw new Error(`Unknown release preset: ${name}`);
const assets = await verifyReleaseAssets(config, options.presets);
console.log(`Verified complete release: ${options.presets.length} ZIPs and ${options.presets.length} APKs (${assets.length} assets).`);
