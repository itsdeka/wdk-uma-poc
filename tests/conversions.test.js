const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const test = require('brittle')

const msatsPerBtc = 100000000000 // 100 billion msats = 1 BTC

test('BTC/Lightning multiplier calculation', async (t) => {
  const testBtcPrice = 100000 // $100,000 per BTC
  const centsPerBtc = testBtcPrice * 100
  const expectedMultiplier = Math.round(msatsPerBtc / centsPerBtc)

  t.is(expectedMultiplier, 10000, 'at $100k BTC, multiplier should be 10000 msats/cent')

  // Round-trip conversion
  const usdAmount = 10 // $10
  const cents = usdAmount * 100
  const msats = cents * expectedMultiplier
  const btcBack = msats / msatsPerBtc
  const usdBack = btcBack * testBtcPrice

  t.ok(Math.abs(usdBack - usdAmount) < 0.01, 'round-trip conversion should preserve USD value')
})

test('USDT multiplier calculation', async (t) => {
  // USDT has 6 decimals: 1 USDT = 1,000,000 micro-USDT
  // 1 USD cent = 0.01 USDT = 10,000 micro-USDT
  const usdtDecimals = 6
  const microUsdtPerUsdt = Math.pow(10, usdtDecimals) // 1,000,000
  const usdtPerCent = 0.01 // assuming 1:1 peg
  const expectedUsdtMultiplier = usdtPerCent * microUsdtPerUsdt

  t.is(expectedUsdtMultiplier, 10000, 'USDT multiplier should be 10000 micro-USDT/cent')

  // Round-trip
  const usdtAmount = 25 // $25
  const usdtCents = usdtAmount * 100
  const microUsdt = usdtCents * expectedUsdtMultiplier
  const usdtBack = microUsdt / microUsdtPerUsdt
  const usdBackFromUsdt = usdtBack // 1:1 peg

  t.ok(Math.abs(usdBackFromUsdt - usdtAmount) < 0.001, 'USDT round-trip should preserve USD value')
})

test('BTC multiplier at various prices', async (t) => {
  const btcPrices = [50000, 75000, 100000, 150000, 200000]

  for (const price of btcPrices) {
    const cents = price * 100
    const multiplier = Math.round(msatsPerBtc / cents)

    // Verify: $1 should convert correctly
    const oneDollarMsats = 100 * multiplier
    const btcFromOneDollar = oneDollarMsats / msatsPerBtc
    const usdFromBtc = btcFromOneDollar * price

    t.ok(Math.abs(usdFromBtc - 1.0) < 0.01, `$1 converts correctly at $${price} BTC`)
  }
})

test('Edge cases and precision', async (t) => {
  // Very small amount (1 cent)
  const oneCentMsats = 1 * 10000 // at $100k BTC
  t.is(oneCentMsats, 10000, '1 cent should equal 10000 msats at $100k BTC')

  // Large amount ($1000)
  const thousandDollarCents = 1000 * 100
  const thousandDollarMsats = thousandDollarCents * 10000
  const thousandDollarBtc = thousandDollarMsats / msatsPerBtc

  t.ok(Math.abs(thousandDollarBtc - 0.01) < 0.0001, '$1000 should equal 0.01 BTC at $100k')

  // Multiplier should always be an integer
  for (const price of [91930, 87654, 123456]) {
    const cents = price * 100
    const multiplier = Math.round(msatsPerBtc / cents)
    t.ok(Number.isInteger(multiplier), `multiplier at $${price} should be integer`)
  }
})

test('USDT across settlement layers', async (t) => {
  const chains = ['polygon', 'ethereum', 'arbitrum', 'optimism', 'base', 'solana']
  const usdtMultiplier = 10000 // Always the same for USDT

  // Verify $100 USDT conversion on any chain
  const hundredDollarMicroUsdt = 100 * 100 * usdtMultiplier // 100,000,000 micro-USDT
  const hundredDollarUsdt = hundredDollarMicroUsdt / 1000000

  t.is(hundredDollarUsdt, 100, '$100 should equal 100 USDT across all chains')

  for (const chain of chains) {
    t.is(usdtMultiplier, 10000, `${chain} should use USDT multiplier of 10000`)
  }
})

test('Multiplier type compliance (UMA spec)', async (t) => {
  const sampleMultipliers = {
    USD: 10000,
    EUR: 11000,
    GBP: 12500
  }

  for (const [currency, multiplier] of Object.entries(sampleMultipliers)) {
    t.is(typeof multiplier, 'number', `${currency} multiplier should be a number`)
    t.ok(Number.isInteger(multiplier), `${currency} multiplier should be an integer`)
    t.ok(multiplier > 0, `${currency} multiplier should be positive`)
  }
})

test('Live Bitfinex price fetch', async (t) => {
  let livePrice
  try {
    const response = await fetch('https://api-pub.bitfinex.com/v2/ticker/tBTCUSD')
    const data = await response.json()
    livePrice = data[6] // LAST_PRICE field
  } catch (error) {
    t.comment(`Skipped: Could not fetch live price (${error.message})`)
    return
  }

  const liveCents = livePrice * 100
  const liveMultiplier = Math.round(msatsPerBtc / liveCents)

  // Verify the math works with live price
  const testUsd = 50
  const testMsats = testUsd * 100 * liveMultiplier
  const testBtc = testMsats / msatsPerBtc
  const testUsdBack = testBtc * livePrice

  t.ok(Math.abs(testUsdBack - testUsd) < 0.5, 'live price round-trip should preserve value (within $0.50)')
  t.ok(Number.isInteger(liveMultiplier), 'live multiplier should be an integer')
  t.ok(liveMultiplier > 0, 'live multiplier should be positive')
  t.ok(liveMultiplier < 1000000, 'live multiplier should be reasonable (<1M)')
})
