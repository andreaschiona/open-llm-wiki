#!/usr/bin/env bash
# Setup Android keystore for APK signing
#
# Two modes:
#   1. Production: ANDROID_KEYSTORE_BASE64 secret → decode and use
#   2. Debug: generate temporary keystore for development builds
#
# Output: src-tauri/android/keystore.properties
set -euo pipefail

KEYSTORE_DIR="src-tauri/android/app"
PROPS_FILE="src-tauri/android/keystore.properties"
KEYSTORE_PATH="${KEYSTORE_DIR}/open-llm-wiki.keystore"

if [ -n "${ANDROID_KEYSTORE_BASE64:-}" ]; then
  echo "🔐 Using keystore from ANDROID_KEYSTORE_BASE64 secret"

  # Decode keystore
  echo "$ANDROID_KEYSTORE_BASE64" | base64 -d > "$KEYSTORE_PATH"
  chmod 600 "$KEYSTORE_PATH"

  # Use provided passwords or defaults
  STORE_PASS="${ANDROID_KEYSTORE_PASSWORD:-android}"
  KEY_ALIAS="${ANDROID_KEY_ALIAS:-open-llm-wiki}"
  KEY_PASS="${ANDROID_KEY_PASSWORD:-${STORE_PASS}}"

  cat > "$PROPS_FILE" <<EOF
storeFile=$(realpath "$KEYSTORE_PATH")
storePassword=${STORE_PASS}
keyAlias=${KEY_ALIAS}
keyPassword=${KEY_PASS}
EOF
  echo "✅ Keystore configured from secret"
else
  echo "🔑 No ANDROID_KEYSTORE_BASE64 secret — generating debug keystore"

  # Generate a temporary debug keystore
  KEYSTORE_PASS="android"
  KEY_ALIAS="androiddebugkey"
  KEY_PASS="android"

  # Use keytool from Java if available, or create placeholder
  if command -v keytool &>/dev/null; then
    keytool -genkey -v \
      -keystore "$KEYSTORE_PATH" \
      -alias "$KEY_ALIAS" \
      -keyalg RSA \
      -keysize 2048 \
      -validity 10000 \
      -storepass "$KEYSTORE_PASS" \
      -keypass "$KEY_PASS" \
      -dname "CN=Developer, OU=Development, O=open-llm-wiki, L=Unknown, ST=Unknown, C=XX" \
      -noprompt
    echo "✅ Debug keystore generated with keytool"
  else
    echo "⚠️  keytool not available, creating placeholder — build will use unsigned APK"
    # Create empty marker so build doesn't fail
    touch "$KEYSTORE_PATH"
  fi

  cat > "$PROPS_FILE" <<EOF
storeFile=$(realpath "$KEYSTORE_PATH")
storePassword=${KEYSTORE_PASS}
keyAlias=${KEY_ALIAS}
keyPassword=${KEY_PASS}
EOF
  echo "✅ Debug keystore configured"
fi
