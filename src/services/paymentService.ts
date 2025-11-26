import { paymentQueries, PaymentRequest } from '../db/database';

export class PaymentService {
  createPaymentRequest(
    userId: number,
    nonce: string,
    amountMsats: number,
    currency?: string,
    invoice?: string
  ): number | null {
    try {
      const result = paymentQueries.create.run(
        userId,
        nonce,
        amountMsats,
        currency,
        invoice
      );
      return result.lastInsertRowid as number;
    } catch (error: any) {
      // Check if it's a duplicate nonce error
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        console.warn(`Duplicate nonce detected: ${nonce}`);
        return null;
      }
      // Re-throw other errors
      throw error;
    }
  }

  getPaymentRequestByNonce(nonce: string): PaymentRequest | undefined {
    return paymentQueries.findByNonce.get(nonce) as PaymentRequest | undefined;
  }
}

export const paymentService = new PaymentService();

