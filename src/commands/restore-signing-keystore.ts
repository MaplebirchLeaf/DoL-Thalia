import { restoreSigningKeystore } from '../release/signing-keystore';

const encoded = Bun.env.THALIA_KEYSTORE_BASE64;
if (!encoded) throw new Error('Missing THALIA_KEYSTORE_BASE64 secret.');
const result = await restoreSigningKeystore(encoded, 'input/signing/DoL-Thalia.keystore');
console.log(`APK signing certificate SHA256: ${result.certificateSha256}`);
console.log(`Restored APK signing keystore from ${result.encodingLayers} Base64 layer(s).`);
