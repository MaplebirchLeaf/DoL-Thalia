import releaseData from '../data/release.json';
import versionsData from '../data/versions.json';
import type { ReleasePreset, SiteVersion } from './types';

export const releasePresets = releaseData as ReleasePreset[];
export const releaseVersions = versionsData as SiteVersion[];
