import modsData from '../data/mods.json';
import releaseData from '../data/release.json';
import versionsData from '../data/versions.json';
import type { ReleasePreset, SiteMod, SiteVersion } from './types';

export const mods = modsData as SiteMod[];
export const release = releaseData as ReleasePreset[];
export const versions = versionsData as SiteVersion[];
