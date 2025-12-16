const { getDatabase } = require('../db/database')

class UserModel {
  async findByUsername (username, includeDeleted = false) {
    const db = await getDatabase()
    const filter = { username }
    if (!includeDeleted) {
      filter.is_deleted = { $ne: true }
    }
    return await db.collection('users').findOne(filter)
  }

  async findByUsernameAndDomain (username, domainId, includeDeleted = false) {
    const db = await getDatabase()
    const filter = {
      username,
      domain_id: domainId
    }
    if (!includeDeleted) {
      filter.is_deleted = { $ne: true }
    }
    return await db.collection('users').findOne(filter)
  }

  async findById (userId, includeDeleted = false) {
    const db = await getDatabase()
    const filter = { _id: userId }
    if (!includeDeleted) {
      filter.is_deleted = { $ne: true }
    }
    return await db.collection('users').findOne(filter)
  }

  async findByDomain (domainId, includeDeleted = false) {
    const db = await getDatabase()
    const filter = { domain_id: domainId, is_active: true }
    if (!includeDeleted) {
      filter.is_deleted = { $ne: true }
    }
    return await db.collection('users')
      .find(filter)
      .sort({ created_at: -1 })
      .toArray()
  }

  async insert (userData) {
    const db = await getDatabase()
    const result = await db.collection('users').insertOne({
      ...userData,
      created_at: new Date(),
      updated_at: new Date()
    })
    return result.insertedId
  }

  async update (userId, updateData) {
    const db = await getDatabase()
    return await db.collection('users').updateOne(
      { _id: userId },
      { $set: { ...updateData, updated_at: new Date() } }
    )
  }

  async softDelete (userId) {
    const db = await getDatabase()
    return await db.collection('users').updateOne(
      { _id: userId, is_deleted: { $ne: true } },
      {
        $set: {
          is_deleted: true,
          deleted_at: new Date(),
          updated_at: new Date()
        }
      }
    )
  }

  async setActive (userId, isActive) {
    const db = await getDatabase()
    return await db.collection('users').updateOne(
      { _id: userId },
      { $set: { is_active: isActive, updated_at: new Date() } }
    )
  }

  async findAddresses (userId) {
    const db = await getDatabase()
    return await db.collection('chain_addresses')
      .find({ user_id: userId, is_active: true })
      .toArray()
  }

  async findAllAddresses (userId) {
    const db = await getDatabase()
    return await db.collection('chain_addresses')
      .find({ user_id: userId })
      .toArray()
  }

  async upsertAddress (userId, chainName, address) {
    const db = await getDatabase()
    return await db.collection('chain_addresses').updateOne(
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

  async deleteAddress (userId, chainName) {
    const db = await getDatabase()
    return await db.collection('chain_addresses').deleteOne({
      user_id: userId,
      chain_name: chainName.toLowerCase()
    })
  }

  async insertAddresses (addresses) {
    if (addresses.length === 0) return
    const db = await getDatabase()
    return await db.collection('chain_addresses').insertMany(addresses)
  }

  async insertAuditLog (logEntry) {
    const db = await getDatabase()
    return await db.collection('audit_log').insertOne({
      ...logEntry,
      created_at: new Date()
    })
  }
}

const userModel = new UserModel()

module.exports = { userModel, UserModel }
