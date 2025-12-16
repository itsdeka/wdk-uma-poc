const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const { test } = require('brittle')
const { initializeDatabase } = require('../src/db/database')
const { userService } = require('../src/services/users')
const { domainService } = require('../src/services/domains')

test('createUser creates user successfully', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `usertest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const userResult = await userService.createUser({
      username: `testuser_${Date.now()}`,
      domainId: domainResult.domain._id,
      displayName: 'Test User',
      addresses: {
        lightning: 'lnbc1000n1pj9x3z0pp5...',
        polygon: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
      }
    })

    t.ok(userResult, 'User should be created')
    t.is(userResult.username, userResult.username, 'Username should match')
    t.is(userResult.display_name, 'Test User', 'Display name should match')
    t.ok(userResult._id, 'User should have an ID')

    t.pass('User creation works')
  } catch (error) {
    t.fail(`User creation failed: ${error.message}`)
  }
})

test('createUser prevents duplicate usernames in domain', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `dupusertest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const username = `duplicate_user_${Date.now()}`

    // Create first user
    await userService.createUser({
      username,
      domainId: domainResult.domain._id,
      displayName: 'First User'
    })

    // Try to create duplicate
    try {
      await userService.createUser({
        username, // Same username
        domainId: domainResult.domain._id,
        displayName: 'Second User'
      })
      t.fail('Should not allow duplicate username in domain')
    } catch (error) {
      t.ok(error.message.includes('already exists'), 'Should throw duplicate username error')
    }

    t.pass('Duplicate username prevention works')
  } catch (error) {
    t.fail(`Duplicate username test failed: ${error.message}`)
  }
})

test('createUser validates username format', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `validatetest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    // Test invalid usernames
    const invalidUsernames = [
      'user with spaces',
      'user-with-dashes-and-spaces ',
      '', // too short
      'user_with_very_long_name_that_exceeds_the_limit_of_64_characters_1234567890' // too long
    ]

    for (const invalidUsername of invalidUsernames) {
      try {
        await userService.createUser({
          username: invalidUsername,
          domainId: domainResult.domain._id,
          displayName: 'Test User'
        })
        t.fail(`Should reject invalid username: ${invalidUsername}`)
      } catch (error) {
        t.ok(error.message.includes('Invalid username format'), `Should reject invalid username: ${invalidUsername}`)
      }
    }

    // Test valid username
    const validUser = await userService.createUser({
      username: 'valid_user_123',
      domainId: domainResult.domain._id,
      displayName: 'Valid User'
    })

    t.ok(validUser, 'Should accept valid username')

    t.pass('Username validation works')
  } catch (error) {
    t.fail(`Username validation test failed: ${error.message}`)
  }
})

test('getUserById retrieves user correctly', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `getidtest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const userResult = await userService.createUser({
      username: `testuser_${Date.now()}`,
      domainId: domainResult.domain._id,
      displayName: 'Test User'
    })

    const retrieved = await userService.getUserById(userResult._id)

    t.ok(retrieved, 'User should be retrieved')
    t.is(retrieved._id.toString(), userResult._id.toString(), 'IDs should match')
    t.is(retrieved.username, userResult.username, 'Username should match')

    t.pass('User retrieval by ID works')
  } catch (error) {
    t.fail(`User retrieval by ID failed: ${error.message}`)
  }
})

test('getUserById returns null for non-existent user', async (t) => {
  try {
    await initializeDatabase()

    const retrieved = await userService.getUserById('507f1f77bcf86cd799439011') // Valid ObjectId format but doesn't exist

    t.is(retrieved, null, 'Should return null for non-existent user')

    t.pass('Non-existent user retrieval works')
  } catch (error) {
    t.fail(`Non-existent user retrieval test failed: ${error.message}`)
  }
})

test('getUserByUsernameAndDomain retrieves user correctly', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `getnamedtest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const username = `testuser_${Date.now()}`
    await userService.createUser({
      username,
      domainId: domainResult.domain._id,
      displayName: 'Test User'
    })

    const retrieved = await userService.getUserByUsernameAndDomain(username, domainResult.domain._id)

    t.ok(retrieved, 'User should be retrieved by username and domain')
    t.is(retrieved.username, username, 'Username should match')

    t.pass('User retrieval by username and domain works')
  } catch (error) {
    t.fail(`User retrieval by username and domain failed: ${error.message}`)
  }
})

test('getUserByUsernameAndDomain returns undefined for non-existent user', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `nonexistenttest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const retrieved = await userService.getUserByUsernameAndDomain('nonexistent', domainResult.domain._id)

    t.is(retrieved, null, 'Should return null for non-existent user in domain')

    t.pass('Non-existent user in domain retrieval works')
  } catch (error) {
    t.fail(`Non-existent user in domain retrieval test failed: ${error.message}`)
  }
})

test('getUserAddresses retrieves user addresses', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `addressestest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const userResult = await userService.createUser({
      username: `testuser_${Date.now()}`,
      domainId: domainResult.domain._id,
      displayName: 'Test User',
      addresses: {
        lightning: 'lnbc1000n1pj9x3z0pp5...',
        polygon: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
      }
    })

    const addresses = await userService.getUserAddresses(userResult._id)

    t.ok(Array.isArray(addresses), 'Should return an array')
    t.is(addresses.length, 2, 'Should return 2 addresses')

    const chainNames = addresses.map(addr => addr.chain_name)
    t.ok(chainNames.includes('lightning'), 'Should include lightning address')
    t.ok(chainNames.includes('polygon'), 'Should include polygon address')

    t.pass('User addresses retrieval works')
  } catch (error) {
    t.fail(`User addresses retrieval failed: ${error.message}`)
  }
})

test('getFormattedAddresses formats addresses correctly', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `formattedtest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const userResult = await userService.createUser({
      username: `testuser_${Date.now()}`,
      domainId: domainResult.domain._id,
      displayName: 'Test User',
      addresses: {
        lightning: 'lnbc1000n1pj9x3z0pp5...',
        polygon: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
      }
    })

    const formatted = await userService.getFormattedAddresses(userResult._id)

    t.ok(typeof formatted === 'object', 'Should return an object')
    t.ok(formatted.lightning, 'Should include lightning address')
    t.ok(formatted.polygon, 'Should include polygon address')
    t.is(formatted.lightning.address, 'lnbc1000n1pj9x3z0pp5...', 'Lightning address should match')
    t.is(formatted.polygon.address, '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb', 'Polygon address should match')

    t.pass('Address formatting works')
  } catch (error) {
    t.fail(`Address formatting test failed: ${error.message}`)
  }
})

test('enrichUserWithAddresses adds addresses to user object', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `enrichtest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const userResult = await userService.createUser({
      username: `testuser_${Date.now()}`,
      domainId: domainResult.domain._id,
      displayName: 'Test User',
      addresses: {
        lightning: 'lnbc1000n1pj9x3z0pp5...',
        polygon: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
      }
    })

    const enriched = await userService.enrichUserWithAddresses(userResult)

    t.ok(enriched.addresses, 'Should have addresses property')
    t.ok(enriched.addresses.lightning, 'Should include lightning in addresses')
    t.ok(enriched.addresses.polygon, 'Should include polygon in addresses')
    t.is(enriched.addresses.lightning.address, 'lnbc1000n1pj9x3z0pp5...', 'Lightning address should match')

    t.pass('User enrichment with addresses works')
  } catch (error) {
    t.fail(`User enrichment test failed: ${error.message}`)
  }
})

test('listUsersByDomain retrieves users for domain', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `listtest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    // Create multiple users
    const users = []
    for (let i = 0; i < 3; i++) {
      const user = await userService.createUser({
        username: `user${i}_${Date.now()}`,
        domainId: domainResult.domain._id,
        displayName: `User ${i}`
      })
      users.push(user)
    }

    const domainUsers = await userService.getUsersByDomain(domainResult.domain._id)

    t.ok(Array.isArray(domainUsers), 'Should return an array')
    t.ok(domainUsers.length >= 3, 'Should return at least the created users')

    t.pass('Domain user listing works')
  } catch (error) {
    console.log(error)
    t.fail(`Domain user listing failed: ${error.message}`)
  }
})

test('updateUser updates user information', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `updatetest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const userResult = await userService.createUser({
      username: `updatetest_${Date.now()}`,
      domainId: domainResult.domain._id,
      displayName: 'Original Name'
    })

    const updatedUser = await userService.updateUser(userResult._id, {
      displayName: 'Updated Name',
      addresses: {
        lightning: 'lnbc1000n1pj9x3z0pp5...',
        polygon: '0x123456789abcdef'
      }
    })

    t.ok(updatedUser, 'User should be updated')
    t.is(updatedUser.display_name, 'Updated Name', 'Display name should be updated')
    t.ok(updatedUser.addresses.lightning, 'Lightning address should be added')
    t.ok(updatedUser.addresses.polygon, 'Polygon address should be added')

    t.pass('User update works')
  } catch (error) {
    t.fail(`User update failed: ${error.message}`)
  }
})

test('deactivateUser deactivates user', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `deactivatetest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const userResult = await userService.createUser({
      username: `deactivatetest_${Date.now()}`,
      domainId: domainResult.domain._id,
      displayName: 'Test User'
    })

    await userService.deactivateUser(userResult._id)

    const deactivatedUser = await userService.getUserById(userResult._id)
    t.is(deactivatedUser.is_active, false, 'User should be deactivated')

    t.pass('User deactivation works')
  } catch (error) {
    t.fail(`User deactivation failed: ${error.message}`)
  }
})

test('activateUser activates user', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `activatetest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const userResult = await userService.createUser({
      username: `activatetest_${Date.now()}`,
      domainId: domainResult.domain._id,
      displayName: 'Test User'
    })

    // First deactivate
    await userService.deactivateUser(userResult._id)

    // Then activate
    await userService.activateUser(userResult._id)

    const activatedUser = await userService.getUserById(userResult._id)
    t.is(activatedUser.is_active, true, 'User should be activated')

    t.pass('User activation works')
  } catch (error) {
    t.fail(`User activation failed: ${error.message}`)
  }
})

test('deleteUser removes user completely', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `deletetest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const userResult = await userService.createUser({
      username: `deletetest_${Date.now()}`,
      domainId: domainResult.domain._id,
      displayName: 'Test User'
    })

    await userService.deleteUser(userResult._id)

    const deletedUser = await userService.getUserById(userResult._id)
    t.is(deletedUser, null, 'User should be completely deleted')

    t.pass('User deletion works')
  } catch (error) {
    t.fail(`User deletion failed: ${error.message}`)
  }
})

test('addUserAddress adds address to existing user', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `addaddresstest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const userResult = await userService.createUser({
      username: `addaddresstest_${Date.now()}`,
      domainId: domainResult.domain._id,
      displayName: 'Test User'
    })

    await userService.addUserAddress(userResult._id, 'ethereum', '0xabcdef123456789')

    const userWithAddress = await userService.getUserById(userResult._id)
    const enrichedUser = await userService.enrichUserWithAddresses(userWithAddress)

    t.ok(enrichedUser.addresses.ethereum, 'Ethereum address should be added')
    t.is(enrichedUser.addresses.ethereum.address, '0xabcdef123456789', 'Address should match')

    t.pass('Add user address works')
  } catch (error) {
    t.fail(`Add user address failed: ${error.message}`)
  }
})

test('removeUserAddress removes address from user', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `removeaddresstest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const userResult = await userService.createUser({
      username: `removeaddresstest_${Date.now()}`,
      domainId: domainResult.domain._id,
      displayName: 'Test User',
      addresses: {
        ethereum: '0xabcdef123456789',
        polygon: '0x123456789abcdef'
      }
    })

    await userService.removeUserAddress(userResult._id, 'ethereum')

    const userWithoutAddress = await userService.getUserById(userResult._id)
    const enrichedUser = await userService.enrichUserWithAddresses(userWithoutAddress)

    t.is(enrichedUser.addresses.ethereum, undefined, 'Ethereum address should be removed')
    t.ok(enrichedUser.addresses.polygon, 'Polygon address should remain')

    t.pass('Remove user address works')
  } catch (error) {
    t.fail(`Remove user address failed: ${error.message}`)
  }
})

test('getUserByUsername retrieves user by username only', async (t) => {
  try {
    await initializeDatabase()

    const testDomain = `usernameonlytest${Date.now()}.com`
    const domainResult = await domainService.createDomain({
      domain: testDomain,
      ownerEmail: `admin@${testDomain}`,
      isDefault: false
    })

    const username = `usernameonlytest_${Date.now()}`
    const userResult = await userService.createUser({
      username,
      domainId: domainResult.domain._id,
      displayName: 'Test User'
    })

    const retrievedUser = await userService.getUserByUsername(username)

    t.ok(retrievedUser, 'User should be retrieved by username')
    t.is(retrievedUser.username, username, 'Username should match')

    t.pass('Get user by username works')
  } catch (error) {
    t.fail(`Get user by username failed: ${error.message}`)
  }
})

test('isValidUsername validates username format', async (t) => {
  const userServiceInstance = new (require('../src/services/users').UserService)()

  t.ok(userServiceInstance.isValidUsername('valid_user123'), 'Valid username should pass')
  t.ok(userServiceInstance.isValidUsername('test-user'), 'Valid username with dash should pass')
  t.ok(userServiceInstance.isValidUsername('a'), 'Single character should pass')

  t.ok(!userServiceInstance.isValidUsername(''), 'Empty string should fail')
  t.ok(!userServiceInstance.isValidUsername('user with spaces'), 'Username with spaces should fail')
  t.ok(!userServiceInstance.isValidUsername('user-with-very-long-name-that-exceeds-the-limit-of-sixty-four-characters-in-total-length'), 'Too long username should fail')

  t.pass('Username validation works')
})
