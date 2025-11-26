#!/bin/bash

# Alternative: Install uma-sdk by building it locally and copying dist files
# This approach doesn't require yarn link

set -e

echo "🔧 Building and installing uma-js-sdk locally..."

# Get the project root directory
cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)

# Create a local SDKs directory
SDK_DIR="$PROJECT_ROOT/local-sdks"
UMA_SDK_DIR="$SDK_DIR/uma-js-sdk"

echo "📁 Creating local-sdks directory..."
mkdir -p "$SDK_DIR"

# Clone or update the repository
if [ -d "$UMA_SDK_DIR" ]; then
    echo "📦 Updating existing uma-js-sdk repository..."
    cd "$UMA_SDK_DIR"
    git pull origin develop
else
    echo "📦 Cloning uma-js-sdk repository..."
    git clone -b develop https://github.com/uma-universal-money-address/uma-js-sdk.git "$UMA_SDK_DIR"
    cd "$UMA_SDK_DIR"
fi

echo "📥 Installing dependencies..."
# Check for yarn
if command -v yarn &> /dev/null; then
    yarn install
    echo "🏗️  Building packages..."
    yarn build
else
    # Fallback to npm
    npm install
    echo "🏗️  Building packages..."
    npm run build
fi

echo "🔗 Installing @uma-sdk/core to your project..."
cd "$PROJECT_ROOT"

# Add the local package to package.json
# Using file: protocol to reference local built package
npm install "$UMA_SDK_DIR/packages/core"

echo ""
echo "✅ Done! The uma-sdk has been built and installed."
echo "📁 SDK source is in: $UMA_SDK_DIR"
echo ""
echo "To rebuild and reinstall after updates:"
echo "  ./scripts/install-uma-sdk-local.sh"

