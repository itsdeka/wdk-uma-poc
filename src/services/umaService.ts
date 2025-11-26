import { userService } from './userService';
import { paymentService } from './paymentService';
import { SparkWallet } from '@buildonspark/spark-sdk';
import type { 
  SettlementOption,
  SettlementInfo
} from '@uma-sdk/core';


export class UmaService {
  private baseUrl: string;
  private sparkWallet: any = null;
  private isInitializing: boolean = false;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Convert chain addresses to UMA-compliant settlement options
   * Creates identifiers like USDT_POLYGON, USDT_SOLANA, etc.
   */
  private buildSettlementOptions(chains: Record<string, any>): SettlementOption[] {
    const settlementOptions: SettlementOption[] = [];
    
    // Map of chain names (from database) to settlement layers and default assets
    const chainMapping: Record<string, { layer: string; asset: string }> = {
      'spark': { layer: 'spark', asset: 'BTC' },
      'lightning': { layer: 'ln', asset: 'BTC' },
      'ethereum': { layer: 'ethereum', asset: 'USDT' },
      'polygon': { layer: 'polygon', asset: 'USDT' },
      'arbitrum': { layer: 'arbitrum', asset: 'USDT' },
      'optimism': { layer: 'optimism', asset: 'USDT' },
      'base': { layer: 'base', asset: 'USDT' },
      'solana': { layer: 'solana', asset: 'USDT' },
      // Add testnet support if needed:
      // 'solana-testnet': { layer: 'solana-testnet', asset: 'USDT' },
    };

    for (const [chainName, chainData] of Object.entries(chains)) {
      const mapping = chainMapping[chainName.toLowerCase()];
      if (!mapping) {
        console.warn(`Unknown chain: ${chainName}, skipping...`);
        continue;
      }

      const { layer, asset } = mapping;
      
      // For Spark, use the pubkey as identifier
      // For other chains, use ASSET_CHAIN format
      const identifier = layer === 'spark' 
        ? chainData.address || chainData
        : `${asset}_${layer.toUpperCase()}`;

      // Calculate multipliers based on asset type
      // Multiplier = smallest_unit_of_settlement_asset / smallest_unit_of_target_currency
      let multipliers: Record<string, number> = {};
      
      if (asset === 'USDT') {
        // USDT has 6 decimals: 1 USDT = 1,000,000 micro-USDT
        // USD smallest unit = 1 cent
        // 1 USDT = 1 USD (approx), so 1 cent = 10,000 micro-USDT
        multipliers.USD = 10000; // micro-USDT per cent
        
        // Assuming 1 BTC = $100,000, 1 sat = $0.001 = 0.001 USDT
        // 1 sat = 1,000 micro-USDT
        multipliers.SAT = 1000; // micro-USDT per sat
      } else if (asset === 'BTC') {
        // BTC in millisats: 1 BTC = 100,000,000,000 msats
        // Spark and Lightning use msats as smallest unit
        // Assuming 1 BTC = $100,000: 1 cent = 10,000 msats
        multipliers.USD = 10000; // msats per cent (at $100k/BTC)
        
        // 1 sat = 1,000 msats
        multipliers.SAT = 1000; // msats per sat
      }

      settlementOptions.push({
        settlementLayer: layer,
        assets: [
          {
            identifier,
            multipliers,
          },
        ],
      });
    }

    return settlementOptions;
  }

  /**
   * Initialize Spark Wallet (lazy initialization)
   */
  private async initializeSparkWallet() {
    if (this.sparkWallet) {
      return this.sparkWallet;
    }

    if (this.isInitializing) {
      // Wait for initialization to complete
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return this.sparkWallet;
    }

    try {
      this.isInitializing = true;
      const sparkSeed = process.env.SPARK_SEED;
      if (!sparkSeed) {
        throw new Error('SPARK_SEED environment variable is not set');
      }
      const { wallet } = await SparkWallet.initialize({ mnemonicOrSeed: sparkSeed });
      this.sparkWallet = wallet;
      console.log('✓ Spark Wallet initialized successfully');
      return this.sparkWallet;
    } catch (error) {
      console.error('Failed to initialize Spark Wallet:', error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Generate UMA lookup response (first call - no amount)
   * Fully compliant with LnurlpResponse from @uma-sdk/core
   */
  generateLookupResponse(username: string) {
    const user = userService.getUserByUsername(username);
    if (!user) {
      return null;
    }

    // Get user's multi-chain addresses
    const chains = user.id ? userService.getFormattedAddresses(user.id) : {};
    
    // Convert to UMA-compliant settlement options
    const settlementOptions = this.buildSettlementOptions(chains);

    // Define supported currencies (plain objects)
    const currencies = [
      {
        code: 'USD',
        name: 'US Dollar',
        symbol: '$',
        decimals: 2, // USD has 2 decimal places (cents)
        minSendable: 1, // 1 cent minimum
        maxSendable: 100000, // $1000 max
        multiplier: 10000, // Lightning: 10,000 msats per cent (assumes ~$100k/BTC)
      },
    ];

    // Define payer data requirements (plain object)
    const payerData = {
      name: { mandatory: false },
      email: { mandatory: false },
      identifier: { mandatory: false },
      compliance: { mandatory: false },
    };

    const response = {
      tag: 'payRequest' as const,
      callback: `${this.baseUrl}/.well-known/lnurlp/${username}`,
      minSendable: 1000, // 1 sat in msats
      maxSendable: 100000000, // 100,000 sats (0.001 BTC) in msats
      metadata: JSON.stringify([
        ['text/plain', `Pay to ${user.display_name || username}`],
        ['text/identifier', `${username}@${new URL(this.baseUrl).host}`],
      ]),
      commentAllowed: 255,
      currencies,
      payerData,
      umaVersion: '1.0',
      // Settlement options for multi-chain support with proper identifiers (UMA-compliant)
      settlementOptions: settlementOptions.length > 0 ? settlementOptions : undefined,
    };

    return response;
  }

  /**
   * Generate UMA pay response (second call - with amount)
   * Fully compliant with PayReqResponse from @uma-sdk/core
   * 
   * @param settlementLayer - The settlement layer chosen by sender (e.g., "ln", "spark", "polygon")
   * @param assetIdentifier - The asset identifier chosen by sender (e.g., "USDT_POLYGON", "BTC")
   */
  async generatePayResponse(
    username: string,
    amountMsats: number,
    nonce: string,
    currency?: string,
    settlementLayer?: string,
    assetIdentifier?: string
  ) {
    const user = userService.getUserByUsername(username);
    if (!user || !user.id) {
      return null;
    }

    // Get user's multi-chain addresses
    const chains = userService.getFormattedAddresses(user.id);
    
    // Convert to UMA-compliant settlement options
    const settlementOptions = this.buildSettlementOptions(chains);

    // Get user's Spark identity pubkey if available
    const userAddresses = userService.getUserAddresses(user.id);
    const sparkAddress = userAddresses.find(addr => addr.chain_name === 'spark');

    // Check if nonce already exists (replay attack prevention)
    const existingPayment = paymentService.getPaymentRequestByNonce(nonce);
    if (existingPayment) {
      console.warn(`Duplicate payment request with nonce: ${nonce}`);
      throw new Error('DUPLICATE_NONCE');
    }

    // Determine the payment request field (pr) based on settlement layer
    let paymentRequest: string;
    
    if (settlementLayer && settlementLayer !== 'ln' && settlementLayer !== 'spark') {
      // For non-Lightning settlement layers (e.g., polygon, ethereum, solana)
      // Use the wallet address as the payment request
      const selectedAddress = userAddresses.find(
        addr => addr.chain_name.toLowerCase() === settlementLayer.toLowerCase()
      );
      
      if (!selectedAddress) {
        throw new Error(`Address not found for settlement layer: ${settlementLayer}`);
      }
      
      paymentRequest = selectedAddress.address;
      console.log(`Payment request using ${settlementLayer} address: ${paymentRequest}`);
    } else {
      // For Lightning or Spark, generate Lightning invoice with embedded Spark address
      paymentRequest = await this.generateLightningInvoice(
        amountMsats, 
        username,
        sparkAddress?.address
      );
    }

    // Store payment request
    const paymentId = paymentService.createPaymentRequest(
      user.id,
      nonce,
      amountMsats,
      currency,
      paymentRequest
    );

    // If payment creation failed (duplicate nonce), throw error
    if (paymentId === null) {
      console.error(`Failed to create payment request for nonce: ${nonce}`);
      throw new Error('DUPLICATE_NONCE');
    }

    // Build settlement info if sender specified their choice
    let settlementInfo: SettlementInfo | undefined;
    if (settlementLayer && assetIdentifier) {
      settlementInfo = {
        layer: settlementLayer,
        assetIdentifier: assetIdentifier,
      };
      console.log(`Payment request using settlement: ${assetIdentifier} on ${settlementLayer}`);
    }

    const response = {
      pr: paymentRequest,
      routes: [],
      // Settlement options with proper identifiers (USDT_POLYGON, USDT_SOLANA, etc)
      settlementOptions: settlementOptions.length > 0 ? settlementOptions : undefined,
      // Include settlement info if sender specified their choice (UMA-compliant)
      settlement: settlementInfo,
      disposable: false,
      successAction: {
        tag: 'message' as const,
        message: `Payment received! Thank you for paying ${user.display_name || username}.`,
      },
    };

    return response;
  }

  /**
   * Generate Lightning invoice using Spark SDK
   * Embeds Spark address in the invoice for Spark-to-Spark transfers
   * 
   * @param amountMsats - Amount in millisatoshis
   * @param description - Payment description
   * @param receiverSparkPubkey - Optional 33-byte compressed Spark identity pubkey
   */
  private async generateLightningInvoice(
    amountMsats: number,
    description: string,
    receiverSparkPubkey?: string
  ): Promise<string> {
    try {
      // Initialize Spark Wallet if not already initialized
      const wallet = await this.initializeSparkWallet();

      // Create Lightning invoice with Spark address embedded
      // The includeSparkAddress parameter embeds a 36-byte string (SPK:identitypubkey)
      // in the fallback address field of the bolt11 invoice
      const lightningReceiveRequest = await wallet.createLightningInvoice({
        amountSats: amountMsats,
        memo: `Payment to ${description}`,
        // Embed Spark address in the invoice fallback field
        // Format: SPK:identitypubkey (36 bytes total)
        includeSparkAddress: true,
        // If generating invoice for another Spark user, pass their pubkey
        // Otherwise, backend will use the current wallet's identity
        ...(receiverSparkPubkey && { receiverIdentityPubkey: receiverSparkPubkey }),
      });

      return lightningReceiveRequest.invoice.encodedInvoice;
    } catch (error) {
      console.error('Error creating Spark invoice:', error);
      throw error;
    }
  }
}

export const createUmaService = (baseUrl: string) => new UmaService(baseUrl);

