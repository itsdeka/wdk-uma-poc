const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const { test } = require('brittle')
const { initializeDatabase } = require('../src/db/database')
const { umaService } = require('../src/services/uma')
const { userService } = require('../src/services/users')
const { domainService } = require('../src/services/domains')

test('generateLookupResponse returns null for non-existent user', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `lookuptest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const response = await umaService.generateLookupResponse('nonexistent-user', domainResult.domain)

    t.is(response, null, 'Should return null for non-existent user')

    t.pass('Non-existent user lookup handling works')
  } catch (error) {
    t.fail(`Non-existent user lookup test failed: ${error.message}`)
  }
})

test('generatePayResponse throws error for duplicate nonce', async (t) => {
  try {
    await initializeDatabase()

    // Create a test user with Spark key
    const testDomain = `noncetest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const userResult = await userService.createUser({
      username: `testuser_${Date.now()}`,
      domainId: domainResult.domain._id,
      displayName: 'Test User',
      sparkPublicKey: 'dummy-spark-key'
    })

    const nonce = 'duplicate-nonce-test'

    // First payment should work
    try {
      await umaService.generatePayResponse(
        userResult.username,
        domainResult.domain,
        10000,
        nonce,
        'USD',
        'polygon',
        'USDT_POLYGON'
      )
    } catch (error) {
      // This might fail for other reasons, but duplicate nonce should fail
    }

    // Second payment with same nonce should fail with DUPLICATE_NONCE
    try {
      await umaService.generatePayResponse(
        userResult.username,
        domainResult.domain,
        15000,
        nonce, // Same nonce
        'USD',
        'polygon',
        'USDT_POLYGON'
      )
      t.fail('Should throw DUPLICATE_NONCE error')
    } catch (error) {
      t.is(error.message, 'DUPLICATE_NONCE', 'Should throw DUPLICATE_NONCE error')
    }

    t.pass('Duplicate nonce detection works')
  } catch (error) {
    t.fail(`Duplicate nonce test failed: ${error.message}`)
  }
})

test('generatePayResponse throws error for unsupported settlement layer', async (t) => {
  try {
    await initializeDatabase()

    // Create a test user
    const testDomain = `settlementtest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const userResult = await userService.createUser({
      username: `testuser_${Date.now()}`,
      domainId: domainResult.domain._id,
      displayName: 'Test User'
    })

    // Try to use a settlement layer that the user doesn't have an address for
    try {
      await umaService.generatePayResponse(
        userResult.username,
        domainResult.domain,
        10000,
        'unsupported-layer-nonce',
        'USD',
        'unsupported',
        'UNSUPPORTED_TOKEN'
      )
      t.fail('Should throw address not found error')
    } catch (error) {
      t.ok(error.message.includes('Address not found for settlement layer'), 'Should throw address not found error')
    }

    t.pass('Unsupported settlement layer handling works')
  } catch (error) {
    t.fail(`Unsupported settlement layer test failed: ${error.message}`)
  }
})

test('generatePayResponse throws error for Lightning without Spark key', async (t) => {
  try {
    await initializeDatabase()

    // Create a test user WITHOUT Spark key
    const testDomain = `lightningtest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const userResult = await userService.createUser({
      username: `testuser_${Date.now()}`,
      domainId: domainResult.domain._id,
      displayName: 'Test User'
      // No sparkPublicKey provided
    })

    // Try Lightning settlement without Spark key
    try {
      await umaService.generatePayResponse(
        userResult.username,
        domainResult.domain,
        10000,
        'lightning-no-spark-key',
        'USD',
        'ln',
        'BTC_LN'
      )
      t.fail('Should throw Spark key required error')
    } catch (error) {
      t.ok(error.message.includes('Lightning payments require a Spark public key'), 'Should throw Spark key required error')
    }

    t.pass('Lightning without Spark key handling works')
  } catch (error) {
    t.fail(`Lightning without Spark key test failed: ${error.message}`)
  }
})

test('generateLightningInvoice handles missing Spark key gracefully', async (t) => {
  try {
    // Test the generateLightningInvoice method directly with no Spark key
    const result = await umaService.generateLightningInvoice(10000, 'test-description', null)

    t.is(result, null, 'Should return null when no Spark key provided')

    t.pass('Lightning invoice generation with missing key works')
  } catch (error) {
    t.fail(`Lightning invoice generation test failed: ${error.message}`)
  }
})

test('generatePayResponse works with blockchain settlement', async (t) => {
  try {
    await initializeDatabase()

    // Create a test user
    const testDomain = `blockchaintetest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const userResult = await userService.createUser({
      username: `testuser_${Date.now()}`,
      domainId: domainResult.domain._id,
      displayName: 'Test User',
      addresses: {
        polygon: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
      }
    })

    const response = await umaService.generatePayResponse(
      userResult.username,
      domainResult.domain,
      10000,
      'blockchain-test-nonce',
      'USD',
      'polygon',
      'USDT_POLYGON'
    )

    t.ok(response, 'Should generate pay response for blockchain settlement')
    t.is(response.pr, '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb', 'Should return the blockchain address')
    t.is(response.disposable, false, 'Should not be disposable for blockchain')

    t.pass('Blockchain settlement works')
  } catch (error) {
    t.fail(`Blockchain settlement test failed: ${error.message}`)
  }
})

test('buildSettlementOptions creates correct options', async (t) => {
  try {
    const chains = {
      lightning: { address: 'lnbc1000n1pj9x3z0pp5...' },
      polygon: { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb' }
    }

    const settlementOptions = umaService.buildSettlementOptions(chains)

    t.ok(Array.isArray(settlementOptions), 'Should return an array')
    t.ok(settlementOptions.length > 0, 'Should have settlement options')

    // Should include ln and polygon
    const layers = settlementOptions.map(opt => opt.settlementLayer)
    t.ok(layers.includes('ln'), 'Should include Lightning Network layer')
    t.ok(layers.includes('polygon'), 'Should include polygon layer')

    // Check Lightning Network option
    const lnOption = settlementOptions.find(opt => opt.settlementLayer === 'ln')
    t.ok(lnOption, 'Should have Lightning Network option')
    t.is(lnOption.assets[0].identifier, 'BTC_LN', 'Lightning should use BTC_LN identifier')

    // Check polygon option
    const polyOption = settlementOptions.find(opt => opt.settlementLayer === 'polygon')
    t.ok(polyOption, 'Should have polygon option')
    t.is(polyOption.assets[0].identifier, 'USDT_POLYGON', 'Polygon should use USDT_POLYGON identifier')

    t.pass('Settlement options building works')
  } catch (error) {
    t.fail(`Settlement options building test failed: ${error.message}`)
  }
})

test('buildSettlementOptions handles unknown chains', async (t) => {
  try {
    const chains = {
      unknown: { address: 'some-address' },
      polygon: { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb' }
    }

    const settlementOptions = umaService.buildSettlementOptions(chains)

    t.ok(Array.isArray(settlementOptions), 'Should return an array')

    // Should only include known chains (polygon)
    const layers = settlementOptions.map(opt => opt.settlementLayer)
    t.notOk(layers.includes('unknown'), 'Should not include unknown chains')
    t.ok(layers.includes('polygon'), 'Should include known chains')

    t.pass('Unknown chain handling works')
  } catch (error) {
    t.fail(`Unknown chain handling test failed: ${error.message}`)
  }
})
