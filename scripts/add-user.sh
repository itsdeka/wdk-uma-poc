#!/bin/bash

# UMA Backend - Add User Script
# Usage: ./scripts/add-user.sh [username] [display_name]

# Navigate to project root
cd "$(dirname "$0")/.." || exit

# Check if tsx is available
if ! command -v npx &> /dev/null; then
    echo "Error: npx is not installed"
    exit 1
fi

# Run the TypeScript script
npx tsx scripts/add-user.ts "$@"

