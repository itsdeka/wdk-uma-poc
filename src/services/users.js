const { UserModel } = require('../models/users')
const CHAIN_MAPPING = require('../../config/chain-mapping')

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
    this.model = new UserModel()
  }

  async getUserByUsername (username, includeDeleted = false) {
    return await this.model.findByUsername(username, includeDeleted)
  }

  async getUserByUsernameAndDomain (username, domainId, includeDeleted = false) {
    return await this.model.findByUsernameAndDomain(username, domainId, includeDeleted)
  }

  async getUserById (userId, includeDeleted = false) {
    const profile = await this.model.findById(userId, includeDeleted)
    if (!profile) return null
    const addrs = await this.model.findAllAddresses(userId)
    return {
      ...profile,
      addresses: addrs.reduce((acc, addr) => {
        acc[addr.chain_name] = addr
        return acc
      }, {})
    }
  }

  async getUsersByDomain (domainId, includeDeleted = false) {
    return await this.model.findByDomain(domainId, includeDeleted)
  }

  async getUsersByDomainWithAddresses (domainId) {
    const users = await this.getUsersByDomain(domainId)
    return await Promise.all(users.map(user => this.enrichUserWithAddresses(user)))
  }

  async createUser (options) {
    const { username, domainId, displayName, addresses, sparkPublicKey } = options

    if (!this.isValidUsername(username)) {
      throw new Error(
        'Invalid username format. Use lowercase letters, numbers, underscores, and hyphens. Length: 1-64 characters.'
      )
    }

    const existing = await this.getUserByUsernameAndDomain(username, domainId)
    if (existing) {
      throw new Error(`User "${username}" already exists in this domain`)
    }

    const userId = await this.model.insert({
      username: username.toLowerCase(),
      domain_id: domainId,
      display_name: displayName || username,
      spark_public_key: sparkPublicKey || null,
      is_active: true
    })

    if (addresses) {
      const addressInserts = []
      for (const [chainName, address] of Object.entries(addresses)) {
        if (!CHAIN_MAPPING[chainName]) throw new Error('Invalid chain ' + chainName)
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
      await this.model.insertAddresses(addressInserts)
    }

    await this.model.insertAuditLog({
      domain_id: domainId,
      action: 'user_created',
      actor_type: 'domain_admin',
      target_type: 'user',
      target_id: userId.toString(),
      details: JSON.stringify({ username, hasAddresses: !!addresses })
    })

    return await this.getUserById(userId)
  }

  async updateUser (userId, options) {
    const user = await this.getUserById(userId)
    if (!user) {
      throw new Error('User not found')
    }

    const updateData = {}

    if (options.displayName !== undefined) {
      updateData.display_name = options.displayName
    }

    if (options.addresses) {
      for (const [chainName, address] of Object.entries(options.addresses)) {
        if (address === null || address === '') {
          await this.model.deleteAddress(userId, chainName)
        } else {
          await this.model.upsertAddress(userId, chainName, address)
        }
      }
    }

    if (Object.keys(updateData).length > 0) {
      await this.model.update(userId, updateData)
    }

    await this.model.insertAuditLog({
      domain_id: user.domain_id,
      action: 'user_updated',
      actor_type: 'domain_admin',
      target_type: 'user',
      target_id: userId.toString(),
      details: JSON.stringify(options)
    })

    return await this.getUserById(userId)
  }

  async deleteUser (userId) {
    const user = await this.getUserById(userId)
    if (!user) {
      throw new Error('User not found')
    }

    const result = await this.model.softDelete(userId)

    if (result.modifiedCount === 0) {
      throw new Error('User not found or already deleted')
    }

    await this.model.insertAuditLog({
      domain_id: user.domain_id,
      action: 'user_deleted',
      actor_type: 'domain_admin',
      target_type: 'user',
      target_id: userId.toString(),
      details: JSON.stringify({ username: user.username })
    })
  }

  async deactivateUser (userId) {
    const user = await this.getUserById(userId)
    if (!user) {
      throw new Error('User not found')
    }

    await this.model.setActive(userId, false)

    await this.model.insertAuditLog({
      domain_id: user.domain_id,
      action: 'user_deactivated',
      actor_type: 'domain_admin',
      target_type: 'user',
      target_id: userId.toString(),
      details: JSON.stringify({ username: user.username })
    })
  }

  async activateUser (userId) {
    const user = await this.getUserById(userId)
    if (!user) {
      throw new Error('User not found')
    }

    await this.model.setActive(userId, true)

    await this.model.insertAuditLog({
      domain_id: user.domain_id,
      action: 'user_activated',
      actor_type: 'domain_admin',
      target_type: 'user',
      target_id: userId.toString(),
      details: JSON.stringify({ username: user.username })
    })
  }

  async getUserAddresses (userId) {
    return await this.model.findAddresses(userId)
  }

  async addUserAddress (userId, chainName, address) {
    const result = await this.model.upsertAddress(userId, chainName, address)
    return result.upsertedId || result.modifiedCount
  }

  async removeUserAddress (userId, chainName) {
    await this.model.deleteAddress(userId, chainName)
  }

  async getFormattedAddresses (userId) {
    const addresses = await this.getUserAddresses(userId)
    const formatted = {}

    for (const addr of addresses) {
      const chainId = CHAIN_MAPPING[addr.chain_name].chainId
      formatted[addr.chain_name] = {
        address: addr.address,
        ...(chainId && { chainId })
      }
    }

    return formatted
  }

  async enrichUserWithAddresses (user) {
    const addresses = user._id ? await this.getFormattedAddresses(user._id) : {}
    const settlementOptions = Object.keys(addresses).map(chain => {
      return CHAIN_MAPPING[chain].layer
    })
    return {
      ...user,
      addresses,
      settlementOptions
    }
  }

  isValidUsername (username) {
    const regex = /^[a-z0-9_-]{1,64}$/
    return regex.test(username.toLowerCase())
  }
}

const userService = new UserService()

module.exports = { userService, UserService }
