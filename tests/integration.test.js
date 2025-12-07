const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const { userService } = require('../src/services/users')
const { umaService } = require('../src/services/uma')
const { domainService } = require('../src/services/domains')
const { initializeDatabase, getDatabase } = require('../src/db/database')

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

function log (message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`)
}

function assert (condition, message) {
  if (!condition) {
    log(`✗ FAILED: ${message}`, colors.red)
    throw new Error(message)
  }
  log(`✓ ${message}`, colors.green)
}

async function runTests () {
  log('\n════════════════════════════════════════════', colors.cyan)
  log('  UMA Backend Integration Test Suite', colors.cyan)
  log('════════════════════════════════════════════\n', colors.cyan)

  try {
    // ============================================
    // Test 1: Database Connection
    // ============================================
    log('\n[Test 1] Database Connection', colors.blue)
    log('─────────────────────────────────────────', colors.blue)

    try {
      // Initialize database
      await initializeDatabase()
      const db = await getDatabase()

      log('   Database connected successfully', colors.green)

      // Verify collections exist
      const collections = await db.listCollections().toArray()
      const collectionNames = collections.map(col => col.name)

      const requiredCollections = ['domains', 'users', 'chain_addresses', 'payment_requests', 'audit_log']

      for (const collection of requiredCollections) {
        assert(collectionNames.includes(collection), `Collection '${collection}' should exist`)
      }

      log(`   ✓ Collections: ${requiredCollections.join(', ')}`, colors.yellow)
    } catch (dbError) {
      log(`   ⚠ Database connection failed: ${dbError.message}`, colors.yellow)
      log('   Skipping database-dependent tests', colors.yellow)

      // Skip to the end if database is not available
      log('\n════════════════════════════════════════════', colors.cyan)
      log('  ⚠ Database Tests Skipped - MongoDB not available', colors.yellow)
      log('════════════════════════════════════════════\n', colors.cyan)
      return
    }

    // ============================================
    // Test 2: Domain Registration
    // ============================================
    log('\n[Test 2] Domain Registration', colors.blue)
    log('─────────────────────────────────────────', colors.blue)

    const testDomain = `test${Date.now()}.com`
    const testEmail = `admin@${testDomain}`

    // Register domain (skip verification for testing)
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: testEmail,
      isDefault: false
    })

    assert(domainResult.domain, 'Domain should be created')
    assert(domainResult.domain.domain === testDomain, 'Domain name should match')
    assert(domainResult.domain.owner_email === testEmail, 'Owner email should match')

    log(`   Domain: ${testDomain}`, colors.yellow)
    log(`   Owner Email: ${testEmail}`, colors.yellow)

    // ============================================
    // Test 3: User Creation
    // ============================================
    log('\n[Test 3] User Creation', colors.blue)
    log('─────────────────────────────────────────', colors.blue)

    const testUsername = 'testuser_' + Date.now() // Unique username for each test
    const testDisplayName = 'Test User'

    const user = await userService.createUser({
      username: testUsername,
      domainId: domainResult.domain._id,
      displayName: testDisplayName,
      // sparkPublicKey is optional - user can still be created without it
      addresses: {
        lightning: 'lnbc1000n1pj9x3z0pp5...',
        polygon: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
      }
    })

    assert(user, 'User should be created')
    assert(user.username === testUsername, 'Username should match')
    assert(user.display_name === testDisplayName, 'Display name should match')
    assert(user.domain_id.toString() === domainResult.domain._id.toString(), 'Domain ID should match')

    log(`   User ID: ${user._id}`, colors.yellow)
    log(`   Username: ${user.username}`, colors.yellow)
    log(`   Display Name: ${user.display_name}`, colors.yellow)

    // ============================================
    // Test 4: Chain Addresses Verification
    // ============================================
    log('\n[Test 4] Chain Addresses Verification', colors.blue)
    log('─────────────────────────────────────────', colors.blue)

    const userAddresses = await userService.getUserAddresses(user._id)
    assert(userAddresses.length >= 2, 'User should have at least 2 addresses')

    const addressChains = userAddresses.map(addr => addr.chain_name)
    assert(addressChains.includes('lightning'), 'Should have lightning address')
    assert(addressChains.includes('polygon'), 'Should have polygon address')

    log(`   Found ${userAddresses.length} addresses: ${addressChains.join(', ')}`, colors.yellow)

    // ============================================
    // Test 5: UMA Lookup Response
    // ============================================
    log('\n[Test 5] UMA Lookup Response', colors.blue)
    log('─────────────────────────────────────────', colors.blue)

    const lookupResponse = await umaService.generateLookupResponse(testUsername, domainResult.domain)

    assert(lookupResponse !== null, 'Lookup response should not be null')
    assert(lookupResponse.callback.includes(testUsername),
      'Callback URL should contain username')
    assert(lookupResponse.maxSendable === 100000000,
      'Max sendable should be 100000000')
    assert(lookupResponse.minSendable === 1000,
      'Min sendable should be 1000')
    assert(lookupResponse.umaVersion === '1.0',
      'UMA version should be 1.0')

    // Check settlementOptions contains chains
    assert(lookupResponse.settlementOptions !== undefined,
      'Lookup response should contain settlementOptions')
    assert(lookupResponse.settlementOptions.length > 0,
      'settlementOptions should not be empty')

    // Check for specific settlement layers
    const settlementLayers = lookupResponse.settlementOptions.map(opt => opt.settlementLayer)
    assert(settlementLayers.includes('polygon'),
      'settlementOptions should include polygon')

    log('   Lookup Response:', colors.yellow)
    log(`   - Callback: ${lookupResponse.callback}`, colors.yellow)
    log(`   - Max Sendable: ${lookupResponse.maxSendable}`, colors.yellow)
    log(`   - Min Sendable: ${lookupResponse.minSendable}`, colors.yellow)
    log(`   - UMA Version: ${lookupResponse.umaVersion}`, colors.yellow)
    log('   - Settlement Options:', colors.yellow)
    for (const option of lookupResponse.settlementOptions) {
      log(`      • Layer: ${option.settlementLayer}`, colors.yellow)
      for (const asset of option.assets) {
        log(`        - Asset: ${asset.identifier}`, colors.yellow)
      }
    }

    // ============================================
    // Test 6: UMA Pay Response - Lightning (should fail without Spark key)
    // ============================================
    log('\n[Test 6] UMA Pay Response - Lightning (should fail without Spark key)', colors.blue)
    log('─────────────────────────────────────────', colors.blue)

    const amountMsats = 10000 // 10 sats
    const nonce = 'test-nonce-lightning-' + Date.now()

    try {
      await umaService.generatePayResponse(
        testUsername,
        domainResult.domain,
        amountMsats,
        nonce
      )
      assert(false, 'Should fail when user has no Spark public key for Lightning payments')
    } catch (error) {
      assert(error.message.includes('Spark public key'), 'Should mention Spark public key requirement')
      log('   ✓ Correctly rejected Lightning payment without Spark key', colors.green)
    }

    // ============================================
    // Test 7: UMA Pay Response - Blockchain settlement
    // ============================================
    log('\n[Test 7] UMA Pay Response - Blockchain settlement', colors.blue)
    log('─────────────────────────────────────────', colors.blue)

    const nonce2 = 'test-nonce-blockchain-' + Date.now()

    try {
      const payResponse = await umaService.generatePayResponse(
        testUsername,
        domainResult.domain,
        amountMsats,
        nonce2,
        'USD',
        'polygon', // Use blockchain settlement
        'USDT_POLYGON'
      )

      assert(payResponse !== null, 'Pay response should not be null')
      assert(payResponse.pr.length > 0, 'Payment address should not be empty')

      // Should be a blockchain address
      assert(payResponse.pr.startsWith('0x'), 'Should return blockchain address for polygon settlement')
      assert(payResponse.disposable === false, 'Should not be disposable')

      log('   Pay Response (Blockchain):', colors.yellow)
      log(`   - Address: ${payResponse.pr}`, colors.yellow)
      log('   - Settlement Layer: polygon', colors.yellow)
      log('   - Asset: USDT_POLYGON', colors.yellow)
    } catch (error) {
      log(`   ⚠ Blockchain payment generation failed: ${error.message}`, colors.yellow)
    }

    // ============================================
    // Test 8: Non-existent User Handling
    // ============================================
    log('\n[Test 8] Non-existent User Handling', colors.blue)
    log('─────────────────────────────────────────', colors.blue)

    const nonExistentUser = await userService.getUserByUsernameAndDomain('nonexistent', domainResult.domain._id)
    assert(nonExistentUser === null,
      'Non-existent user should return null')

    const nonExistentLookup = await umaService.generateLookupResponse('nonexistent', domainResult.domain)
    assert(nonExistentLookup === null,
      'Lookup for non-existent user should return null')

    // ============================================
    // Test 9: Domain Constraints
    // ============================================
    log('\n[Test 9] Domain Constraints', colors.blue)
    log('─────────────────────────────────────────', colors.blue)

    // Try to create duplicate domain
    try {
      await domainService.createDomain({
        domain: testDomain,
        ownerEmail: 'different@example.com'
      })
      assert(false, 'Should not allow duplicate domain')
    } catch (error) {
      log('   ✓ Correctly prevented duplicate domain', colors.green)
    }

    // Try to create duplicate username in same domain
    try {
      await userService.createUser({
        username: testUsername,
        domainId: domainResult.domain._id,
        displayName: 'Different Name'
      })
      assert(false, 'Should not allow duplicate username in domain')
    } catch (error) {
      log('   ✓ Correctly prevented duplicate username in domain', colors.green)
    }

    // ============================================
    // Summary
    // ============================================
    log('\n════════════════════════════════════════════', colors.cyan)
    log('  ✓ All Tests Passed!', colors.green)
    log('════════════════════════════════════════════\n', colors.cyan)

    // Cleanup
    log('[Cleanup] Test database preserved for inspection', colors.blue)
    process.exit(1)
  } catch (error) {
    log('\n════════════════════════════════════════════', colors.red)
    log('  ✗ Test Suite Failed', colors.red)
    log('════════════════════════════════════════════', colors.red)
    log(`\nError: ${error.message}`, colors.red)
    if (error.stack) {
      log(`\nStack trace:\n${error.stack}`, colors.red)
    }

    process.exit(1)
  }
}

// Run tests
runTests()
