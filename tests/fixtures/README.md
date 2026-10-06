# Signing test fixtures

These publicly committed keys are disposable test data. Never use them to sign release APKs.

- `signing-test.p12`: PKCS12, RSA 2048, alias `dol-thalia`, store/key password `android`.
- `signing-test-private-password.jks`: JKS, RSA 2048, alias `dol-thalia`, store password `android`, private key password `private-password`.

Tests copy the fixtures to temporary directories before changing them. Production signing still uses the CI secret and validates access to the actual private key. Fixed fixtures avoid random RSA key generation exceeding the test setup deadline on CI.
