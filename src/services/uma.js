const { userService } = require('./users')
const { paymentService } = require('./payments')
const { domainService } = require('./domains')
const { marketRates } = require('./market-rates')
const { SparkWallet } = require('@buildonspark/spark-sdk')
const CHAIN_MAPPING = require('../../config/chain-mapping')
const CURRENCIES = require('../../config/currencies')

/**
 * @typedef {Object} UmaLookupContext
 * @property {Object} domain
 * @property {string} baseUrl
 */

class UmaService {
  #sparkWallet = null
  #isInitializing = false

  /**
   * Convert chain addresses to UMA-compliant settlement options
   * Creates identifiers like USDT_POLYGON, USDT_SOLANA, etc.
   *
   * Per UMA spec (Settlement.d.ts):
   * - multipliers: "Estimated conversion rates from this asset to the currencies supported by
   *   the receiver. The key is the currency code and the value is the multiplier
   *   (how many of the smallest unit of this asset equals one unit of the currency)."
   *
   * @param {Object} chains - User's chain addresses
   * @param {string[]} currencies - List of currency codes the user accepts (e.g., ['USD', 'EUR'])
   */
  async buildSettlementOptions (chains, currencies) {
    const settlementOptions = []

    for (const [chainName, chainData] of Object.entries(chains)) {
      const mapping = CHAIN_MAPPING[chainName.toLowerCase()]
      if (!mapping) {
        console.warn(`Unknown chain: ${chainName}, skipping...`)
        continue
      }

      const { layer, asset } = mapping

      const identifier =
        layer === 'spark' ? chainData.address || chainData : `${asset}_${layer.toUpperCase()}`

      const multipliers = await marketRates.calculateMultipliers(asset, currencies)

      settlementOptions.push({
        settlementLayer: layer,
        assets: [
          {
            identifier,
            multipliers
          }
        ]
      })
    }

    return settlementOptions
  }

  /**
   * Build currencies array from domain settings and config
   * Combines base currency info from config/currencies.js with domain-specific settings
   */
  async buildCurrencies (currencySettings) {
    const currencies = []

    if (!currencySettings) {
      return currencies
    }

    for (const [code, settings] of Object.entries(currencySettings)) {
      if (!settings.active) {
        continue
      }

      const baseConfig = CURRENCIES[code]
      if (!baseConfig) {
        console.warn(`Unknown currency code: ${code}, skipping...`)
        continue
      }

      // For currencies, we calculate how many msats (BTC smallest unit) equal one smallest unit of this currency
      // calculateMultipliers(asset, currencies) - asset is what we're settling in (BTC), currencies is what we want multipliers for
      const multipliers = await marketRates.calculateMultipliers('BTC', [code])
      const multiplier = multipliers[code]

      if (!multiplier) {
        console.warn(`No multiplier available for ${code}, skipping...`)
        continue
      }

      currencies.push({
        code: baseConfig.code,
        name: baseConfig.name,
        symbol: baseConfig.symbol,
        decimals: baseConfig.decimals,
        convertible: {
          min: settings.minSendable,
          max: settings.maxSendable
        },
        multiplier
      })
    }

    return currencies
  }

  /**
   * Initialize Spark Wallet (lazy initialization)
   */
  async initializeSparkWallet () {
    if (this.sparkWallet) {
      return this.sparkWallet
    }

    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      return this.sparkWallet
    }

    try {
      this.isInitializing = true
      const sparkSeed = process.env.SPARK_SEED
      if (!sparkSeed) {
        throw new Error('SPARK_SEED environment variable is not set')
      }
      const { wallet } = await SparkWallet.initialize({ mnemonicOrSeed: sparkSeed })
      this.sparkWallet = wallet
      console.log('✓ Spark Wallet initialized successfully')
      return this.sparkWallet
    } catch (error) {
      console.error('Failed to initialize Spark Wallet:', error)
      throw error
    } finally {
      this.isInitializing = false
    }
  }

  /**
   * Resolve the base URL for a domain
   * In multi-tenant mode, uses the domain name
   * In single-tenant mode, uses BASE_URL environment variable
   */
  getBaseUrlForDomain (domain) {
    // If domain is the default domain and BASE_URL is set, use BASE_URL
    if (domain.is_default && process.env.BASE_URL) {
      return process.env.BASE_URL
    }

    // Otherwise, construct URL from domain name
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
    return `${protocol}://${domain.domain}`
  }

  /**
   * Generate UMA lookup response (first call - no amount)
   * Multi-tenant aware: looks up user in the specified domain
   */
  async generateLookupResponse (username, domain) {
    const user = await userService.getUserByUsernameAndDomain(username, domain._id)
    if (!user) {
      return null
    }

    const chains = user._id ? await userService.getFormattedAddresses(user._id) : {}

    // Get active currency codes from domain settings
    const activeCurrencyCodes = Object.entries(domain.currency_settings || {})
      .filter(([_, settings]) => settings.active)
      .map(([code]) => code)

    const settlementOptions = await this.buildSettlementOptions(chains, activeCurrencyCodes)
    const currencies = await this.buildCurrencies(domain.currency_settings)
    const btcSettings = domain.currency_settings.BTC

    const payerData = {
      name: { mandatory: false },
      email: { mandatory: false },
      identifier: { mandatory: false },
      compliance: { mandatory: false }
    }

    const baseUrl = this.getBaseUrlForDomain(domain)

    const response = {
      tag: 'payRequest',
      callback: `${baseUrl}/.well-known/lnurlp/${username}`,
      minSendable: btcSettings.minSendable,
      maxSendable: btcSettings.maxSendable,
      metadata: JSON.stringify([
        ['text/plain', `Pay to ${user.display_name || username}`],
        ['text/identifier', `${username}@${domain.domain}`]
      ]),
      commentAllowed: 255,
      currencies,
      payerData,
      umaVersion: '1.0',
      settlementOptions: settlementOptions.length > 0 ? settlementOptions : undefined
    }

    return response
  }

  /**
   * Legacy lookup (for backwards compatibility with single-domain mode)
   */
  async generateLookupResponseLegacy (username, baseUrl) {
    const defaultDomain = domainService.getDefaultDomain()
    if (!defaultDomain) {
      return null
    }
    return this.generateLookupResponse(username, defaultDomain)
  }

  /**
   * Generate UMA pay response (second call - with amount)
   * Multi-tenant aware
   */
  async generatePayResponse (username, domain, amountMsats, nonce, currency, settlementLayer, assetIdentifier) {
    // Find user in the specified domain
    const user = await userService.getUserByUsernameAndDomain(username, domain._id)
    if (!user || !user._id) {
      return null
    }

    // Get user's multi-chain addresses
    const userAddresses = await userService.getUserAddresses(user._id)

    // Check if nonce already exists (replay attack prevention)
    const existingPayment = await paymentService.getPaymentRequestByNonce(nonce)
    if (existingPayment) {
      console.warn(`Duplicate payment request with nonce: ${nonce}`)
      throw new Error('DUPLICATE_NONCE')
    }

    // Determine the payment request field (pr) based on settlement layer
    let paymentRequest

    if (settlementLayer && settlementLayer !== 'ln' && settlementLayer !== 'spark') {
      // For non-Lightning settlement layers
      const selectedAddress = userAddresses.find(
        addr => addr.chain_name.toLowerCase() === settlementLayer.toLowerCase()
      )

      if (!selectedAddress) {
        throw new Error(`Address not found for settlement layer: ${settlementLayer}`)
      }

      paymentRequest = selectedAddress.address
      console.log(`Payment request using ${settlementLayer} address: ${paymentRequest}`)
    } else {
      // For Lightning or Spark - use user's Spark public key if available
      if (!user.spark_public_key) {
        throw new Error('Lightning payments require a Spark public key to be configured for this user')
      }

      paymentRequest = await this.generateLightningInvoice(
        amountMsats,
        username,
        user.spark_public_key
      )
    }

    // Store payment request
    const paymentId = await paymentService.createPaymentRequest(
      user._id,
      nonce,
      amountMsats,
      currency,
      settlementLayer,
      assetIdentifier,
      paymentRequest
    )

    if (paymentId === null) {
      console.error(`Failed to create payment request for nonce: ${nonce}`)
      throw new Error('DUPLICATE_NONCE')
    }

    // Build settlement info
    let settlementInfo
    if (settlementLayer && assetIdentifier) {
      settlementInfo = {
        layer: settlementLayer,
        assetIdentifier
      }
      console.log(`Payment request using settlement: ${assetIdentifier} on ${settlementLayer}`)
    }

    // Calculate converted field per UMA spec
    // Formula: invoiceAmount = (amount × multiplier) + fee
    // Solving for amount: amount = (invoiceAmount - fee) / multiplier
    const receiverFees = 0 // No receiver fees for now
    const currencyCode = currency || 'USD'
    const decimals = currencyCode === 'USD' ? 2 : 2 // Default to 2 decimals

    // Determine the settlement asset based on settlement layer
    const asset = (!settlementLayer || settlementLayer === 'ln' || settlementLayer === 'spark')
      ? 'BTC'
      : 'USDT'

    // Get multiplier for the asset - how many smallest units of asset per smallest unit of currency
    const multipliers = await marketRates.calculateMultipliers(asset, [currencyCode])
    const multiplier = multipliers[currencyCode] 
    // Calculate amount in currency units (e.g., cents)
    // amount = (invoiceAmount - fee) / multiplier
    const amountInCurrencyUnits = Math.round((amountMsats - receiverFees) / multiplier)

    const response = {
      pr: paymentRequest,
      routes: [],
      settlement: settlementInfo,
      converted: {
        amount: amountInCurrencyUnits,
        currencyCode,
        decimals,
        multiplier,
        fee: receiverFees
      },
      disposable: false,
      successAction: {
        tag: 'message',
        message: `Payment received! Thank you for paying ${user.display_name || username}.`
      }
    }

    return response
  }

  /**
   * Legacy pay response (for backwards compatibility)
   */
  async generatePayResponseLegacy (username, amountMsats, nonce, currency, settlementLayer, assetIdentifier) {
    const defaultDomain = domainService.getDefaultDomain()
    if (!defaultDomain) {
      return null
    }
    return this.generatePayResponse(
      username,
      defaultDomain,
      amountMsats,
      nonce,
      currency,
      settlementLayer,
      assetIdentifier
    )
  }

  /**
   * Generate Lightning invoice using Spark SDK
   */
  async generateLightningInvoice (amountMsats, description, receiverSparkPubkey) {
    // Remove 0x prefix if present
    if (receiverSparkPubkey && receiverSparkPubkey.startsWith('0x')) {
      receiverSparkPubkey = receiverSparkPubkey.slice(2)
    }

    try {
      const wallet = await this.initializeSparkWallet()

      const lightningReceiveRequest = await wallet.createLightningInvoice({
        amountSats: amountMsats,
        memo: `Payment to ${description}`,
        includeSparkAddress: true,
        ...(receiverSparkPubkey && { receiverIdentityPubkey: receiverSparkPubkey })
      })

      return lightningReceiveRequest.invoice.encodedInvoice
    } catch (error) {
      console.error('Error creating Spark invoice:', error)
      throw error
    }
  }
}

// Singleton instance
const umaService = new UmaService()

// Factory function for backwards compatibility
const createUmaService = (baseUrl) => umaService

module.exports = { umaService, createUmaService, UmaService }
