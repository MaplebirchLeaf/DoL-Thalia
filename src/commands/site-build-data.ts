import { syncSiteData } from '../site/sync';

await syncSiteData(process.env.THALIA_RELEASE_TAG);
