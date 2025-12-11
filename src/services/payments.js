const { getDatabase } = require('../db/database')

class PaymentService {
  /**
   * Create a payment request with full settlement information
   */
  async createPaymentRequest (
    userId,
    nonce,
    amountMsats,
    currency,
    settlementLayer,
    assetIdentifier,
    invoiceOrAddress,
    expiresInSeconds = 3600
  ) {
    try {
      const db = await getDatabase()
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000)

      const result = await db.collection('payment_requests').insertOne({
        user_id: userId,
        nonce,
        amount_msats: amountMsats,
        currency,
        settlement_layer: settlementLayer,
        asset_identifier: assetIdentifier,
        invoice_or_address: invoiceOrAddress,
        status: 'pending',
        created_at: new Date(),
        expires_at: expiresAt
      })

      return result.insertedId
    } catch (error) {
      if (error.code === 11000 && error.keyPattern && error.keyPattern.nonce) {
        console.warn(`Duplicate nonce detected: ${nonce}`)
        return null
      }
      throw error
    }
  }

  /**
   * Get payment request by nonce
   */
  async getPaymentRequestByNonce (nonce) {
    const db = await getDatabase()
    return await db.collection('payment_requests').findOne({ nonce })
  }

  /**
   * Get payment requests for a user
   */
  async getPaymentRequestsByUserId (userId) {
    const db = await getDatabase()
    return await db.collection('payment_requests')
      .find({ user_id: userId })
      .sort({ created_at: -1 })
      .limit(100)
      .toArray()
  }

  /**
   * Update payment request status
   */
  async updatePaymentStatus (paymentId, status) {
    const db = await getDatabase()
    await db.collection('payment_requests').updateOne(
      { _id: paymentId },
      { $set: { status } }
    )
  }

  /**
   * Check if a payment request has expired
   */
  isPaymentExpired (payment) {
    if (!payment.expires_at) {
      return false
    }
    return new Date(payment.expires_at) < new Date()
  }
}

const paymentService = new PaymentService()

module.exports = { paymentService, PaymentService }
