const { userService } = require('./users')
const { paymentService } = require('./payments')
const { domainService } = require('./domains')
const { SparkWallet } = require('@buildonspark/spark-sdk')

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
   */
  buildSettlementOptions (chains) {
    const settlementOptions = []

    // Map of chain names (from database) to settlement layers and default assets
    const chainMapping = {
      spark: { layer: 'spark', asset: 'BTC' },
      lightning: { layer: 'ln', asset: 'BTC' },
      ethereum: { layer: 'ethereum', asset: 'USDT' },
      polygon: { layer: 'polygon', asset: 'USDT' },
      arbitrum: { layer: 'arbitrum', asset: 'USDT' },
      optimism: { layer: 'optimism', asset: 'USDT' },
      base: { layer: 'base', asset: 'USDT' },
      solana: { layer: 'solana', asset: 'USDT' },
      plasma: { layer: 'plasma', asset: 'USDT' }
    }

    for (const [chainName, chainData] of Object.entries(chains)) {
      const mapping = chainMapping[chainName.toLowerCase()]
      if (!mapping) {
        console.warn(`Unknown chain: ${chainName}, skipping...`)
        continue
      }

      const { layer, asset } = mapping

      // For Spark, use the pubkey as identifier
      // For other chains, use ASSET_CHAIN format
      const identifier =
        layer === 'spark' ? chainData.address || chainData : `${asset}_${layer.toUpperCase()}`

      // Calculate multipliers based on asset type
      const multipliers = {}

      if (asset === 'USDT') {
        // USDT has 6 decimals: 1 USDT = 1,000,000 micro-USDT
        multipliers.USD = 10000 // micro-USDT per cent
        multipliers.SAT = 1000 // micro-USDT per sat
      } else if (asset === 'BTC') {
        // BTC in millisats: 1 BTC = 100,000,000,000 msats
        multipliers.USD = 10000 // msats per cent (at $100k/BTC)
        multipliers.SAT = 1000 // msats per sat
      }

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
    // Find user in the specified domain
    const user = await userService.getUserByUsernameAndDomain(username, domain._id)
    if (!user) {
      return null
    }

    // Get user's multi-chain addresses
    const chains = user._id ? await userService.getFormattedAddresses(user._id) : {}

    // Convert to UMA-compliant settlement options
    const settlementOptions = this.buildSettlementOptions(chains)

    // Define supported currencies
    const currencies = [
      {
        code: 'USD',
        name: 'US Dollar',
        symbol: '$',
        decimals: 2,
        minSendable: 1,
        maxSendable: 100000,
        multiplier: 10000
      }
    ]

    // Define payer data requirements
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
      minSendable: 1000,
      maxSendable: 100000000,
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

    const response = {
      pr: paymentRequest,
      routes: [],
      settlement: settlementInfo,
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
