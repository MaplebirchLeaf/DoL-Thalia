import releaseData from '../data/release.json';
import versionsData from '../data/versions.json';
import type { ReleasePreset, SiteRelease } from './types';

export const releasePresets = releaseData as ReleasePreset[];
export const releaseVersions = versionsData as SiteRelease[];
