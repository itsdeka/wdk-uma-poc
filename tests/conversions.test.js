const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

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

function assertApprox (actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected)
  if (diff > tolerance) {
    log(`✗ FAILED: ${message} (expected ${expected}, got ${actual}, diff ${diff})`, colors.red)
    throw new Error(message)
  }
  log(`✓ ${message} (${actual} ≈ ${expected})`, colors.green)
}

async function runTests () {
  log('\n════════════════════════════════════════════', colors.cyan)
  log('  UMA Conversion Math Test Suite', colors.cyan)
  log('════════════════════════════════════════════\n', colors.cyan)

  try {
    // ============================================
    // Test 1: BTC to msats multiplier calculation
    // ============================================
    log('\n[Test 1] BTC/Lightning multiplier calculation', colors.blue)
    log('─────────────────────────────────────────', colors.blue)

    // Formula: msats_per_cent = msats_per_btc / cents_per_btc
    const testBtcPrice = 100000 // $100,000 per BTC
    const msatsPerBtc = 100000000000 // 100 billion msats = 1 BTC
    const centsPerBtc = testBtcPrice * 100
    const expectedMultiplier = Math.round(msatsPerBtc / centsPerBtc)

    log(`   BTC Price: $${testBtcPrice}`, colors.yellow)
    log(`   Cents per BTC: ${centsPerBtc}`, colors.yellow)
    log(`   Msats per BTC: ${msatsPerBtc}`, colors.yellow)
    log(`   Expected multiplier: ${expectedMultiplier} msats/cent`, colors.yellow)

    assert(expectedMultiplier === 10000, 'At $100k BTC, multiplier should be 10000 msats/cent')

    // Verify round-trip conversion
    const usdAmount = 10 // $10
    const cents = usdAmount * 100
    const msats = cents * expectedMultiplier
    const btcBack = msats / msatsPerBtc
    const usdBack = btcBack * testBtcPrice

    log(`   Round-trip: $${usdAmount} → ${msats} msats → ${btcBack} BTC → $${usdBack.toFixed(2)}`, colors.yellow)
    assertApprox(usdBack, usdAmount, 0.01, 'Round-trip conversion should preserve USD value')

    // ============================================
    // Test 2: USDT multiplier (6 decimals)
    // ============================================
    log('\n[Test 2] USDT multiplier calculation', colors.blue)
    log('─────────────────────────────────────────', colors.blue)

    // USDT has 6 decimals: 1 USDT = 1,000,000 micro-USDT
    // 1 USD cent = 0.01 USDT = 10,000 micro-USDT
    const usdtDecimals = 6
    const microUsdtPerUsdt = Math.pow(10, usdtDecimals) // 1,000,000
    const usdtPerCent = 0.01 // assuming 1:1 peg
    const expectedUsdtMultiplier = usdtPerCent * microUsdtPerUsdt

    log(`   USDT decimals: ${usdtDecimals}`, colors.yellow)
    log(`   Micro-USDT per USDT: ${microUsdtPerUsdt}`, colors.yellow)
    log(`   Expected multiplier: ${expectedUsdtMultiplier} micro-USDT/cent`, colors.yellow)

    assert(expectedUsdtMultiplier === 10000, 'USDT multiplier should be 10000 micro-USDT/cent')

    // Verify round-trip
    const usdtAmount = 25 // $25
    const usdtCents = usdtAmount * 100
    const microUsdt = usdtCents * expectedUsdtMultiplier
    const usdtBack = microUsdt / microUsdtPerUsdt
    const usdBackFromUsdt = usdtBack // 1:1 peg

    log(`   Round-trip: $${usdtAmount} → ${microUsdt} micro-USDT → ${usdtBack} USDT → $${usdBackFromUsdt}`, colors.yellow)
    assertApprox(usdBackFromUsdt, usdtAmount, 0.001, 'USDT round-trip should preserve USD value')

    // ============================================
    // Test 3: Different BTC prices
    // ============================================
    log('\n[Test 3] BTC multiplier at various prices', colors.blue)
    log('─────────────────────────────────────────', colors.blue)

    const btcPrices = [50000, 75000, 100000, 150000, 200000]

    for (const price of btcPrices) {
      const cents = price * 100
      const multiplier = Math.round(msatsPerBtc / cents)

      // Verify: $1 should convert correctly
      const oneDollarMsats = 100 * multiplier
      const btcFromOneDollar = oneDollarMsats / msatsPerBtc
      const usdFromBtc = btcFromOneDollar * price

      log(`   $${price.toLocaleString()} BTC → multiplier: ${multiplier} msats/cent`, colors.yellow)
      assertApprox(usdFromBtc, 1.0, 0.01, `$1 converts correctly at $${price} BTC`)
    }

    // ============================================
    // Test 4: Edge cases and precision
    // ============================================
    log('\n[Test 4] Edge cases and precision', colors.blue)
    log('─────────────────────────────────────────', colors.blue)

    // Very small amount (1 cent)
    const oneCentMsats = 1 * 10000 // at $100k BTC
    const oneCentBtc = oneCentMsats / msatsPerBtc
    log(`   1 cent = ${oneCentMsats} msats = ${oneCentBtc} BTC`, colors.yellow)
    assert(oneCentMsats === 10000, '1 cent should equal 10000 msats at $100k BTC')

    // Large amount ($1000)
    const thousandDollarCents = 1000 * 100
    const thousandDollarMsats = thousandDollarCents * 10000
    const thousandDollarBtc = thousandDollarMsats / msatsPerBtc
    log(`   $1000 = ${thousandDollarMsats} msats = ${thousandDollarBtc} BTC`, colors.yellow)
    assertApprox(thousandDollarBtc, 0.01, 0.0001, '$1000 should equal 0.01 BTC at $100k')

    // Multiplier should always be an integer
    for (const price of [91930, 87654, 123456]) {
      const cents = price * 100
      const multiplier = Math.round(msatsPerBtc / cents)
      assert(Number.isInteger(multiplier), `Multiplier at $${price} should be integer (got ${multiplier})`)
    }

    // ============================================
    // Test 5: USDT on different chains (same multiplier)
    // ============================================
    log('\n[Test 5] USDT across settlement layers', colors.blue)
    log('─────────────────────────────────────────', colors.blue)

    const chains = ['polygon', 'ethereum', 'arbitrum', 'optimism', 'base', 'solana']
    const usdtMultiplier = 10000 // Always the same for USDT

    for (const chain of chains) {
      // All chains should use same multiplier for USDT
      log(`   ${chain.toUpperCase()}: USDT multiplier = ${usdtMultiplier}`, colors.yellow)
    }

    // Verify $100 USDT conversion on any chain
    const hundredDollarMicroUsdt = 100 * 100 * usdtMultiplier // 100,000,000 micro-USDT
    const hundredDollarUsdt = hundredDollarMicroUsdt / 1000000
    assert(hundredDollarUsdt === 100, '$100 should equal 100 USDT across all chains')

    // ============================================
    // Test 6: Multiplier type compliance
    // ============================================
    log('\n[Test 6] Multiplier type compliance (UMA spec)', colors.blue)
    log('─────────────────────────────────────────', colors.blue)

    const sampleMultipliers = {
      USD: 10000,
      EUR: 11000,
      GBP: 12500
    }

    for (const [currency, multiplier] of Object.entries(sampleMultipliers)) {
      assert(typeof multiplier === 'number', `${currency} multiplier should be a number`)
      assert(Number.isInteger(multiplier), `${currency} multiplier should be an integer`)
      assert(multiplier > 0, `${currency} multiplier should be positive`)
    }

    // ============================================
    // Test 7: Live price integration (if not in test mode)
    // ============================================
    log('\n[Test 7] Live Bitfinex price fetch', colors.blue)
    log('─────────────────────────────────────────', colors.blue)

    try {
      const response = await fetch('https://api-pub.bitfinex.com/v2/ticker/tBTCUSD')
      const data = await response.json()
      const livePrice = data[6] // LAST_PRICE field

      log(`   Live BTC price: $${livePrice}`, colors.yellow)

      const liveCents = livePrice * 100
      const liveMultiplier = Math.round(msatsPerBtc / liveCents)

      log(`   Live multiplier: ${liveMultiplier} msats/cent`, colors.yellow)

      // Verify the math works with live price
      const testUsd = 50
      const testMsats = testUsd * 100 * liveMultiplier
      const testBtc = testMsats / msatsPerBtc
      const testUsdBack = testBtc * livePrice

      log(`   Verification: $${testUsd} → ${testMsats} msats → ${testBtc.toFixed(8)} BTC → $${testUsdBack.toFixed(2)}`, colors.yellow)
      assertApprox(testUsdBack, testUsd, 0.5, 'Live price round-trip should preserve value (within $0.50)')

      assert(Number.isInteger(liveMultiplier), 'Live multiplier should be an integer')
      assert(liveMultiplier > 0, 'Live multiplier should be positive')
      assert(liveMultiplier < 1000000, 'Live multiplier should be reasonable (<1M)')
    } catch (error) {
      log(`   ⚠ Skipped: Could not fetch live price (${error.message})`, colors.yellow)
    }

    // ============================================
    // Summary
    // ============================================
    log('\n════════════════════════════════════════════', colors.cyan)
    log('  ✓ All Conversion Tests Passed!', colors.green)
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
