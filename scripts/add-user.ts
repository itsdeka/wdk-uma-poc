#!/usr/bin/env tsx

import * as readline from 'readline';
import { userService } from '../src/services/userService';
import { db } from '../src/db/database';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

// Default addresses for new users
const DEFAULT_ADDRESSES = [
  {
    chain_name: 'spark',
    address: '0250949ec35b022e3895fd37750102f94fe813523fa220108328a81790bf67ade5',
    description: 'Spark Identity (33-byte compressed pubkey)',
  },
  {
    chain_name: 'ethereum',
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    description: 'Ethereum Mainnet',
  },
  {
    chain_name: 'polygon',
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    description: 'Polygon (Matic)',
  },
  {
    chain_name: 'arbitrum',
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    description: 'Arbitrum One',
  },
  {
    chain_name: 'optimism',
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    description: 'Optimism',
  },
  {
    chain_name: 'base',
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    description: 'Base',
  },
  {
    chain_name: 'solana-mainnet',
    address: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
    description: 'Solana Mainnet',
  },
];

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function question(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function addUser(username?: string, displayName?: string) {
  const rl = createInterface();

  try {
    log('\n════════════════════════════════════════════', colors.cyan);
    log('  UMA Backend - Add User', colors.cyan);
    log('════════════════════════════════════════════\n', colors.cyan);

    // Get username
    if (!username) {
      username = await question(rl, colors.yellow + 'Enter username: ' + colors.reset);
      if (!username || username.trim() === '') {
        log('Error: Username is required', colors.red);
        process.exit(1);
      }
    }

    username = username.trim();

    // Check if user already exists
    const existingUser = userService.getUserByUsername(username);
    if (existingUser) {
      log(`\nError: User "${username}" already exists!`, colors.red);
      log(`User ID: ${existingUser.id}`, colors.yellow);
      log(`Display Name: ${existingUser.display_name || 'N/A'}`, colors.yellow);
      process.exit(1);
    }

    // Get display name
    if (!displayName) {
      displayName = await question(
        rl,
        colors.yellow + `Enter display name (or press Enter for "${username}"): ` + colors.reset
      );
      if (!displayName || displayName.trim() === '') {
        displayName = username;
      }
    }

    displayName = displayName.trim();

    log('\n─────────────────────────────────────────', colors.blue);
    log('Creating user...', colors.blue);
    log('─────────────────────────────────────────\n', colors.blue);

    // Create user
    const userId = userService.createUser(username, displayName);
    log(`✓ User created successfully!`, colors.green);
    log(`  ID: ${userId}`, colors.yellow);
    log(`  Username: ${username}`, colors.yellow);
    log(`  Display Name: ${displayName}`, colors.yellow);

    // Add default addresses
    log('\n─────────────────────────────────────────', colors.blue);
    log('Adding default chain addresses...', colors.blue);
    log('─────────────────────────────────────────\n', colors.blue);

    for (const addr of DEFAULT_ADDRESSES) {
      try {
        userService.addUserAddress(userId, addr.chain_name, addr.address);
        log(`✓ ${addr.chain_name.padEnd(20)} ${addr.description}`, colors.green);
        log(`  ${addr.address.substring(0, 50)}${addr.address.length > 50 ? '...' : ''}`, colors.yellow);
      } catch (error: any) {
        log(`✗ Failed to add ${addr.chain_name}: ${error.message}`, colors.red);
      }
    }

    // Show UMA address
    log('\n════════════════════════════════════════════', colors.cyan);
    log('  ✓ User Created Successfully!', colors.green);
    log('════════════════════════════════════════════\n', colors.cyan);

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    log('UMA Address:', colors.cyan);
    log(`  ${username}@${new URL(baseUrl).host}`, colors.yellow);
    log('\nUMA Endpoint:', colors.cyan);
    log(`  ${baseUrl}/.well-known/lnurlp/${username}`, colors.yellow);
    log('');

  } catch (error: any) {
    log(`\nError: ${error.message}`, colors.red);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    rl.close();
    db.close();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const username = args[0];
const displayName = args[1];

// Run
addUser(username, displayName);

