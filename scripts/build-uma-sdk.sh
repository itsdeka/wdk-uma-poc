#!/bin/bash

# Script to build uma-js-sdk locally
# This will clone, build, and link the uma-sdk to your project

set -e

echo "🔧 Building uma-js-sdk locally..."

# Navigate to parent directory
cd "$(dirname "$0")/.."
CURRENT_DIR=$(pwd)

# Create a temp directory for the SDK
TMP_DIR="$(pwd)/tmp-uma-sdk"
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

echo "📦 Cloning uma-js-sdk repository..."
git clone https://github.com/uma-universal-money-address/uma-js-sdk.git "$TMP_DIR"
cd "$TMP_DIR"

echo "📥 Installing dependencies..."
# The repo uses Yarn
if ! command -v yarn &> /dev/null; then
    echo "⚠️  Yarn not found. Installing via npm..."
    npm install -g yarn
fi

yarn install

echo "🏗️  Building packages..."
yarn build

echo "🔗 Linking @uma-sdk/core..."
cd packages/core
yarn link

echo "✅ Linking to your project..."
cd "$CURRENT_DIR"
yarn link "@uma-sdk/core"

echo ""
echo "✅ Done! The uma-sdk has been built and linked to your project."
echo "📁 SDK source is in: $TMP_DIR"
echo ""
echo "To unlink later, run:"
echo "  yarn unlink @uma-sdk/core"
echo ""
echo "To remove the temp directory:"
echo "  rm -rf $TMP_DIR"

