/**
 * MarketRates service - fetches real-time prices from Bitfinex
 *
 * Uses Bitfinex REST API v2: https://docs.bitfinex.com/reference/rest-public-tickers
 *
 * In test mode (TEST_MODE=true), uses hardcoded values instead of fetching from API.
 */

const BITFINEX_API_BASE = 'https://api-pub.bitfinex.com/v2'

// Cache duration in milliseconds (30 seconds)
const CACHE_TTL_MS = 30000

// Hardcoded test values - used when TEST_MODE=true
const TEST_PRICES = {
  tBTCUSD: 100000, // $100,000 per BTC
  tETHUSD: 3500 // $3,500 per ETH
}

// Hardcoded test multipliers - used when TEST_MODE=true
const TEST_MULTIPLIERS = {
  USD: { USD: 10000 }, // ~$100k/BTC: 1 cent = 10,000 msats
  USDT: { USD: 10000 }, // 1 cent = 10,000 micro-USDT (6 decimals)
  BTC: { USD: 10000 } // ~$100k/BTC: 1 cent = 10,000 msats
}

class MarketRates {
  constructor () {
    this.cache = new Map()
    this.lastFetch = new Map()
  }

  /**
   * Check if running in test mode
   */
  isTestMode () {
    return process.env.TEST_MODE === 'true'
  }

  /**
   * Get ticker data from Bitfinex
   * Symbol format: tBTCUSD, tETHUSD, etc.
   * Response: [BID, BID_SIZE, ASK, ASK_SIZE, DAILY_CHANGE, DAILY_CHANGE_PERC, LAST_PRICE, VOLUME, HIGH, LOW]
   */
  async getTicker (symbol) {
    // In test mode, return hardcoded values
    if (this.isTestMode()) {
      const testPrice = TEST_PRICES[symbol]
      if (testPrice) {
        return {
          bid: testPrice,
          bidSize: 1,
          ask: testPrice,
          askSize: 1,
          dailyChange: 0,
          dailyChangePerc: 0,
          lastPrice: testPrice,
          volume: 1000,
          high: testPrice,
          low: testPrice
        }
      }
      throw new Error(`No test price configured for symbol: ${symbol}`)
    }

    const cacheKey = symbol
    const now = Date.now()

    // Check cache
    if (this.cache.has(cacheKey)) {
      const lastFetch = this.lastFetch.get(cacheKey) || 0
      if (now - lastFetch < CACHE_TTL_MS) {
        return this.cache.get(cacheKey)
      }
    }

    try {
      const response = await fetch(`${BITFINEX_API_BASE}/ticker/${symbol}`)

      if (!response.ok) {
        throw new Error(`Bitfinex API error: ${response.status}`)
      }

      const data = await response.json()

      // Bitfinex returns array: [BID, BID_SIZE, ASK, ASK_SIZE, DAILY_CHANGE, DAILY_CHANGE_PERC, LAST_PRICE, VOLUME, HIGH, LOW]
      const ticker = {
        bid: data[0],
        bidSize: data[1],
        ask: data[2],
        askSize: data[3],
        dailyChange: data[4],
        dailyChangePerc: data[5],
        lastPrice: data[6],
        volume: data[7],
        high: data[8],
        low: data[9]
      }

      // Update cache
      this.cache.set(cacheKey, ticker)
      this.lastFetch.set(cacheKey, now)

      return ticker
    } catch (error) {
      console.error(`Failed to fetch ticker for ${symbol}:`, error.message)

      // Return cached value if available, even if stale
      if (this.cache.has(cacheKey)) {
        console.warn(`Using stale cache for ${symbol}`)
        return this.cache.get(cacheKey)
      }

      throw error
    }
  }

  /**
   * Get BTC price in USD
   */
  async getBtcUsdPrice () {
    const ticker = await this.getTicker('tBTCUSD')
    return ticker.lastPrice
  }

  /**
   * Get ETH price in USD
   */
  async getEthUsdPrice () {
    const ticker = await this.getTicker('tETHUSD')
    return ticker.lastPrice
  }

  /**
   * Calculate UMA-compliant multipliers for a settlement asset
   *
   * Per UMA spec:
   * multipliers: "Estimated conversion rates from this asset to the currencies
   * supported by the receiver. The key is the currency code and the value is
   * the multiplier (how many of the smallest unit of this asset equals one
   * unit of the currency)."
   *
   * Note: "one unit of the currency" means the smallest unit (e.g., cents for USD)
   *
   * @param {string} asset - Settlement asset (BTC, USDT, etc.)
   * @param {string[]} currencies - Array of currency codes to calculate multipliers for (e.g., ['USD', 'EUR'])
   * @returns {Promise<Record<string, number>>} Multipliers by currency code
   */
  async calculateMultipliers (asset, currencies = ['USD']) {
    const multipliers = {}

    // In test mode, return hardcoded multipliers
    if (this.isTestMode()) {
      const testMultiplier = TEST_MULTIPLIERS[asset]
      if (testMultiplier) {
        return { ...testMultiplier }
      }
      return {}
    }

    for (const currency of currencies) {
      if (currency === 'USD') {
        if (asset === 'USDT') {
          // USDT has 6 decimals: 1 USDT = 1,000,000 micro-USDT
          // Assuming 1:1 USD peg: 1 USD cent = 0.01 USDT = 10,000 micro-USDT
          multipliers.USD = 10000
        } else if (asset === 'BTC') {
          // BTC in millisats: 1 BTC = 100,000,000 sats = 100,000,000,000 msats
          // Formula: msats per cent = msats_per_btc / cents_per_btc
          const btcPriceUsd = await this.getBtcUsdPrice()
          const centsPerBtc = btcPriceUsd * 100
          const msatsPerBtc = 100000000000 // 100 billion msats per BTC
          multipliers.USD = Math.round(msatsPerBtc / centsPerBtc)
        }
      }
      // Add support for other currencies here (EUR, GBP, etc.)
    }

    return multipliers
  }

  /**
   * Get multiple tickers at once
   * @param {string[]} symbols - Array of symbols (e.g., ['tBTCUSD', 'tETHUSD'])
   */
  async getTickers (symbols) {
    const symbolsParam = symbols.join(',')

    try {
      const response = await fetch(`${BITFINEX_API_BASE}/tickers?symbols=${symbolsParam}`)

      if (!response.ok) {
        throw new Error(`Bitfinex API error: ${response.status}`)
      }

      const data = await response.json()

      // Response is array of arrays, first element is symbol
      const tickers = {}
      for (const item of data) {
        const symbol = item[0]
        tickers[symbol] = {
          bid: item[1],
          bidSize: item[2],
          ask: item[3],
          askSize: item[4],
          dailyChange: item[5],
          dailyChangePerc: item[6],
          lastPrice: item[7],
          volume: item[8],
          high: item[9],
          low: item[10]
        }

        // Update cache
        this.cache.set(symbol, tickers[symbol])
        this.lastFetch.set(symbol, Date.now())
      }

      return tickers
    } catch (error) {
      console.error('Failed to fetch tickers:', error.message)
      throw error
    }
  }

  /**
   * Clear the cache
   */
  clearCache () {
    this.cache.clear()
    this.lastFetch.clear()
  }
}

// Singleton instance
const marketRates = new MarketRates()

module.exports = { marketRates, MarketRates }
