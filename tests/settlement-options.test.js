const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const test = require('brittle')
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

test('Settlement options in lnurlp response', async (t) => {
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

  t.ok(lnurlpResponse.settlementOptions !== undefined, 'settlementOptions should be defined')
  t.is(lnurlpResponse.settlementOptions.length, 2, 'settlementOptions should have 2 items')
  t.is(lnurlpResponse.settlementOptions[0].settlementLayer, 'spark', 'First settlement layer should be spark')
  t.is(lnurlpResponse.settlementOptions[0].assets.length, 1, 'First settlement option should have 1 asset')
  t.is(lnurlpResponse.settlementOptions[0].assets[0].identifier, 'btkn1...', 'First asset identifier should be btkn1...')

  // Verify multipliers compliance per UMA spec
  const sparkMultipliers = lnurlpResponse.settlementOptions[0].assets[0].multipliers
  t.ok(typeof sparkMultipliers === 'object' && sparkMultipliers !== null, 'multipliers should be an object')
  t.is(typeof sparkMultipliers.USD, 'number', 'multipliers.USD should be a number')
  t.ok(Number.isInteger(sparkMultipliers.USD), 'multipliers.USD should be an integer')
  t.is(sparkMultipliers.USD, 1234, 'multipliers.USD value should be 1234')
  t.is(typeof sparkMultipliers.PHP, 'number', 'multipliers.PHP should be a number')
  t.ok(Number.isInteger(sparkMultipliers.PHP), 'multipliers.PHP should be an integer')
  t.is(sparkMultipliers.PHP, 5678, 'multipliers.PHP value should be 5678')

  // Verify ln settlement option multipliers
  const lnMultipliers = lnurlpResponse.settlementOptions[1].assets[0].multipliers
  t.ok(typeof lnMultipliers === 'object' && lnMultipliers !== null, 'ln multipliers should be an object')
  t.is(typeof lnMultipliers.USD, 'number', 'ln multipliers.USD should be a number')
  t.ok(Number.isInteger(lnMultipliers.USD), 'ln multipliers.USD should be an integer')

  // Test serialization/deserialization
  const serialized = lnurlpResponse.toJsonString()
  const deserialized = LnurlpResponse.fromJson(serialized)
  t.is(JSON.stringify(deserialized.settlementOptions), JSON.stringify(settlementOptions), 'Deserialized settlementOptions should equal original')
})

test('Settlement info in pay request', async (t) => {
  const senderKeyPair = await generateKeypair()
  const receiverKeyPair = await generateKeypair()

  const payRequest = await getPayRequest({
    receiverEncryptionPubKey: receiverKeyPair.publicKey,
    sendingVaspPrivateKey: senderKeyPair.privateKey,
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

  t.ok(payRequest.settlement !== undefined, 'settlement should be defined')
  t.is(payRequest.settlement.layer, 'spark', 'settlement layer should be spark')
  t.is(payRequest.settlement.assetIdentifier, 'btkn1...', 'settlement asset identifier should be btkn1...')

  // Test serialization/deserialization
  const serialized = payRequest.toJsonString()
  const deserialized = PayRequest.fromJson(serialized)
  t.is(JSON.stringify(deserialized.settlement), JSON.stringify(payRequest.settlement), 'Deserialized settlement should equal original')
})

test('Settlement layer pay response', async (t) => {
  const senderKeyPair = await generateKeypair()
  const receiverKeyPair = await generateKeypair()

  const payRequest = await getPayRequest({
    receiverEncryptionPubKey: receiverKeyPair.publicKey,
    sendingVaspPrivateKey: senderKeyPair.privateKey,
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
    request: payRequest,
    invoiceCreator,
    metadata: '[["text/plain", "Pay to vasp2.com user $bob"]]',
    receivingCurrencyCode: 'USD',
    receivingCurrencyDecimals: 2,
    conversionRate: 1234,
    receiverFees: 50,
    receivingVaspPrivateKey: receiverKeyPair.privateKey,
    payeeIdentifier: 'bob@vasp2.com'
  })

  t.ok(payReqResponse !== undefined, 'payReqResponse should be defined')
  t.ok(payReqResponse.converted !== undefined, 'converted field should be defined')
  t.is(payReqResponse.converted.multiplier, 1234, 'multiplier should be 1234')
  t.is(payReqResponse.converted.fee, 50, 'fee should be 50')
  t.is(payReqResponse.converted.currencyCode, 'USD', 'currency code should be USD')
  t.is(payReqResponse.pr, 'spark1000n1pj9x3z0pp5', 'payment request should be spark invoice')

  // Test serialization/deserialization
  const serialized = payReqResponse.toJsonString()
  const deserialized = PayReqResponse.fromJson(serialized)
  t.is(JSON.stringify(deserialized.converted), JSON.stringify(payReqResponse.converted), 'Deserialized converted should equal original')
})
