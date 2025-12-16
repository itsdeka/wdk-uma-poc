const { getDatabase } = require('../db/database')

class DomainModel {
  async findById (id, includeDeleted = false) {
    const db = await getDatabase()
    const filter = { _id: id }
    if (!includeDeleted) {
      filter.is_deleted = { $ne: true }
    }
    return await db.collection('domains').findOne(filter)
  }

  async findByName (domain, includeDeleted = false) {
    const db = await getDatabase()
    const filter = { domain }
    if (!includeDeleted) {
      filter.is_deleted = { $ne: true }
    }
    return await db.collection('domains').findOne(filter)
  }

  async findDefault () {
    const db = await getDatabase()
    return await db.collection('domains').findOne({
      is_default: true,
      is_active: true,
      is_deleted: { $ne: true }
    })
  }

  async findAll (includeDeleted = false) {
    const db = await getDatabase()
    const filter = includeDeleted ? {} : { is_deleted: { $ne: true } }
    return await db.collection('domains').find(filter).sort({ created_at: -1 }).toArray()
  }

  async insert (domainData) {
    const db = await getDatabase()
    const result = await db.collection('domains').insertOne({
      ...domainData,
      created_at: new Date(),
      updated_at: new Date()
    })
    return result.insertedId
  }

  async update (id, updateData) {
    const db = await getDatabase()
    return await db.collection('domains').updateOne(
      { _id: id },
      {
        $set: {
          ...updateData,
          updated_at: new Date()
        }
      }
    )
  }

  async softDelete (id) {
    const db = await getDatabase()
    return await db.collection('domains').updateOne(
      { _id: id, is_deleted: { $ne: true } },
      {
        $set: {
          is_deleted: true,
          deleted_at: new Date(),
          updated_at: new Date()
        }
      }
    )
  }

  async softDeleteUsersByDomain (domainId) {
    const db = await getDatabase()
    return await db.collection('users').updateMany(
      { domain_id: domainId, is_deleted: { $ne: true } },
      {
        $set: {
          is_deleted: true,
          deleted_at: new Date(),
          updated_at: new Date()
        }
      }
    )
  }

  async updateCurrencySettings (id, currencyCode, settings) {
    const db = await getDatabase()
    return await db.collection('domains').updateOne(
      { _id: id, is_deleted: { $ne: true } },
      {
        $set: {
          [`currency_settings.${currencyCode}`]: settings,
          updated_at: new Date()
        }
      }
    )
  }
}

const domainModel = new DomainModel()

module.exports = { domainModel, DomainModel }
