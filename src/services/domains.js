const { getDatabase } = require('../db/database')

class DomainService {
  /**
   * Create a new domain
   */
  async createDomain (options) {
    const { domain, ownerEmail, displayName, isDefault = false } = options

    // Normalize domain (lowercase, no trailing slash)
    const normalizedDomain = domain.toLowerCase().replace(/\/+$/, '')

    // Basic validation
    if (!normalizedDomain || normalizedDomain.length === 0) {
      throw new Error('Domain is required')
    }

    // Check if domain already exists
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
      updated_at: new Date()
    })

    const domainId = result.insertedId
    const createdDomain = await this.getDomainById(domainId)

    return {
      domain: createdDomain,
      message: `Domain "${normalizedDomain}" created successfully.`
    }
  }

  /**
   * Get domain by ID
   */
  async getDomainById (id) {
    const db = await getDatabase()
    return await db.collection('domains').findOne({ _id: id })
  }

  /**
   * Get domain by domain name
   */
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

  /**
   * Delete domain
   */
  async deleteDomain (id) {
    const db = await getDatabase()

    // Delete domain
    await db.collection('domains').deleteOne({ _id: id })

    // Delete all users for this domain
    await db.collection('users').deleteMany({ domain_id: id })

    // Delete all chain addresses for users in this domain
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

  /**
   * Get default domain (for backwards compatibility)
   */
  async getDefaultDomain () {
    const db = await getDatabase()
    return await db.collection('domains').findOne({ is_default: true, is_active: true })
  }

  /**
   * List all domains
   */
  async getAllDomains () {
    const db = await getDatabase()
    return await db.collection('domains').find({}).sort({ created_at: -1 }).toArray()
  }
}

const domainService = new DomainService()

module.exports = { domainService, DomainService }
