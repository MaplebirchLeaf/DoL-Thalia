import { loadConfig } from '../config';
import { discoverGameVersions, withGameVersion } from '../game-input';
import { syncModSources } from '../mod-sources';

const config = await loadConfig();
for (const version of await discoverGameVersions(config)) {
  await syncModSources(withGameVersion(config, version));
}
