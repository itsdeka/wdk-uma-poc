const { getDatabase } = require('../db/database')
const CURRENCIES = require('../../config/currencies')

class DomainService {

  async createDomain (options) {
    const { domain, ownerEmail, displayName, isDefault = false } = options

    const normalizedDomain = domain.toLowerCase()
    .replace(/\/+$/, '')
    .replace(/^www\./i)  // remove www. if it exists

    if (!normalizedDomain || normalizedDomain.length === 0) {
      throw new Error('Domain is required')
    }

    const existing = await this.getDomainByName(normalizedDomain)
    if (existing) {
      throw new Error(`Domain "${normalizedDomain}" already exists`)
    }

    const db = await getDatabase()

    const result = await db.collection('domains').insertOne({
      domain: normalizedDomain,
      owner_email: ownerEmail ? ownerEmail.toLowerCase() : null,
      display_name: displayName || normalizedDomain,
      is_active: true,
      is_default: isDefault,
      created_at: new Date(),
      updated_at: new Date(), 
      currency_settings : {
        BTC : {
          active: true,
          ...CURRENCIES.BTC.defaultLimits
        },
        USDT_POLYGON : {
          active:true,
          ...CURRENCIES.BTC.defaultLimits
        },
        USDT_SOLANA : {
          active:true,
          ...CURRENCIES.BTC.defaultLimits
        },
        USDT_TRON : {
          active:true,
          ...CURRENCIES.BTC.defaultLimits
        },
        USDT_ETH : {
          active:true,
          ...CURRENCIES.BTC.defaultLimits
        },
        USD : {
          active:true,
          ...CURRENCIES.BTC.defaultLimits
        }
      },
    })

    const domainId = result.insertedId
    const createdDomain = await this.getDomainById(domainId)

    return {
      domain: createdDomain,
      message: `Domain "${normalizedDomain}" created successfully.`
    }
  }

  async getDomainById (id) {
    const db = await getDatabase()
    return await db.collection('domains').findOne({ _id: id })
  }

  async getDomainByName (domain) {
    const normalizedDomain = domain.toLowerCase().replace(/\/+$/, '')
    const db = await getDatabase()
    return await db.collection('domains').findOne({ domain: normalizedDomain })
  }

  /**
   * Update domain
   */
  async updateDomain (id, updates) {
    const db = await getDatabase()

    const result = await db.collection('domains').updateOne(
      { _id: id },
      {
        $set: {
          ...updates,
          updated_at: new Date()
        }
      }
    )

    if (result.modifiedCount === 0) {
      throw new Error('Domain not found or no changes made')
    }

    return await this.getDomainById(id)
  }

  async deleteDomain (id) {
    const db = await getDatabase()

    await db.collection('domains').deleteOne({ _id: id })
    await db.collection('users').deleteMany({ domain_id: id })
    const users = await db.collection('users').find({ domain_id: id }).toArray()
    const userIds = users.map(u => u._id)

    if (userIds.length > 0) {
      await db.collection('chain_addresses').deleteMany({
        user_id: { $in: userIds }
      })

      await db.collection('payment_requests').deleteMany({
        user_id: { $in: userIds }
      })
    }

    return true
  }

  async getDefaultDomain () {
    const db = await getDatabase()
    return await db.collection('domains').findOne({ is_default: true, is_active: true })
  }

  async getAllDomains () {
    const db = await getDatabase()
    return await db.collection('domains').find({}).sort({ created_at: -1 }).toArray()
  }
}

const domainService = new DomainService()

module.exports = { domainService, DomainService }
