const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const test = require('brittle')
const { userService } = require('../src/services/users')
const { umaService } = require('../src/services/uma')
const { domainService } = require('../src/services/domains')
const { initializeDatabase, getDatabase, closeDatabase } = require('../src/db/database')

let testDomain
let testUser
let domainResult

test('Database connection and collections', async (t) => {
  await initializeDatabase()
  const db = await getDatabase()

  const collections = await db.listCollections().toArray()
  const collectionNames = collections.map(col => col.name)

  const requiredCollections = ['domains', 'users', 'chain_addresses', 'payment_requests', 'audit_log']

  for (const collection of requiredCollections) {
    t.ok(collectionNames.includes(collection), `Collection '${collection}' should exist`)
  }
})

test('Domain registration', async (t) => {
  testDomain = `test${Date.now()}.com`
  const testEmail = `admin@${testDomain}`

  domainResult = await domainService.createDomain({
    domain: testDomain,
    ownerEmail: testEmail,
    isDefault: false
  })

  t.ok(domainResult.domain, 'Domain should be created')
  t.is(domainResult.domain.domain, testDomain, 'Domain name should match')
  t.is(domainResult.domain.owner_email, testEmail, 'Owner email should match')
})

test('User creation', async (t) => {
  const testUsername = 'testuser_' + Date.now()
  const testDisplayName = 'Test User'

  testUser = await userService.createUser({
    username: testUsername,
    domainId: domainResult.domain._id,
    displayName: testDisplayName,
    addresses: {
      lightning: 'lnbc1000n1pj9x3z0pp5...',
      polygon: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
    }
  })

  t.ok(testUser, 'User should be created')
  t.is(testUser.username, testUsername, 'Username should match')
  t.is(testUser.display_name, testDisplayName, 'Display name should match')
  t.is(testUser.domain_id.toString(), domainResult.domain._id.toString(), 'Domain ID should match')
})

test('Chain addresses verification', async (t) => {
  const userAddresses = await userService.getUserAddresses(testUser._id)
  t.ok(userAddresses.length >= 2, 'User should have at least 2 addresses')

  const addressChains = userAddresses.map(addr => addr.chain_name)
  t.ok(addressChains.includes('lightning'), 'Should have lightning address')
  t.ok(addressChains.includes('polygon'), 'Should have polygon address')
})

test('UMA lookup response', async (t) => {
  const lookupResponse = await umaService.generateLookupResponse(testUser.username, domainResult.domain)

  t.ok(lookupResponse !== null, 'Lookup response should not be null')
  t.ok(lookupResponse.callback.includes(testUser.username), 'Callback URL should contain username')
  t.is(lookupResponse.maxSendable, 100000000, 'Max sendable should be 100000000')
  t.is(lookupResponse.minSendable, 1000, 'Min sendable should be 1000')
  t.is(lookupResponse.umaVersion, '1.0', 'UMA version should be 1.0')

  t.ok(lookupResponse.settlementOptions !== undefined, 'Lookup response should contain settlementOptions')
  t.ok(lookupResponse.settlementOptions.length > 0, 'settlementOptions should not be empty')

  const settlementLayers = lookupResponse.settlementOptions.map(opt => opt.settlementLayer)
  t.ok(settlementLayers.includes('polygon'), 'settlementOptions should include polygon')
})

test('UMA pay response - Lightning without Spark key should fail', async (t) => {
  const amountMsats = 10000
  const nonce = 'test-nonce-lightning-' + Date.now()

  try {
    await umaService.generatePayResponse(
      testUser.username,
      domainResult.domain,
      amountMsats,
      nonce
    )
    t.fail('Should fail when user has no Spark public key for Lightning payments')
  } catch (error) {
    t.ok(error.message.includes('Spark public key'), 'Should mention Spark public key requirement')
  }
})

test('UMA pay response - Blockchain settlement', async (t) => {
  const amountMsats = 10000
  const nonce = 'test-nonce-blockchain-' + Date.now()

  const payResponse = await umaService.generatePayResponse(
    testUser.username,
    domainResult.domain,
    amountMsats,
    nonce,
    'USD',
    'polygon',
    'USDT_POLYGON'
  )

  t.ok(payResponse !== null, 'Pay response should not be null')
  t.ok(payResponse.pr.length > 0, 'Payment address should not be empty')
  t.ok(payResponse.pr.startsWith('0x'), 'Should return blockchain address for polygon settlement')
  t.is(payResponse.disposable, false, 'Should not be disposable')
})

test('Non-existent user handling', async (t) => {
  const nonExistentUser = await userService.getUserByUsernameAndDomain('nonexistent', domainResult.domain._id)
  t.is(nonExistentUser, null, 'Non-existent user should return null')

  const nonExistentLookup = await umaService.generateLookupResponse('nonexistent', domainResult.domain)
  t.is(nonExistentLookup, null, 'Lookup for non-existent user should return null')
})

test('Domain constraints - duplicate domain', async (t) => {
  try {
    await domainService.createDomain({
      domain: testDomain,
      ownerEmail: 'different@example.com'
    })
    t.fail('Should not allow duplicate domain')
  } catch (error) {
    t.ok(error, 'Correctly prevented duplicate domain')
  }
})

test('Domain constraints - duplicate username', async (t) => {
  try {
    await userService.createUser({
      username: testUser.username,
      domainId: domainResult.domain._id,
      displayName: 'Different Name'
    })
    t.fail('Should not allow duplicate username in domain')
  } catch (error) {
    t.ok(error, 'Correctly prevented duplicate username in domain')
  }
})

test('cleanup - close database connection', async (t) => {
  await closeDatabase()
  t.pass('Database connection closed')
})
