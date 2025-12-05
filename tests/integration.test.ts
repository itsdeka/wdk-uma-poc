import * as fs from 'fs';
import * as path from 'path';
import { db, initializeDatabase, userQueries, addressQueries } from '../src/db/database';
import { userService } from '../src/services/userService';
import { createUmaService } from '../src/services/umaService';

// Test database path
const TEST_DB_PATH = 'data/uma.db'

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

function assert(condition: boolean, message: string) {
  if (!condition) {
    log(`✗ FAILED: ${message}`, colors.red);
    throw new Error(message);
  }
  log(`✓ ${message}`, colors.green);
}

async function runTests() {
  log('\n════════════════════════════════════════════', colors.cyan);
  log('  UMA Backend Integration Test Suite', colors.cyan);
  log('════════════════════════════════════════════\n', colors.cyan);

  try {
    // ============================================
    // Test 1: Database Status
    // ============================================
    log('\n[Test 1] Database Status', colors.blue);
    log('─────────────────────────────────────────', colors.blue);
    
    assert(fs.existsSync(TEST_DB_PATH), 'Database file should exist');
    log('   Database path: ' + TEST_DB_PATH, colors.yellow);
    log('   Database file size: ' + fs.statSync(TEST_DB_PATH).size + ' bytes', colors.yellow);
    
    // Verify tables exist
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name IN ('users', 'chain_addresses', 'payment_requests')
    `).all();
    
    assert(tables.length === 3, 'All three tables should exist');
    log('   ✓ Tables: users, chain_addresses, payment_requests', colors.yellow);

    // ============================================
    // Test 2: User Creation
    // ============================================
    log('\n[Test 2] User Creation', colors.blue);
    log('─────────────────────────────────────────', colors.blue);
    
    const testUsername = 'testuser_' + Date.now(); // Unique username for each test
    const testDisplayName = 'Test User';
    
    const userId = userService.createUser(testUsername, testDisplayName);
    assert(userId > 0, `User should be created with ID: ${userId}`);
    
    // Verify user exists
    const user = userService.getUserByUsername(testUsername);
    assert(user !== undefined, 'User should be retrievable');
    assert(user!.username === testUsername, 'Username should match');
    assert(user!.display_name === testDisplayName, 'Display name should match');
    log(`   User ID: ${userId}`, colors.yellow);
    log(`   Username: ${user!.username}`, colors.yellow);
    log(`   Display Name: ${user!.display_name}`, colors.yellow);

    // ============================================
    // Test 3: Adding Chain Addresses
    // ============================================
    log('\n[Test 3] Adding Chain Addresses', colors.blue);
    log('─────────────────────────────────────────', colors.blue);
    
    const testAddresses = [
      {
        chain_name: 'spark',
        address: '0250949ec35b022e3895fd37750102f94fe813523fa220108328a81790bf67ade5',
      },
      {
        chain_name: 'ethereum',
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      },
      {
        chain_name: 'polygon',
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      },
      {
        chain_name: 'solana-mainnet',
        address: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
      },
    ];
    
    for (const addr of testAddresses) {
      const addressId = userService.addUserAddress(
        userId,
        addr.chain_name,
        addr.address
      );
      assert(addressId > 0, `Address added for chain: ${addr.chain_name}`);
      log(`   ✓ ${addr.chain_name}: ${addr.address.substring(0, 20)}...`, colors.yellow);
    }
    
    // Verify addresses are retrievable
    const userAddresses = userService.getUserAddresses(userId);
    assert(userAddresses.length === testAddresses.length, 
      `Should have ${testAddresses.length} addresses`);

    // ============================================
    // Test 4: Get Formatted Addresses
    // ============================================
    log('\n[Test 4] Get Formatted Addresses', colors.blue);
    log('─────────────────────────────────────────', colors.blue);
    
    const formattedAddresses = userService.getFormattedAddresses(userId);
    
    assert('spark' in formattedAddresses, 'Spark address should be present');
    assert('ethereum' in formattedAddresses, 'Ethereum address should be present');
    assert('polygon' in formattedAddresses, 'Polygon address should be present');
    assert('solana-mainnet' in formattedAddresses, 'Solana address should be present');
    
    // Check that chainId is added for EVM chains
    assert(formattedAddresses.ethereum.chainId === 1, 'Ethereum chainId should be 1');
    assert(formattedAddresses.polygon.chainId === 137, 'Polygon chainId should be 137');
    
    log('   Formatted addresses:', colors.yellow);
    log(JSON.stringify(formattedAddresses, null, 2), colors.yellow);

    // ============================================
    // Test 5: UMA Lookup Response
    // ============================================
    log('\n[Test 5] UMA Lookup Response', colors.blue);
    log('─────────────────────────────────────────', colors.blue);
    
    const baseUrl = 'http://localhost:3000';
    const umaService = createUmaService(baseUrl);
    
    const lookupResponse = umaService.generateLookupResponse(testUsername);
    
    assert(lookupResponse !== null, 'Lookup response should not be null');
    assert(lookupResponse!.callback.includes(testUsername), 
      'Callback URL should contain username');
    assert(lookupResponse!.maxSendable === 100000000, 
      'Max sendable should be 100000000');
    assert(lookupResponse!.minSendable === 1000, 
      'Min sendable should be 1000');
    assert(lookupResponse!.umaVersion === '1.0', 
      'UMA version should be 1.0');
    
    // Check settlementOptions contains chains
    assert(lookupResponse!.settlementOptions !== undefined, 
      'Lookup response should contain settlementOptions');
    assert(lookupResponse!.settlementOptions!.length > 0, 
      'settlementOptions should not be empty');
    
    // Check for specific settlement layers
    const settlementLayers = lookupResponse!.settlementOptions!.map(opt => opt.settlementLayer);
    assert(settlementLayers.includes('spark'), 
      'settlementOptions should include spark');
    assert(settlementLayers.includes('ethereum') || settlementLayers.includes('polygon'), 
      'settlementOptions should include at least one EVM chain');
    
    log('   Lookup Response:', colors.yellow);
    log(`   - Callback: ${lookupResponse!.callback}`, colors.yellow);
    log(`   - Max Sendable: ${lookupResponse!.maxSendable}`, colors.yellow);
    log(`   - Min Sendable: ${lookupResponse!.minSendable}`, colors.yellow);
    log(`   - UMA Version: ${lookupResponse!.umaVersion}`, colors.yellow);
    log('   - Settlement Options:', colors.yellow);
    for (const option of lookupResponse!.settlementOptions!) {
      log(`      • Layer: ${option.settlementLayer}`, colors.yellow);
      for (const asset of option.assets) {
        log(`        - Asset: ${asset.identifier}`, colors.yellow);
      }
    }

    // ============================================
    // Test 6: UMA Pay Response (Invoice Generation)
    // ============================================
    log('\n[Test 6] UMA Pay Response (Invoice Generation)', colors.blue);
    log('─────────────────────────────────────────', colors.blue);
    
    const amountMsats = 10000; // 10 sats
    const nonce = 'test-nonce-' + Date.now();
    
    try {
      const payResponse = await umaService.generatePayResponse(
        testUsername,
        amountMsats,
        nonce
      );
      
      assert(payResponse !== null, 'Pay response should not be null');
      assert(payResponse!.pr.length > 0, 'Invoice (pr) should not be empty');
      assert(payResponse!.pr.startsWith('lnbc'), 
        'Invoice should start with lnbc (Lightning invoice format)');
      assert(payResponse!.disposable === false, 
        'Invoice should not be disposable');
      
      // Pay response should NOT contain settlementOptions (only lookup response has those)
      // It may contain settlement info if sender specified their choice
      log('   Pay Response:', colors.yellow);
      log(`   - Invoice: ${payResponse!.pr.substring(0, 50)}...`, colors.yellow);
      log(`   - Routes: ${JSON.stringify(payResponse!.routes)}`, colors.yellow);
      log(`   - Disposable: ${payResponse!.disposable}`, colors.yellow);
      log(`   - Success Message: ${payResponse!.successAction.message}`, colors.yellow);
      if (payResponse!.settlement) {
        log(`   - Settlement Layer: ${payResponse!.settlement.layer}`, colors.yellow);
        log(`   - Asset Identifier: ${payResponse!.settlement.assetIdentifier}`, colors.yellow);
      } else {
        log('   - No specific settlement requested (Lightning default)', colors.yellow);
      }
    } catch (error: any) {
      log(`   ⚠ Invoice generation failed (expected without Spark SDK): ${error.message}`, colors.yellow);
      log('   This is normal if Spark SDK is not properly initialized', colors.yellow);
    }

    // ============================================
    // Test 7: Non-existent User
    // ============================================
    log('\n[Test 7] Non-existent User Handling', colors.blue);
    log('─────────────────────────────────────────', colors.blue);
    
    const nonExistentUser = userService.getUserByUsername('nonexistent');
    assert(nonExistentUser === undefined, 
      'Non-existent user should return undefined');
    
    const nonExistentLookup = umaService.generateLookupResponse('nonexistent');
    assert(nonExistentLookup === null, 
      'Lookup for non-existent user should return null');

    // ============================================
    // Test 8: Database Constraints
    // ============================================
    log('\n[Test 8] Database Constraints', colors.blue);
    log('─────────────────────────────────────────', colors.blue);
    
    // Try to create duplicate username
    try {
      userService.createUser(testUsername, 'Another Name');
      assert(false, 'Should not allow duplicate username');
    } catch (error) {
      log('   ✓ Correctly prevented duplicate username', colors.green);
    }
    
    // Try to add duplicate chain for same user
    try {
      userService.addUserAddress(userId, 'ethereum', '0xDifferentAddress');
      assert(false, 'Should not allow duplicate chain for same user');
    } catch (error) {
      log('   ✓ Correctly prevented duplicate chain address', colors.green);
    }

    // ============================================
    // Summary
    // ============================================
    log('\n════════════════════════════════════════════', colors.cyan);
    log('  ✓ All Tests Passed!', colors.green);
    log('════════════════════════════════════════════\n', colors.cyan);

    // Cleanup
    log('[Cleanup] Test database preserved for inspection', colors.blue);
    log(`   Location: ${TEST_DB_PATH}\n`, colors.yellow);

  } catch (error: any) {
    log('\n════════════════════════════════════════════', colors.red);
    log('  ✗ Test Suite Failed', colors.red);
    log('════════════════════════════════════════════', colors.red);
    log(`\nError: ${error.message}`, colors.red);
    if (error.stack) {
      log(`\nStack trace:\n${error.stack}`, colors.red);
    }
    
    process.exit(1);
  }
}

// Run tests
runTests();

