const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const { test } = require('brittle')
const { initializeDatabase, closeDatabase } = require('../src/db/database')
const { domainService } = require('../src/services/domains')

test('createDomain creates new domain successfully', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `test${Date.now()}.com`
    const testEmail = `admin@${testDomain}`

    const result = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: testEmail,
      isDefault: false
    })

    t.ok(result.domain, 'Domain should be created')
    t.is(result.domain.domain, testDomain, 'Domain name should match')
    t.is(result.domain.owner_email, testEmail, 'Owner email should match')
    t.ok(result.domain._id, 'Domain should have an ID')

    t.pass('Domain created successfully')
  } catch (error) {
    t.fail(`Domain creation failed: ${error.message}`)
  }
})

test('createDomain prevents duplicate domains', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `duplicate${Date.now()}.com`
    const testEmail = `admin@${testDomain}`

    // Create first domain
    await domainService.createDomain({
      domain: testDomain,
      ownerEmail: testEmail,
      isDefault: false
    })

    // Try to create duplicate
    try {
      await domainService.createDomain({
        domain: testDomain,
        ownerEmail: 'different@example.com',
        isDefault: false
      })
      t.fail('Should not allow duplicate domain creation')
    } catch (error) {
      t.ok(error.message.includes('already exists'), 'Should throw duplicate domain error')
    }

    t.pass('Duplicate domain prevention works')
  } catch (error) {
    t.fail(`Duplicate domain test failed: ${error.message}`)
  }
})

test('getDomainById retrieves domain correctly', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `getid${Date.now()}.com`
    const testEmail = `admin@${testDomain}`

    const createResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: testEmail,
      isDefault: false
    })

    const retrieved = await domainService.getDomainById(createResult.domain._id)

    t.ok(retrieved, 'Domain should be retrieved')
    t.is(retrieved._id.toString(), createResult.domain._id.toString(), 'IDs should match')
    t.is(retrieved.domain, testDomain, 'Domain name should match')

    t.pass('Domain retrieval by ID works')
  } catch (error) {
    t.fail(`Domain retrieval by ID failed: ${error.message}`)
  }
})

test('getDomainByName retrieves domain correctly', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `getname${Date.now()}.com`
    const testEmail = `admin@${testDomain}`

    await domainService.createDomain({
      domain: testDomain,
      ownerEmail: testEmail,
      isDefault: false
    })

    const retrieved = await domainService.getDomainByName(testDomain)

    t.ok(retrieved, 'Domain should be retrieved by name')
    t.is(retrieved.domain, testDomain, 'Domain name should match')
    t.is(retrieved.owner_email, testEmail, 'Owner email should match')

    t.pass('Domain retrieval by name works')
  } catch (error) {
    t.fail(`Domain retrieval by name failed: ${error.message}`)
  }
})

test('getDomainByName returns null for non-existent domain', async (t) => {
  try {
    await initializeDatabase()

    const retrieved = await domainService.getDomainByName('nonexistent.domain')

    t.is(retrieved, null, 'Should return null for non-existent domain')

    t.pass('Non-existent domain handling works')
  } catch (error) {
    t.fail(`Non-existent domain test failed: ${error.message}`)
  }
})

test('updateDomain updates domain successfully', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `update${Date.now()}.com`
    const testEmail = `admin@${testDomain}`

    const createResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: testEmail,
      isDefault: false
    })

    const newEmail = `updated@${testDomain}`
    const updated = await domainService.updateDomain(createResult.domain._id, {
      owner_email: newEmail
    })

    t.ok(updated, 'Domain should be updated')
    t.is(updated.owner_email, newEmail, 'Email should be updated')
    t.ok(updated.updated_at, 'Updated timestamp should be set')

    t.pass('Domain update works')
  } catch (error) {
    t.fail(`Domain update failed: ${error.message}`)
  }
})

test('updateDomain throws error for non-existent domain', async (t) => {
  try {
    await initializeDatabase()

    const fakeId = '507f1f77bcf86cd799439011' // Valid ObjectId format but doesn't exist

    try {
      await domainService.updateDomain(fakeId, { owner_email: 'test@example.com' })
      t.fail('Should throw error for non-existent domain')
    } catch (error) {
      t.ok(error.message.includes('Domain not found'), 'Should throw domain not found error')
    }

    t.pass('Non-existent domain update handling works')
  } catch (error) {
    t.fail(`Non-existent domain update test failed: ${error.message}`)
  }
})

test('deleteDomain removes domain successfully', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `delete${Date.now()}.com`
    const testEmail = `admin@${testDomain}`

    const createResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: testEmail,
      isDefault: false
    })

    await domainService.deleteDomain(createResult.domain._id)

    const retrieved = await domainService.getDomainById(createResult.domain._id)
    t.is(retrieved, null, 'Domain should be deleted')

    t.pass('Domain deletion works')
  } catch (error) {
    t.fail(`Domain deletion failed: ${error.message}`)
  }
})

test('getDefaultDomain returns a default domain or null', async (t) => {
  try {
    await initializeDatabase()

    const defaultDomain = await domainService.getDefaultDomain()

    // Either null or a valid default domain
    if (defaultDomain) {
      t.is(defaultDomain.is_default, true, 'If returned, should have is_default flag set')
      t.is(defaultDomain.is_active, true, 'If returned, should be active')
    } else {
      t.is(defaultDomain, null, 'Should return null when no default domain exists')
    }

    t.pass('Default domain handling works')
  } catch (error) {
    t.fail(`Default domain test failed: ${error.message}`)
  }
})

test('getDefaultDomain returns default domain when one is created', async (t) => {
  try {
    await initializeDatabase()

    // Create a unique default domain
    const defaultDomainName = `testdefault${Date.now()}.com`
    const createResult = await domainService.createDomain({
      domain: defaultDomainName,
      ownerEmail: `admin@${defaultDomainName}`,
      isDefault: true
    })

    const defaultDomain = await domainService.getDefaultDomain()

    t.ok(defaultDomain, 'Should return a default domain')
    t.is(defaultDomain.is_default, true, 'Should have is_default flag set')
    t.is(defaultDomain.is_active, true, 'Should be active')

    // Clean up - delete the test domain
    await domainService.deleteDomain(createResult.domain._id)

    t.pass('Default domain retrieval works')
  } catch (error) {
    t.fail(`Default domain retrieval test failed: ${error.message}`)
  }
})

test('createDomain validates domain parameter', async (t) => {
  try {
    await initializeDatabase()

    try {
      await domainService.createDomain({
        domain: '',
        ownerEmail: 'admin@example.com',
        isDefault: false
      })
      t.fail('Should require domain parameter')
    } catch (error) {
      t.ok(error.message.includes('Domain is required'), 'Should throw domain required error')
    }

    t.pass('Domain parameter validation works')
  } catch (error) {
    t.fail(`Domain validation test failed: ${error.message}`)
  }
})

test('listDomains returns all domains', async (t) => {
  try {
    await initializeDatabase()

    // Create a few test domains
    const domains = []
    for (let i = 0; i < 3; i++) {
      const testDomain = `list${Date.now()}_${i}.com`
      const testEmail = `admin@${testDomain}`

      const result = await domainService.createDomain({
        domain: testDomain,
        ownerEmail: testEmail,
        isDefault: false
      })
      domains.push(result.domain)
    }

    const allDomains = await domainService.getAllDomains()

    t.ok(allDomains.length >= 3, 'Should return at least the created domains')
    t.ok(Array.isArray(allDomains), 'Should return an array')

    // Check that our domains are in the list
    const domainIds = allDomains.map(d => d._id.toString())
    for (const domain of domains) {
      t.ok(domainIds.includes(domain._id.toString()), 'Created domain should be in the list')
    }

    t.pass('Domain listing works')
  } catch (error) {
    t.fail(`Domain listing failed: ${error.message}`)
  }
})

test('updateCurrencySettings updates active status successfully', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `currency${Date.now()}.com`
    const createResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const updated = await domainService.updateCurrencySettings(
      createResult.domain._id,
      'BTC',
      { active: false }
    )

    t.ok(updated, 'Domain should be returned')
    t.is(updated.currency_settings.BTC.active, false, 'BTC should be deactivated')

    t.pass('Currency settings active status update works')
  } catch (error) {
    t.fail(`Currency settings update failed: ${error.message}`)
  }
})

test('updateCurrencySettings updates limits successfully', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `currencylimits${Date.now()}.com`
    const createResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const updated = await domainService.updateCurrencySettings(
      createResult.domain._id,
      'USDT_POLYGON',
      { minSendable: 500, maxSendable: 50000 }
    )

    t.ok(updated, 'Domain should be returned')
    t.is(updated.currency_settings.USDT_POLYGON.minSendable, 500, 'minSendable should be updated')
    t.is(updated.currency_settings.USDT_POLYGON.maxSendable, 50000, 'maxSendable should be updated')

    t.pass('Currency settings limits update works')
  } catch (error) {
    t.fail(`Currency settings limits update failed: ${error.message}`)
  }
})

test('updateCurrencySettings updates both active and limits', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `currencyboth${Date.now()}.com`
    const createResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const updated = await domainService.updateCurrencySettings(
      createResult.domain._id,
      'USD',
      { active: false, minSendable: 100, maxSendable: 5000 }
    )

    t.ok(updated, 'Domain should be returned')
    t.is(updated.currency_settings.USD.active, false, 'active should be updated')
    t.is(updated.currency_settings.USD.minSendable, 100, 'minSendable should be updated')
    t.is(updated.currency_settings.USD.maxSendable, 5000, 'maxSendable should be updated')

    t.pass('Currency settings full update works')
  } catch (error) {
    t.fail(`Currency settings full update failed: ${error.message}`)
  }
})

test('updateCurrencySettings throws error for invalid currency code', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `invalidcurrency${Date.now()}.com`
    const createResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    try {
      await domainService.updateCurrencySettings(
        createResult.domain._id,
        'INVALID_CURRENCY',
        { active: false }
      )
      t.fail('Should throw error for invalid currency code')
    } catch (error) {
      t.ok(error.message.includes('Invalid currency code'), 'Should throw invalid currency error')
    }

    t.pass('Invalid currency code handling works')
  } catch (error) {
    t.fail(`Invalid currency code test failed: ${error.message}`)
  }
})

test('updateCurrencySettings throws error for non-existent domain', async (t) => {
  try {
    await initializeDatabase()

    const fakeId = '507f1f77bcf86cd799439011'

    try {
      await domainService.updateCurrencySettings(fakeId, 'BTC', { active: false })
      t.fail('Should throw error for non-existent domain')
    } catch (error) {
      t.ok(error.message.includes('Domain not found'), 'Should throw domain not found error')
    }

    t.pass('Non-existent domain handling works')
  } catch (error) {
    t.fail(`Non-existent domain test failed: ${error.message}`)
  }
})

test('updateCurrencySettings throws error for negative minSendable', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `negativemin${Date.now()}.com`
    const createResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    try {
      await domainService.updateCurrencySettings(
        createResult.domain._id,
        'BTC',
        { minSendable: -100 }
      )
      t.fail('Should throw error for negative minSendable')
    } catch (error) {
      t.ok(error.message.includes('minSendable must be a non-negative number'), 'Should throw validation error')
    }

    t.pass('Negative minSendable validation works')
  } catch (error) {
    t.fail(`Negative minSendable test failed: ${error.message}`)
  }
})

test('updateCurrencySettings throws error for negative maxSendable', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `negativemax${Date.now()}.com`
    const createResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    try {
      await domainService.updateCurrencySettings(
        createResult.domain._id,
        'BTC',
        { maxSendable: -100 }
      )
      t.fail('Should throw error for negative maxSendable')
    } catch (error) {
      t.ok(error.message.includes('maxSendable must be a non-negative number'), 'Should throw validation error')
    }

    t.pass('Negative maxSendable validation works')
  } catch (error) {
    t.fail(`Negative maxSendable test failed: ${error.message}`)
  }
})

test('updateCurrencySettings throws error when minSendable > maxSendable', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `mingtmax${Date.now()}.com`
    const createResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    try {
      await domainService.updateCurrencySettings(
        createResult.domain._id,
        'BTC',
        { minSendable: 10000, maxSendable: 100 }
      )
      t.fail('Should throw error when minSendable > maxSendable')
    } catch (error) {
      t.ok(error.message.includes('minSendable cannot be greater than maxSendable'), 'Should throw validation error')
    }

    t.pass('minSendable > maxSendable validation works')
  } catch (error) {
    t.fail(`minSendable > maxSendable test failed: ${error.message}`)
  }
})

test('cleanup - close database connection', async (t) => {
  await closeDatabase()
  t.pass('Database connection closed')
})
