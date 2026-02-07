const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const { test } = require('brittle')
const { initializeDatabase, closeDatabase } = require('../src/db/database')
const { paymentService } = require('../src/services/payments')
const { userService } = require('../src/services/users')
const { domainService } = require('../src/services/domains')

const testRunId = Date.now()

test('createPaymentRequest creates payment request successfully', async (t) => {
  try {
    await initializeDatabase()

    // Create a test user first
    const testDomain = `paytest${Date.now()}.com`
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

    const nonce = `test-nonce-1-${testRunId}`
    const paymentId = await paymentService.createPaymentRequest(
      userResult._id,
      nonce,
      10000, // 10 sats
      'USD',
      'polygon',
      'USDT_POLYGON',
      '0x123456789abcdef',
      3600
    )

    t.ok(paymentId, 'Payment request should be created with an ID')

    // Verify it was created
    const payment = await paymentService.getPaymentRequestByNonce(nonce)
    t.ok(payment, 'Payment should be retrievable by nonce')
    t.is(payment.user_id.toString(), userResult._id.toString(), 'User ID should match')
    t.is(payment.amount_msats, 10000, 'Amount should match')
    t.is(payment.settlement_layer, 'polygon', 'Settlement layer should match')

    t.pass('Payment request creation works')
  } catch (error) {
    t.fail(`Payment request creation failed: ${error.message}`)
  }
})

test('createPaymentRequest handles duplicate nonce', async (t) => {
  try {
    await initializeDatabase()

    // Create a test user first
    const testDomain = `duptest${Date.now()}.com`
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

    const nonce = `duplicate-nonce-test-${testRunId}`

    // Create first payment
    const firstPaymentId = await paymentService.createPaymentRequest(
      userResult._id,
      nonce,
      5000,
      'USD',
      'polygon',
      'USDT_POLYGON',
      '0x123456789abcdef',
      3600
    )

    t.ok(firstPaymentId, 'First payment should be created')

    // Try to create duplicate - should return null
    const duplicatePaymentId = await paymentService.createPaymentRequest(
      userResult._id,
      nonce, // Same nonce
      10000,
      'USD',
      'polygon',
      'USDT_POLYGON',
      '0x987654321fedcba',
      3600
    )

    t.is(duplicatePaymentId, null, 'Duplicate nonce should return null')

    t.pass('Duplicate nonce handling works')
  } catch (error) {
    t.fail(`Duplicate nonce test failed: ${error.message}`)
  }
})

test('getPaymentRequestByNonce retrieves payment correctly', async (t) => {
  try {
    await initializeDatabase()

    // Create a test user first
    const testDomain = `gettest${Date.now()}.com`
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

    const nonce = `get-by-nonce-test-${testRunId}`
    await paymentService.createPaymentRequest(
      userResult._id,
      nonce,
      7500,
      'USD',
      'polygon',
      'USDT_POLYGON',
      '0xabcdef123456789',
      3600
    )

    const payment = await paymentService.getPaymentRequestByNonce(nonce)

    t.ok(payment, 'Payment should be found by nonce')
    t.is(payment.nonce, nonce, 'Nonce should match')
    t.is(payment.amount_msats, 7500, 'Amount should match')

    t.pass('Payment retrieval by nonce works')
  } catch (error) {
    t.fail(`Payment retrieval by nonce failed: ${error.message}`)
  }
})

test('getPaymentRequestByNonce returns null for non-existent nonce', async (t) => {
  try {
    await initializeDatabase()

    const payment = await paymentService.getPaymentRequestByNonce('non-existent-nonce')

    t.is(payment, null, 'Should return null for non-existent nonce')

    t.pass('Non-existent nonce handling works')
  } catch (error) {
    t.fail(`Non-existent nonce test failed: ${error.message}`)
  }
})

test('getPaymentRequestsByUserId retrieves user payments', async (t) => {
  try {
    await initializeDatabase()

    // Create a test user first
    const testDomain = `usertest${Date.now()}.com`
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

    // Create multiple payments for the user
    const payments = []
    for (let i = 0; i < 3; i++) {
      const nonce = `user-payment-${i}-${testRunId}`
      const paymentId = await paymentService.createPaymentRequest(
        userResult._id,
        nonce,
        1000 * (i + 1),
        'USD',
        'polygon',
        'USDT_POLYGON',
        `0xaddress${i}`,
        3600
      )
      payments.push({ id: paymentId, nonce, amount: 1000 * (i + 1) })
    }

    const userPayments = await paymentService.getPaymentRequestsByUserId(userResult._id)

    t.ok(Array.isArray(userPayments), 'Should return an array')
    t.ok(userPayments.length >= 3, 'Should return at least the created payments')

    // Check that our payments are included
    const nonces = userPayments.map(p => p.nonce)
    for (const payment of payments) {
      t.ok(nonces.includes(payment.nonce), `Payment ${payment.nonce} should be in results`)
    }

    t.pass('User payment retrieval works')
  } catch (error) {
    t.fail(`User payment retrieval failed: ${error.message}`)
  }
})

test('updatePaymentStatus updates payment status', async (t) => {
  try {
    await initializeDatabase()

    // Create a test user first
    const testDomain = `statustest${Date.now()}.com`
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

    const nonce = `status-test-nonce-${testRunId}`
    const paymentId = await paymentService.createPaymentRequest(
      userResult._id,
      nonce,
      5000,
      'USD',
      'polygon',
      'USDT_POLYGON',
      '0xstatus123',
      3600
    )

    // Update status
    await paymentService.updatePaymentStatus(paymentId, 'completed')

    // Verify status was updated
    const payment = await paymentService.getPaymentRequestByNonce(nonce)
    t.is(payment.status, 'completed', 'Status should be updated to completed')

    t.pass('Payment status update works')
  } catch (error) {
    t.fail(`Payment status update failed: ${error.message}`)
  }
})

test('isPaymentExpired detects expired payments', async (t) => {
  const expiredPayment = {
    expires_at: new Date(Date.now() - 1000) // 1 second ago
  }

  const activePayment = {
    expires_at: new Date(Date.now() + 3600000) // 1 hour from now
  }

  const paymentWithoutExpiry = {
    status: 'pending'
  }

  t.ok(paymentService.isPaymentExpired(expiredPayment), 'Expired payment should be detected as expired')
  t.ok(!paymentService.isPaymentExpired(activePayment), 'Active payment should not be expired')
  t.ok(!paymentService.isPaymentExpired(paymentWithoutExpiry), 'Payment without expiry should not be expired')

  t.pass('Payment expiration detection works')
})

test('cleanup - close database connection', async (t) => {
  await closeDatabase()
  t.pass('Database connection closed')
})
