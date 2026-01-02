#!/bin/bash

# Blockd Auth Service - RSA Key Generation Script
# Generates RS256 key pair for JWT signing/verification

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYS_DIR="$SCRIPT_DIR/../keys"

echo "🔐 Blockd RSA Key Generation"
echo "============================"

# Create keys directory
mkdir -p "$KEYS_DIR"

# Check if keys already exist
if [ -f "$KEYS_DIR/private.pem" ] || [ -f "$KEYS_DIR/public.pem" ]; then
    echo "⚠️  Keys already exist in $KEYS_DIR"
    read -p "Overwrite existing keys? (y/N): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "Aborted."
        exit 0
    fi
fi

echo "📝 Generating 4096-bit RSA private key..."
openssl genrsa -out "$KEYS_DIR/private.pem" 4096

echo "📝 Extracting public key..."
openssl rsa -in "$KEYS_DIR/private.pem" -pubout -out "$KEYS_DIR/public.pem"

# Set secure permissions
echo "🔒 Setting secure file permissions..."
chmod 600 "$KEYS_DIR/private.pem"  # Owner read/write only
chmod 644 "$KEYS_DIR/public.pem"   # Owner read/write, others read

# Verify keys
echo "✅ Verifying key pair..."
if openssl rsa -in "$KEYS_DIR/private.pem" -check -noout 2>/dev/null; then
    echo "   Private key: OK"
else
    echo "❌ Private key verification failed!"
    exit 1
fi

if openssl rsa -in "$KEYS_DIR/public.pem" -pubin -noout 2>/dev/null; then
    echo "   Public key: OK"
else
    echo "❌ Public key verification failed!"
    exit 1
fi

echo ""
echo "✅ RSA keys generated successfully!"
echo "   Private key: $KEYS_DIR/private.pem"
echo "   Public key:  $KEYS_DIR/public.pem"
echo ""
echo "📋 Next steps:"
echo "   1. Copy public.pem to other services that need to verify JWTs"
echo "   2. Set JWT_PRIVATE_KEY_PATH and JWT_PUBLIC_KEY_PATH environment variables"
echo "   3. Never commit private.pem to version control!"
echo ""

# Add .gitignore for keys
if [ ! -f "$KEYS_DIR/.gitignore" ]; then
    echo "*.pem" > "$KEYS_DIR/.gitignore"
    echo "📄 Created $KEYS_DIR/.gitignore to prevent key commits"
fi
