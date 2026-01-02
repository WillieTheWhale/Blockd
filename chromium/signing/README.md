# Code Signing Guide for Blockd Browser

This document describes the code signing process for all platforms to ensure authenticity and prevent tampering.

## Prerequisites

### Windows
- **Code Signing Certificate**: DigiCert or Sectigo EV (Extended Validation) certificate
- **SignTool**: Included in Windows SDK 10.0.22621.0 or later
- **Certificate Storage**: PFX file with private key password-protected
- **Time Stamping**: DigiCert timestamp server (http://timestamp.digicert.com)

### macOS
- **Apple Developer Account**: Enrolled in Apple Developer Program ($99/year)
- **Developer ID Certificate**: "Developer ID Application" certificate from Apple
- **Xcode**: Latest version with Command Line Tools installed
- **Notarization Credentials**: Apple ID, Team ID, and App-Specific Password
- **Sparkle Key Pair**: EdDSA key pair for update verification

### Linux
- **GPG Key**: For signing Debian/RPM packages and repositories
- **Key Server**: Upload public key to Ubuntu/Fedora key servers

## Windows Code Signing

### Step 1: Obtain Certificate

1. Purchase EV code signing certificate from DigiCert or Sectigo
2. Complete validation process (3-5 business days)
3. Download certificate and private key as PFX file
4. Store PFX file securely (never commit to Git)

### Step 2: Sign Binaries

```batch
cd chromium/installer/windows
set BLOCKD_CERT_PASSWORD=your_password_here
sign.bat
```

This will:
- Sign all DLLs and executables
- Sign the installer
- Apply RFC 3161 timestamp
- Verify signatures

### Step 3: Verify Signature

```batch
signtool verify /pa /v out\Release\blocked.exe
```

Expected output:
```
Successfully verified: out\Release\blocked.exe
Signing Certificate Chain:
    Issued to: Blockd Inc.
    Issued by: DigiCert EV Code Signing CA
```

## macOS Code Signing

### Step 1: Obtain Developer ID

1. Enroll in Apple Developer Program at https://developer.apple.com
2. Generate Developer ID Application certificate in Xcode
3. Download and install certificate in Keychain
4. Note your Team ID (10-character string)

### Step 2: Create App-Specific Password

1. Go to https://appleid.apple.com
2. Sign in with Apple ID
3. Generate app-specific password for notarization
4. Store password securely

### Step 3: Sign and Notarize

```bash
cd chromium/installer/mac
export BLOCKD_APPLE_ID="your@email.com"
export BLOCKD_TEAM_ID="ABCD123456"
export BLOCKD_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"
chmod +x sign_and_notarize.sh
./sign_and_notarize.sh
```

This will:
- Sign all binaries with hardened runtime
- Apply entitlements
- Submit to Apple for notarization (15-30 minutes)
- Staple notarization ticket to app bundle

### Step 4: Verify Notarization

```bash
spctl --assess --type execute --verbose=4 "out/Release/Blockd Browser.app"
```

Expected output:
```
out/Release/Blockd Browser.app: accepted
source=Notarized Developer ID
```

## Linux Package Signing

### Step 1: Create GPG Key

```bash
gpg --gen-key
# Follow prompts
# Use: Blockd Inc. <support@blockd.com>
```

### Step 2: Export Public Key

```bash
gpg --armor --export support@blockd.com > blockd-signing-key.asc
```

### Step 3: Sign Debian Package

```bash
dpkg-sig --sign builder blockd-browser_1.0.0_amd64.deb
```

### Step 4: Sign RPM Package

```bash
rpm --addsign blockd-browser-1.0.0-1.x86_64.rpm
```

### Step 5: Verify Signature

```bash
# Debian
dpkg-sig --verify blockd-browser_1.0.0_amd64.deb

# RPM
rpm --checksig blockd-browser-1.0.0-1.x86_64.rpm
```

## Sparkle Update Signing (macOS)

### Step 1: Generate EdDSA Key Pair

```bash
# Generate private key
openssl genpkey -algorithm Ed25519 -out sparkle_private.pem

# Extract public key
openssl pkey -in sparkle_private.pem -pubout -out sparkle_public.pem

# Convert to base64 for Info.plist
cat sparkle_public.pem | base64
```

### Step 2: Sign Update

```bash
# Sign DMG
./Pods/Sparkle/bin/sign_update \
    BlockedBrowser-v1.0.0.dmg \
    sparkle_private.pem
```

This outputs the EdDSA signature to include in appcast.xml.

## Security Best Practices

### Certificate Storage
- **Never commit certificates to Git**
- Store in secure password manager (1Password, LastPass)
- Use environment variables for passwords
- Rotate certificates before expiration

### CI/CD Integration
- Store certificates in GitHub Secrets or similar
- Use separate signing machines (not build machines)
- Implement code signing in isolated step
- Verify signatures in automated tests

### Certificate Revocation
If certificate is compromised:
1. Immediately revoke certificate with CA
2. Generate new certificate
3. Re-sign all releases
4. Notify users via website/email
5. Update auto-update servers

## Troubleshooting

### Windows: "SignTool error: No certificates were found"
- Ensure PFX file exists at specified path
- Check certificate password is correct
- Verify certificate hasn't expired

### macOS: "Notarization failed"
- Check app-specific password is correct
- Ensure all binaries are signed with same Developer ID
- Verify hardened runtime is enabled
- Check entitlements.plist is valid

### Linux: "GPG signing failed"
- Ensure GPG key is available in keyring
- Check passphrase if key is protected
- Verify key hasn't expired

## Certificate Renewal Timeline

| Platform | Certificate Type | Validity | Renewal Lead Time |
|----------|-----------------|----------|-------------------|
| Windows  | EV Code Signing | 1-3 years | 30 days |
| macOS    | Developer ID    | 1 year | 30 days |
| Linux    | GPG Key         | Indefinite | N/A (extend yearly) |

## Contact

For code signing issues:
- Email: security@blockd.com
- Slack: #security-team
- On-call: +1-555-BLOCKD (emergency only)
