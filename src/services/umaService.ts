import { userService } from './userService';
import { paymentService } from './paymentService';
import { SparkWallet } from '@buildonspark/spark-sdk';

export interface UmaLookupResponse {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  currencies: any[];
  payerData: any;
  umaVersion: string;
  commentAllowed: number;
  payeeData?: {
    chains: Record<string, any>;
  };
}

export interface UmaPayResponse {
  pr: string;
  routes: any[];
  payeeData: {
    chains: Record<string, any>;
  };
  disposable: boolean;
  successAction: {
    tag: string;
    message: string;
  };
}

export class UmaService {
  private baseUrl: string;
  private sparkWallet: any = null;
  private isInitializing: boolean = false;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
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
      const { wallet } = await SparkWallet.initialize(process.env.SPARK_SEED);
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
   */
  generateLookupResponse(username: string): UmaLookupResponse | null {
    const user = userService.getUserByUsername(username);
    if (!user) {
      return null;
    }

    // Get user's multi-chain addresses
    const chains = user.id ? userService.getFormattedAddresses(user.id) : {};

    return {
      callback: `${this.baseUrl}/.well-known/lnurlp/${username}`,
      maxSendable: 100000000, // 100,000 sats (0.001 BTC)
      minSendable: 1000, // 1 sat
      metadata: JSON.stringify([
        ['text/plain', `Pay to ${user.display_name || username}`],
      ]),
      currencies: [
        {
          code: 'USD',
          name: 'US Dollar',
          symbol: '$',
          decimals: 2,
          minSendable: 0.01,
          maxSendable: 1000,
        },
      ],
      payerData: {
        name: { mandatory: false },
        email: { mandatory: false },
      },
      umaVersion: '1.0',
      commentAllowed: 255,
      payeeData: {
        chains,
      },
    };
  }

  /**
   * Generate UMA pay response (second call - with amount)
   */
  async generatePayResponse(
    username: string,
    amountMsats: number,
    nonce: string,
    currency?: string
  ): Promise<UmaPayResponse | null> {
    const user = userService.getUserByUsername(username);
    if (!user || !user.id) {
      return null;
    }

    // Get user's multi-chain addresses
    const chains = userService.getFormattedAddresses(user.id);

    // Get user's Spark identity pubkey if available
    const userAddresses = userService.getUserAddresses(user.id);
    const sparkAddress = userAddresses.find(addr => addr.chain_name === 'spark');

    // Generate Lightning invoice with embedded Spark address
    const invoice = await this.generateLightningInvoice(
      amountMsats, 
      username,
      sparkAddress?.address
    );

    // Store payment request
    paymentService.createPaymentRequest(
      user.id,
      nonce,
      amountMsats,
      currency,
      invoice
    );

    return {
      pr: invoice,
      routes: [],
      payeeData: {
        chains,
      },
      disposable: false,
      successAction: {
        tag: 'message',
        message: `Payment received! Thank you for paying ${user.display_name || username}.`,
      },
    };
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

