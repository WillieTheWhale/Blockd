/**
 * Generate RSA Key Pair for JWT Signing
 * Blockd Auth Service
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEYS_DIR = path.join(__dirname, '../keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.pem');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public.pem');

console.log('🔐 Generating RSA key pair for JWT signing...\n');

// Create keys directory if it doesn't exist
if (!fs.existsSync(KEYS_DIR)) {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  console.log('✅ Created keys directory');
}

// Check if keys already exist
if (fs.existsSync(PRIVATE_KEY_PATH) || fs.existsSync(PUBLIC_KEY_PATH)) {
  console.log('⚠️  Keys already exist!');
  console.log('   Private key:', PRIVATE_KEY_PATH);
  console.log('   Public key:', PUBLIC_KEY_PATH);
  console.log('\nTo regenerate keys, delete the existing files and run this script again.');
  process.exit(0);
}

// Generate RSA key pair
console.log('⚙️  Generating 2048-bit RSA key pair...');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

// Save private key
fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
console.log('✅ Private key saved:', PRIVATE_KEY_PATH);

// Save public key
fs.writeFileSync(PUBLIC_KEY_PATH, publicKey, { mode: 0o644 });
console.log('✅ Public key saved:', PUBLIC_KEY_PATH);

console.log('\n✨ RSA key pair generated successfully!');
console.log('\n⚠️  IMPORTANT SECURITY NOTES:');
console.log('   1. Keep private.pem SECRET and SECURE');
console.log('   2. Never commit private.pem to version control');
console.log('   3. Add keys/ directory to .gitignore');
console.log('   4. Back up private.pem securely');
console.log('   5. Rotate keys periodically in production\n');

// Generate MFA encryption key
console.log('🔐 Generating MFA encryption key...\n');
const mfaKey = crypto.randomBytes(32).toString('hex');
console.log('✅ MFA Encryption Key generated:');
console.log(`   ${mfaKey}`);
console.log('\n⚠️  Add this to your .env file:');
console.log(`   MFA_ENCRYPTION_KEY=${mfaKey}\n`);
