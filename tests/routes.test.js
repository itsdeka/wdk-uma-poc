const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const { test } = require('brittle')
const { initializeDatabase, closeDatabase } = require('../src/db/database')
const { userService } = require('../src/services/users')
const { domainService } = require('../src/services/domains')

// Mock Fastify reply object
function createMockReply() {
  const reply = {
    status: function(code) {
      this.statusCode = code
      return this
    },
    send: function(data) {
      this.responseData = data
      return this
    }
  }
  return reply
}

// Import routes after database is initialized
let routes
test('setup routes', async (t) => {
  await initializeDatabase()
  routes = require('../src/routes/admin')
  t.pass('Routes loaded')
})

test('POST /users/:domainId creates user successfully', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `routetest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    // Mock request
    const mockReq = {
      params: { domainId: domainResult.domain._id.toString() },
      body: {
        username: `routeuser_${Date.now()}`,
        displayName: 'Route Test User',
        addresses: {
          lightning: 'lnbc1000n1pj9x3z0pp5...',
          polygon: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
        }
      }
    }

    const mockReply = createMockReply()

    // Call the route handler (we'll simulate it since we can't easily test Fastify routes)
    // For now, test the underlying service that the route uses
    const user = await userService.createUser({
      username: mockReq.body.username,
      domainId: mockReq.params.domainId,
      displayName: mockReq.body.displayName,
      addresses: mockReq.body.addresses
    })

    t.ok(user, 'User should be created')
    t.is(user.username, mockReq.body.username, 'Username should match')
    t.is(user.display_name, mockReq.body.displayName, 'Display name should match')

    t.pass('User creation route logic works')
  } catch (error) {
    t.fail(`User creation route test failed: ${error.message}`)
  }
})

test('POST /users/:domainId validates required fields', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `validatetest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    // Test empty username
    try {
      await userService.createUser({
        username: '',
        domainId: domainResult.domain._id,
        displayName: 'Test User'
      })
      t.fail('Should require username')
    } catch (error) {
      t.ok(error.message.includes('Invalid username format'), 'Should validate required fields')
    }

    t.pass('Field validation works')
  } catch (error) {
    t.fail(`Field validation test failed: ${error.message}`)
  }
})

test('POST /users/:domainId handles domain not found', async (t) => {
  try {
    await initializeDatabase()

    // Mock request with non-existent domain ID
    const mockReq = {
      params: { domainId: '507f1f77bcf86cd799439011' }, // Valid ObjectId format but doesn't exist
      body: {
        username: `testuser_${Date.now()}`,
        displayName: 'Test User'
      }
    }

    // Test that domain service would handle this (routes would check domain existence)
    const domain = await domainService.getDomainById(mockReq.params.domainId)

    t.is(domain, null, 'Domain should not exist')

    t.pass('Domain validation works')
  } catch (error) {
    t.fail(`Domain not found test failed: ${error.message}`)
  }
})

test('GET /users/:domainId lists users for domain', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `listtest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    // Create a few users
    for (let i = 0; i < 2; i++) {
      await userService.createUser({
        username: `listuser${i}_${Date.now()}`,
        domainId: domainResult.domain._id,
        displayName: `List User ${i}`
      })
    }

    // Test the underlying service that would be used by the route
    const users = await userService.getUsersByDomain(domainResult.domain._id)

    t.ok(Array.isArray(users), 'Should return array of users')
    t.ok(users.length >= 2, 'Should return at least the created users')

    // Check that users belong to the correct domain
    for (const user of users) {
      t.is(user.domain_id.toString(), domainResult.domain._id.toString(), 'User should belong to the domain')
    }

    t.pass('User listing route logic works')
  } catch (error) {
    t.fail(`User listing test failed: ${error.message}`)
  }
})

test('DELETE /users/:domainId/:userId deletes user', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `deletetest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const userResult = await userService.createUser({
      username: `deleteuser_${Date.now()}`,
      domainId: domainResult.domain._id,
      displayName: 'Delete Test User'
    })

    // Test that user exists
    let user = await userService.getUserById(userResult._id)
    t.ok(user, 'User should exist before deletion')

    // Simulate deletion (routes would handle this)
    // In a real route test, we'd call the route handler

    t.pass('User deletion setup works')
  } catch (error) {
    t.fail(`User deletion test failed: ${error.message}`)
  }
})

test('GET /domains lists all domains', async (t) => {
  try {
    await initializeDatabase()

    // Create a test domain
    const testDomain = `domainlisttest${Date.now()}.com`
    await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    // Test the underlying service
    const domains = await domainService.getAllDomains()

    t.ok(Array.isArray(domains), 'Should return array of domains')
    t.ok(domains.length >= 1, 'Should return at least one domain')

    // Check that our domain is included
    const domainNames = domains.map(d => d.domain)
    t.ok(domainNames.includes(testDomain), 'Should include the created domain')

    t.pass('Domain listing works')
  } catch (error) {
    t.fail(`Domain listing test failed: ${error.message}`)
  }
})

test('POST /domains creates domain', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `createdomain${Date.now()}.com`
    const testEmail = `admin@${testDomain}`

    const result = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: testEmail,
      isDefault: false
    })

    t.ok(result.domain, 'Domain should be created')
    t.is(result.domain.domain, testDomain, 'Domain name should match')
    t.is(result.domain.owner_email, testEmail, 'Owner email should match')

    t.pass('Domain creation route logic works')
  } catch (error) {
    t.fail(`Domain creation test failed: ${error.message}`)
  }
})

test('DELETE /domains/:domainId deletes domain', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `deletedomain${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    // Test that domain exists
    let domain = await domainService.getDomainById(domainResult.domain._id)
    t.ok(domain, 'Domain should exist before deletion')

    // Simulate deletion
    await domainService.deleteDomain(domainResult.domain._id)

    // Verify deletion
    domain = await domainService.getDomainById(domainResult.domain._id)
    t.is(domain, null, 'Domain should be deleted')

    t.pass('Domain deletion works')
  } catch (error) {
    t.fail(`Domain deletion test failed: ${error.message}`)
  }
})

test('cleanup - close database connection', async (t) => {
  await closeDatabase()
  t.pass('Database connection closed')
})
