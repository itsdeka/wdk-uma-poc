const { DomainModel } = require('../models/domains')
const CURRENCIES = require('../../config/currencies')
const { VALID_DOMAIN_CURRENCIES } = require('../../config/currencies')

class DomainService {
  constructor () {
    this.model = new DomainModel()
  }

  async createDomain (options) {
    const { domain, ownerEmail, displayName, isDefault = false } = options

    const normalizedDomain = domain.toLowerCase()
      .replace(/\/+$/, '')
      .replace(/^www\./i, '')

    if (!normalizedDomain || normalizedDomain.length === 0) {
      throw new Error('Domain is required')
    }

    const existing = await this.getDomainByName(normalizedDomain)
    if (existing) {
      throw new Error(`Domain "${normalizedDomain}" already exists`)
    }

    const domainId = await this.model.insert({
      domain: normalizedDomain,
      owner_email: ownerEmail ? ownerEmail.toLowerCase() : null,
      display_name: displayName || normalizedDomain,
      is_active: true,
      is_default: isDefault,
      currency_settings: {
        BTC: {
          active: true,
          ...CURRENCIES.BTC.defaultLimits
        },
        USDT_POLYGON: {
          active: true,
          ...CURRENCIES.BTC.defaultLimits
        },
        USDT_SOLANA: {
          active: true,
          ...CURRENCIES.BTC.defaultLimits
        },
        USDT_TRON: {
          active: true,
          ...CURRENCIES.BTC.defaultLimits
        },
        USDT_ETH: {
          active: true,
          ...CURRENCIES.BTC.defaultLimits
        },
        USD: {
          active: true,
          ...CURRENCIES.BTC.defaultLimits
        }
      }
    })

    const createdDomain = await this.getDomainById(domainId)

    return {
      domain: createdDomain,
      message: `Domain "${normalizedDomain}" created successfully.`
    }
  }

  async getDomainById (id, includeDeleted = false) {
    return await this.model.findById(id, includeDeleted)
  }

  async getDomainByName (domain, includeDeleted = false) {
    const normalizedDomain = domain.toLowerCase().replace(/\/+$/, '')
    return await this.model.findByName(normalizedDomain, includeDeleted)
  }

  async updateDomain (id, updates) {
    const result = await this.model.update(id, updates)

    if (result.modifiedCount === 0) {
      throw new Error('Domain not found or no changes made')
    }

    return await this.getDomainById(id)
  }

  async deleteDomain (id) {
    const result = await this.model.softDelete(id)

    if (result.modifiedCount === 0) {
      throw new Error('Domain not found or already deleted')
    }

    await this.model.softDeleteUsersByDomain(id)

    return true
  }

  async getDefaultDomain () {
    return await this.model.findDefault()
  }

  async getAllDomains (includeDeleted = false) {
    return await this.model.findAll(includeDeleted)
  }

  async updateCurrencySettings (domainId, currencyCode, options) {
    if (!VALID_DOMAIN_CURRENCIES.includes(currencyCode)) {
      throw new Error(`Invalid currency code "${currencyCode}". Valid codes: ${VALID_DOMAIN_CURRENCIES.join(', ')}`)
    }

    const domain = await this.getDomainById(domainId)
    if (!domain) {
      throw new Error('Domain not found')
    }

    const currentSettings = domain.currency_settings?.[currencyCode] || {}
    const updatedSettings = { ...currentSettings }

    if (options.active !== undefined) {
      updatedSettings.active = Boolean(options.active)
    }

    if (options.minSendable !== undefined) {
      if (typeof options.minSendable !== 'number' || options.minSendable < 0) {
        throw new Error('minSendable must be a non-negative number')
      }
      updatedSettings.minSendable = options.minSendable
    }

    if (options.maxSendable !== undefined) {
      if (typeof options.maxSendable !== 'number' || options.maxSendable < 0) {
        throw new Error('maxSendable must be a non-negative number')
      }
      updatedSettings.maxSendable = options.maxSendable
    }

    if (updatedSettings.minSendable > updatedSettings.maxSendable) {
      throw new Error('minSendable cannot be greater than maxSendable')
    }

    const result = await this.model.updateCurrencySettings(domainId, currencyCode, updatedSettings)

    if (result.modifiedCount === 0) {
      throw new Error('Failed to update currency settings')
    }

    return await this.getDomainById(domainId)
  }
}

const domainService = new DomainService()

module.exports = { domainService, DomainService }
