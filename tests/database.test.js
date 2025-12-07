const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const { test } = require('brittle')
const { initializeDatabase, getDatabase, generateApiKey, logAuditEvent } = require('../src/db/database')

test('database initialization creates all collections', async (t) => {
  try {
    await initializeDatabase()
    const db = await getDatabase()

    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(col => col.name)

    const expectedCollections = ['domains', 'users', 'chain_addresses', 'payment_requests', 'audit_log']
    for (const collection of expectedCollections) {
      t.ok(collectionNames.includes(collection), `Collection '${collection}' should exist`)
    }

    t.pass('All collections created successfully')
  } catch (error) {
    t.fail(`Database initialization failed: ${error.message}`)
  }
})

test('generateApiKey creates valid API key', async (t) => {
  const apiKey = generateApiKey()
  t.ok(apiKey, 'API key should be generated')
  t.is(typeof apiKey, 'string', 'API key should be a string')
  t.ok(apiKey.startsWith('uma_'), 'API key should start with uma_')
  t.is(apiKey.length, 68, 'API key should be 68 characters long (uma_ + 64 hex chars)')

  // Should contain only valid characters
  t.ok(/^uma_[a-f0-9]+$/.test(apiKey), 'API key should be uma_ followed by hex characters')
})

test('logAuditEvent records audit events', async (t) => {
  try {
    await initializeDatabase()
    const db = await getDatabase()

    const auditData = {
      domain_id: 'test-domain-id',
      action: 'user_created',
      actor_type: 'system',
      actor_id: null,
      target_type: 'user',
      target_id: 'test-user-id',
      details: JSON.stringify({ username: 'testuser' }),
      ip_address: '127.0.0.1',
      created_at: new Date()
    }

    await logAuditEvent(auditData)

    const auditRecord = await db.collection('audit_log').findOne({
      domain_id: 'test-domain-id',
      action: 'user_created'
    })

    t.ok(auditRecord, 'Audit record should be created')
    t.is(auditRecord.action, 'user_created', 'Action should match')
    t.is(auditRecord.target_type, 'user', 'Target type should match')
    t.is(auditRecord.details, '{"username":"testuser"}', 'Details should match')

    t.pass('Audit event logged successfully')
  } catch (error) {
    t.fail(`Audit logging failed: ${error.message}`)
  }
})

test('logAuditEvent handles missing optional fields', async (t) => {
  try {
    await initializeDatabase()
    const db = await getDatabase()

    const minimalAuditData = {
      domain_id: 'test-domain-id-2',
      action: 'domain_created',
      actor_type: 'system',
      target_type: 'domain',
      target_id: 'test-domain-id-2'
    }

    await logAuditEvent(minimalAuditData)

    const auditRecord = await db.collection('audit_log').findOne({
      domain_id: 'test-domain-id-2',
      action: 'domain_created'
    })

    t.ok(auditRecord, 'Audit record should be created with minimal data')
    t.is(auditRecord.actor_id, undefined, 'Actor ID should be undefined when not provided')
    t.is(auditRecord.ip_address, undefined, 'IP address should be undefined when not provided')
    t.ok(auditRecord.created_at, 'Created at should be set automatically')

    t.pass('Audit event with minimal fields logged successfully')
  } catch (error) {
    t.fail(`Minimal audit logging failed: ${error.message}`)
  }
})

test('generateVerificationToken creates valid token', async (t) => {
  const { generateVerificationToken } = require('../src/db/database')

  const token = generateVerificationToken()
  t.ok(token, 'Verification token should be generated')
  t.is(typeof token, 'string', 'Token should be a string')
  t.ok(token.startsWith('uma-verify-'), 'Token should start with uma-verify-')
  t.is(token.length, 44, 'Token should be 44 characters long (uma-verify- + 32 hex chars)')

  // Should contain only valid characters
  t.ok(/^uma-verify-[a-f0-9]+$/.test(token), 'Token should be uma-verify- followed by hex characters')
})

test('connectToDatabase establishes connection', async (t) => {
  const { connectToDatabase } = require('../src/db/database')

  try {
    await connectToDatabase()
    t.pass('Database connection established successfully')
  } catch (error) {
    t.fail(`Database connection failed: ${error.message}`)
  }
})

test('initializeDatabase handles existing collections', async (t) => {
  try {
    // Call initialize twice to test handling of existing collections
    await initializeDatabase()
    await initializeDatabase() // Should handle existing collections gracefully

    const db = await getDatabase()
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(col => col.name)

    const expectedCollections = ['domains', 'users', 'chain_addresses', 'payment_requests', 'audit_log']
    for (const collection of expectedCollections) {
      t.ok(collectionNames.includes(collection), `Collection '${collection}' should exist`)
    }

    t.pass('Database re-initialization handles existing collections')
  } catch (error) {
    t.fail(`Database re-initialization failed: ${error.message}`)
  }
})
