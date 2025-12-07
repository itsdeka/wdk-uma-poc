const { getDatabase } = require('../db/database')

/**
 * @typedef {Object} CreateUserOptions
 * @property {string} username
 * @property {string} domainId
 * @property {string} [displayName]
 * @property {Object.<string, string>} [addresses]
 */

/**
 * @typedef {Object} UpdateUserOptions
 * @property {string} [displayName]
 * @property {Object.<string, string>} [addresses]
 */

/**
 * @typedef {Object} UserWithAddresses
 * @property {string} _id
 * @property {string} username
 * @property {string} domain_id
 * @property {string} [display_name]
 * @property {boolean} [is_active]
 * @property {string} [created_at]
 * @property {string} [updated_at]
 * @property {Object.<string, any>} addresses
 * @property {string[]} settlementOptions
 */

class UserService {
  constructor () {
    // Chain ID mapping for EVM chains
    this.chainIdMap = {
      ethereum: 1,
      polygon: 137,
      arbitrum: 42161,
      optimism: 10,
      base: 8453
    }
  }

  /**
   * Get user by username (legacy - searches all domains)
   * For multi-tenant usage, prefer getUserByUsernameAndDomain
   */
  async getUserByUsername (username) {
    const db = await getDatabase()
    return await db.collection('users').findOne({ username })
  }

  /**
   * Get user by username and domain ID (multi-tenant)
   */
  async getUserByUsernameAndDomain (username, domainId) {
    const db = await getDatabase()
    return await db.collection('users').findOne({
      username,
      domain_id: domainId
    })
  }

  /**
   * Get user by ID
   */
  async getUserById (userId) {
    const db = await getDatabase()
    return await db.collection('users').findOne({ _id: userId })
  }

  /**
   * Get all users for a domain
   */
  async getUsersByDomain (domainId) {
    const db = await getDatabase()
    return await db.collection('users')
      .find({ domain_id: domainId, is_active: true })
      .sort({ created_at: -1 })
      .toArray()
  }

  /**
   * Get all users for a domain with their addresses
   */
  async getUsersByDomainWithAddresses (domainId) {
    const users = await this.getUsersByDomain(domainId)
    return await Promise.all(users.map(user => this.enrichUserWithAddresses(user)))
  }

  /**
   * Create a new user (multi-tenant)
   */
  async createUser (options) {
    const { username, domainId, displayName, addresses, sparkPublicKey } = options

    // Validate username format
    if (!this.isValidUsername(username)) {
      throw new Error(
        'Invalid username format. Use lowercase letters, numbers, underscores, and hyphens. Length: 1-64 characters.'
      )
    }

    // Check if user already exists in this domain
    const existing = await this.getUserByUsernameAndDomain(username, domainId)
    if (existing) {
      throw new Error(`User "${username}" already exists in this domain`)
    }

    const db = await getDatabase()

    // Create user
    const userResult = await db.collection('users').insertOne({
      username: username.toLowerCase(),
      domain_id: domainId,
      display_name: displayName || username,
      spark_public_key: sparkPublicKey || null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    })

    const userId = userResult.insertedId

    // Add addresses if provided
    if (addresses) {
      const addressInserts = []
      for (const [chainName, address] of Object.entries(addresses)) {
        if (address && address.trim()) {
          addressInserts.push({
            user_id: userId,
            chain_name: chainName.toLowerCase(),
            address: address.trim(),
            is_active: true,
            created_at: new Date(),
            updated_at: new Date()
          })
        }
      }

      if (addressInserts.length > 0) {
        await db.collection('chain_addresses').insertMany(addressInserts)
      }
    }

    // Log audit event
    await db.collection('audit_log').insertOne({
      domain_id: domainId,
      action: 'user_created',
      actor_type: 'domain_admin',
      actor_id: null,
      target_type: 'user',
      target_id: userId.toString(),
      details: JSON.stringify({ username, hasAddresses: !!addresses }),
      ip_address: null,
      created_at: new Date()
    })

    return await this.getUserById(userId)
  }

  /**
   * Legacy createUser for backwards compatibility
   */
  async createUserLegacy (username, displayName) {
    const db = await getDatabase()
    const defaultDomain = await db.collection('domains').findOne({ is_default: true })
    if (!defaultDomain) {
      throw new Error('No default domain found')
    }

    const result = await this.createUser({
      username,
      domainId: defaultDomain._id,
      displayName: displayName || username
    })

    return result._id
  }

  /**
   * Update user details
   */
  async updateUser (userId, options) {
    const user = await this.getUserById(userId)
    if (!user) {
      throw new Error('User not found')
    }

    const db = await getDatabase()
    const updateData = { updated_at: new Date() }

    // Update display name if provided
    if (options.displayName !== undefined) {
      updateData.display_name = options.displayName
    }

    // Update addresses if provided
    if (options.addresses) {
      for (const [chainName, address] of Object.entries(options.addresses)) {
        if (address === null || address === '') {
          // Delete the address
          await db.collection('chain_addresses').deleteOne({
            user_id: userId,
            chain_name: chainName.toLowerCase()
          })
        } else {
          // Upsert the address
          await db.collection('chain_addresses').updateOne(
            { user_id: userId, chain_name: chainName.toLowerCase() },
            {
              $set: {
                address: address.trim(),
                is_active: true,
                updated_at: new Date()
              },
              $setOnInsert: {
                user_id: userId,
                chain_name: chainName.toLowerCase(),
                created_at: new Date()
              }
            },
            { upsert: true }
          )
        }
      }
    }

    await db.collection('users').updateOne({ _id: userId }, { $set: updateData })

    // Log audit event
    await db.collection('audit_log').insertOne({
      domain_id: user.domain_id,
      action: 'user_updated',
      actor_type: 'domain_admin',
      actor_id: null,
      target_type: 'user',
      target_id: userId.toString(),
      details: JSON.stringify(options),
      ip_address: null,
      created_at: new Date()
    })

    return await this.getUserById(userId)
  }

  /**
   * Delete a user
   */
  async deleteUser (userId) {
    const user = await this.getUserById(userId)
    if (!user) {
      throw new Error('User not found')
    }

    const db = await getDatabase()

    // Log audit event before deletion
    await db.collection('audit_log').insertOne({
      domain_id: user.domain_id,
      action: 'user_deleted',
      actor_type: 'domain_admin',
      actor_id: null,
      target_type: 'user',
      target_id: userId.toString(),
      details: JSON.stringify({ username: user.username }),
      ip_address: null,
      created_at: new Date()
    })

    await db.collection('users').deleteOne({ _id: userId })
  }

  /**
   * Soft delete a user (deactivate)
   */
  async deactivateUser (userId) {
    const user = await this.getUserById(userId)
    if (!user) {
      throw new Error('User not found')
    }

    const db = await getDatabase()

    await db.collection('users').updateOne(
      { _id: userId },
      { $set: { is_active: false, updated_at: new Date() } }
    )

    await db.collection('audit_log').insertOne({
      domain_id: user.domain_id,
      action: 'user_deactivated',
      actor_type: 'domain_admin',
      actor_id: null,
      target_type: 'user',
      target_id: userId.toString(),
      details: JSON.stringify({ username: user.username }),
      ip_address: null,
      created_at: new Date()
    })
  }

  /**
   * Reactivate a user
   */
  async activateUser (userId) {
    const user = await this.getUserById(userId)
    if (!user) {
      throw new Error('User not found')
    }

    const db = await getDatabase()

    await db.collection('users').updateOne(
      { _id: userId },
      { $set: { is_active: true, updated_at: new Date() } }
    )

    await db.collection('audit_log').insertOne({
      domain_id: user.domain_id,
      action: 'user_activated',
      actor_type: 'domain_admin',
      actor_id: null,
      target_type: 'user',
      target_id: userId.toString(),
      details: JSON.stringify({ username: user.username }),
      ip_address: null,
      created_at: new Date()
    })
  }

  /**
   * Get user's chain addresses
   */
  async getUserAddresses (userId) {
    const db = await getDatabase()
    return await db.collection('chain_addresses')
      .find({ user_id: userId, is_active: true })
      .toArray()
  }

  /**
   * Add or update a user address
   */
  async addUserAddress (userId, chainName, address) {
    const db = await getDatabase()
    const result = await db.collection('chain_addresses').updateOne(
      { user_id: userId, chain_name: chainName.toLowerCase() },
      {
        $set: {
          address: address.trim(),
          is_active: true,
          updated_at: new Date()
        },
        $setOnInsert: {
          user_id: userId,
          chain_name: chainName.toLowerCase(),
          created_at: new Date()
        }
      },
      { upsert: true }
    )
    return result.upsertedId || result.modifiedCount
  }

  /**
   * Remove a user address
   */
  async removeUserAddress (userId, chainName) {
    const db = await getDatabase()
    await db.collection('chain_addresses').deleteOne({
      user_id: userId,
      chain_name: chainName.toLowerCase()
    })
  }

  /**
   * Get formatted addresses with chain metadata
   */
  async getFormattedAddresses (userId) {
    const addresses = await this.getUserAddresses(userId)
    const formatted = {}

    for (const addr of addresses) {
      formatted[addr.chain_name] = {
        address: addr.address,
        ...(this.chainIdMap[addr.chain_name] && { chainId: this.chainIdMap[addr.chain_name] })
      }
    }

    return formatted
  }

  /**
   * Enrich user with addresses and settlement options
   */
  async enrichUserWithAddresses (user) {
    const addresses = user._id ? await this.getFormattedAddresses(user._id) : {}
    const settlementOptions = Object.keys(addresses).map(chain => {
      // Map chain names to settlement layer identifiers
      const layerMap = {
        spark: 'spark',
        lightning: 'ln',
        ethereum: 'ethereum',
        polygon: 'polygon',
        arbitrum: 'arbitrum',
        optimism: 'optimism',
        base: 'base',
        solana: 'solana'
      }
      return layerMap[chain] || chain
    })

    return {
      ...user,
      addresses,
      settlementOptions
    }
  }

  /**
   * Validate username format
   */
  isValidUsername (username) {
    // Lowercase letters, numbers, underscores, hyphens
    // Length: 1-64 characters
    const regex = /^[a-z0-9_-]{1,64}$/
    return regex.test(username.toLowerCase())
  }
}

const userService = new UserService()

module.exports = { userService, UserService }
