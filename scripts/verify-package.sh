#!/bin/bash

# Clean up any previous test packages
rm -rf /tmp/git-assure-test
mkdir -p /tmp/git-assure-test

# Build the package
echo "Building TypeScript..."
yarn build

# Create a local package
echo "Creating npm package..."
yarn pack

# Unpack it to examine the contents
echo "Unpacking package to examine contents..."
tar -xzf git-assure-*.tgz -C /tmp/git-assure-test

# Check if the dist directory exists and has the right structure
echo "Checking package contents..."
if [ -d "/tmp/git-assure-test/package/dist/src" ]; then
  echo "✅ dist/src directory exists"
  
  if [ -f "/tmp/git-assure-test/package/dist/src/cli.js" ]; then
    echo "✅ dist/src/cli.js exists"
  else
    echo "❌ ERROR: dist/src/cli.js is missing!"
  fi
else
  echo "❌ ERROR: dist/src directory is missing!"
fi

# Check if the bin files are correctly set up
echo "Checking bin files..."
if grep -q "require('../dist/src/cli')" "/tmp/git-assure-test/package/bin/git-assure"; then
  echo "✅ bin/git-assure is correctly requiring '../dist/src/cli'"
else
  echo "❌ ERROR: bin/git-assure is not correctly requiring '../dist/src/cli'"
fi