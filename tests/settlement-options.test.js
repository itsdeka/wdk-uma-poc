const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const {
  getSignedLnurlpRequestUrl,
  parseLnurlpRequest,
  getLnurlpResponse,
  getPayRequest,
  getPayReqResponseForSettlementLayer,
  LnurlpResponse,
  PayRequest,
  PayReqResponse,
  Currency,
  KycStatus
} = require('@uma-sdk/core')
const secp256k1 = require('secp256k1')
const { randomBytes } = require('crypto')

// Helper function to generate a keypair for testing
const generateKeypair = async () => {
  let privateKey
  do {
    privateKey = new Uint8Array(randomBytes(32))
  } while (!secp256k1.privateKeyVerify(privateKey))

  const publicKey = secp256k1.publicKeyCreate(privateKey, false)

  return {
    privateKey,
    publicKey
  }
}

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
  log('  UMA Settlement Options Test Suite', colors.cyan)
  log('════════════════════════════════════════════\n', colors.cyan)

  try {
    // ============================================
    // Test 1: Settlement options in lnurlp response
    // ============================================
    log('\n[Test 1] Settlement options in lnurlp response', colors.blue)
    log('─────────────────────────────────────────', colors.blue)

    const senderKeyPair = await generateKeypair()
    const receiverKeyPair = await generateKeypair()
    const receiverAddress = 'bob@vasp2.com'

    const lnurlpRequestUrl = await getSignedLnurlpRequestUrl({
      signingPrivateKey: senderKeyPair.privateKey,
      receiverAddress,
      senderVaspDomain: 'vasp1.com',
      isSubjectToTravelRule: true
    })

    const lnurlpRequest = await parseLnurlpRequest(lnurlpRequestUrl)

    const settlementOptions = [
      {
        settlementLayer: 'spark',
        assets: [
          {
            identifier: 'btkn1...',
            multipliers: {
              USD: 1234,
              PHP: 5678
            }
          }
        ]
      },
      {
        settlementLayer: 'ln',
        assets: [
          {
            identifier: 'BTC',
            multipliers: {
              USD: 1234
            }
          }
        ]
      }
    ]

    const lnurlpResponse = await getLnurlpResponse({
      request: lnurlpRequest,
      privateKeyBytes: receiverKeyPair.privateKey,
      requiresTravelRuleInfo: true,
      callback: 'https://vasp2.com/api/lnurl/payreq',
      encodedMetadata: '[["text/plain", "Pay to vasp2.com user $bob"]]',
      minSendableSats: 1000,
      maxSendableSats: 100000,
      payerDataOptions: {
        identifier: { mandatory: true },
        name: { mandatory: false },
        email: { mandatory: false },
        compliance: { mandatory: true }
      },
      currencyOptions: [
        new Currency('USD', 'US Dollar', '$', 1000, 1, 100000000, 2)
      ],
      receiverKycStatus: KycStatus.Verified,
      settlementOptions
    })

    assert(lnurlpResponse.settlementOptions !== undefined, 'settlementOptions should be defined')
    assert(lnurlpResponse.settlementOptions.length === 2, 'settlementOptions should have 2 items')
    assert(lnurlpResponse.settlementOptions[0].settlementLayer === 'spark',
      'First settlement layer should be spark')
    assert(lnurlpResponse.settlementOptions[0].assets.length === 1,
      'First settlement option should have 1 asset')
    assert(lnurlpResponse.settlementOptions[0].assets[0].identifier === 'btkn1...',
      'First asset identifier should be btkn1...')

    log('   Settlement Options:', colors.yellow)
    log(`   - Count: ${lnurlpResponse.settlementOptions.length}`, colors.yellow)
    log(`   - First layer: ${lnurlpResponse.settlementOptions[0].settlementLayer}`, colors.yellow)

    const serialized = lnurlpResponse.toJsonString()
    const deserialized = LnurlpResponse.fromJson(serialized)
    assert(JSON.stringify(deserialized.settlementOptions) === JSON.stringify(settlementOptions),
      'Deserialized settlementOptions should equal original')
    log('   ✓ Serialization/deserialization works correctly', colors.yellow)

    // ============================================
    // Test 2: Settlement info in pay request
    // ============================================
    log('\n[Test 2] Settlement info in pay request', colors.blue)
    log('─────────────────────────────────────────', colors.blue)

    const senderKeyPair2 = await generateKeypair()
    const receiverKeyPair2 = await generateKeypair()

    const payRequest = await getPayRequest({
      receiverEncryptionPubKey: receiverKeyPair2.publicKey,
      sendingVaspPrivateKey: senderKeyPair2.privateKey,
      receivingCurrencyCode: 'USD',
      isAmountInReceivingCurrency: true,
      amount: 100,
      payerIdentifier: 'alice@vasp1.com',
      payerKycStatus: KycStatus.Verified,
      umaMajorVersion: 1,
      settlement: {
        layer: 'spark',
        assetIdentifier: 'btkn1...'
      }
    })

    assert(payRequest.settlement !== undefined, 'settlement should be defined')
    assert(payRequest.settlement.layer === 'spark', 'settlement layer should be spark')
    assert(payRequest.settlement.assetIdentifier === 'btkn1...',
      'settlement asset identifier should be btkn1...')

    log('   Settlement Info:', colors.yellow)
    log(`   - Layer: ${payRequest.settlement.layer}`, colors.yellow)
    log(`   - Asset ID: ${payRequest.settlement.assetIdentifier}`, colors.yellow)

    const serialized2 = payRequest.toJsonString()
    const deserialized2 = PayRequest.fromJson(serialized2)
    assert(JSON.stringify(deserialized2.settlement) === JSON.stringify(payRequest.settlement),
      'Deserialized settlement should equal original')
    log('   ✓ Serialization/deserialization works correctly', colors.yellow)

    // ============================================
    // Test 3: Settlement layer pay response
    // ============================================
    log('\n[Test 3] Settlement layer pay response', colors.blue)
    log('─────────────────────────────────────────', colors.blue)

    const senderKeyPair3 = await generateKeypair()
    const receiverKeyPair3 = await generateKeypair()

    const payRequest3 = await getPayRequest({
      receiverEncryptionPubKey: receiverKeyPair3.publicKey,
      sendingVaspPrivateKey: senderKeyPair3.privateKey,
      receivingCurrencyCode: 'USD',
      isAmountInReceivingCurrency: true,
      amount: 100,
      payerIdentifier: 'alice@vasp1.com',
      payerKycStatus: KycStatus.Verified,
      umaMajorVersion: 1,
      settlement: {
        layer: 'spark',
        assetIdentifier: 'btkn1...'
      }
    })

    const invoiceCreator = {
      createUmaInvoice: async () => {
        return 'lnbc1000n1pj9x3z0pp5'
      },

      createInvoiceForSettlementLayer: async () => {
        // assuming spark is the settlement layer
        return 'spark1000n1pj9x3z0pp5'
      }
    }

    const payReqResponse = await getPayReqResponseForSettlementLayer({
      request: payRequest3,
      invoiceCreator,
      metadata: '[["text/plain", "Pay to vasp2.com user $bob"]]',
      receivingCurrencyCode: 'USD',
      receivingCurrencyDecimals: 2,
      conversionRate: 1234,
      receiverFees: 50,
      receivingVaspPrivateKey: receiverKeyPair3.privateKey,
      payeeIdentifier: 'bob@vasp2.com'
    })

    assert(payReqResponse !== undefined, 'payReqResponse should be defined')
    assert(payReqResponse.converted !== undefined, 'converted field should be defined')
    assert(payReqResponse.converted.multiplier === 1234, 'multiplier should be 1234')
    assert(payReqResponse.converted.fee === 50, 'fee should be 50')
    assert(payReqResponse.converted.currencyCode === 'USD', 'currency code should be USD')
    assert(payReqResponse.pr === 'spark1000n1pj9x3z0pp5',
      'payment request should be spark invoice')

    log('   Pay Response:', colors.yellow)
    log(`   - Invoice: ${payReqResponse.pr}`, colors.yellow)
    log(`   - Currency: ${payReqResponse.converted.currencyCode}`, colors.yellow)
    log(`   - Multiplier: ${payReqResponse.converted.multiplier}`, colors.yellow)
    log(`   - Fee: ${payReqResponse.converted.fee}`, colors.yellow)

    const serialized3 = payReqResponse.toJsonString()
    const deserialized3 = PayReqResponse.fromJson(serialized3)
    assert(JSON.stringify(deserialized3.converted) === JSON.stringify(payReqResponse.converted),
      'Deserialized converted should equal original')
    log('   ✓ Serialization/deserialization works correctly', colors.yellow)

    // ============================================
    // Summary
    // ============================================
    log('\n════════════════════════════════════════════', colors.cyan)
    log('  ✓ All Tests Passed!', colors.green)
    log('════════════════════════════════════════════\n', colors.cyan)
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
