require('dotenv').config()
const { MongoClient } = require('mongodb')
const crypto = require('crypto')

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uma-service'
const DB_NAME = process.env.DB_NAME || 'uma-service'

// Global variables
let client = null
let db = null

// Connect to MongoDB
async function connectToDatabase () {
  if (!client) {
    client = new MongoClient(MONGODB_URI)
    await client.connect()
    db = client.db(DB_NAME)
    console.log('Connected to MongoDB')
  }
  return db
}

// Get database instance
async function getDatabase () {
  if (!db) {
    await connectToDatabase()
  }
  return db
}

// Initialize database with collections and indexes
async function initializeDatabase () {
  const database = await getDatabase()

  // Create collections if they don't exist
  const collections = await database.listCollections().toArray()
  const collectionNames = collections.map(col => col.name)

  // Domains collection
  if (!collectionNames.includes('domains')) {
    await database.createCollection('domains')
    await database.collection('domains').createIndex({ domain: 1 }, { unique: true })
    await database.collection('domains').createIndex({ owner_email: 1 })
    await database.collection('domains').createIndex({ is_default: 1 })
    console.log('Created domains collection with indexes')
  }

  // Users collection
  if (!collectionNames.includes('users')) {
    await database.createCollection('users')
    await database.collection('users').createIndex({ username: 1, domain_id: 1 }, { unique: true })
    await database.collection('users').createIndex({ domain_id: 1 })
    console.log('Created users collection with indexes')
  }

  // Chain addresses collection
  if (!collectionNames.includes('chain_addresses')) {
    await database.createCollection('chain_addresses')
    await database.collection('chain_addresses').createIndex({ user_id: 1, chain_name: 1 }, { unique: true })
    await database.collection('chain_addresses').createIndex({ user_id: 1 })
    console.log('Created chain_addresses collection with indexes')
  }

  // Payment requests collection
  if (!collectionNames.includes('payment_requests')) {
    await database.createCollection('payment_requests')
    await database.collection('payment_requests').createIndex({ nonce: 1 }, { unique: true })
    await database.collection('payment_requests').createIndex({ user_id: 1 })
    await database.collection('payment_requests').createIndex({ status: 1 })
    await database.collection('payment_requests').createIndex({ expires_at: 1 })
    console.log('Created payment_requests collection with indexes')
  }

  // Audit log collection
  if (!collectionNames.includes('audit_log')) {
    await database.createCollection('audit_log')
    await database.collection('audit_log').createIndex({ domain_id: 1 })
    await database.collection('audit_log').createIndex({ action: 1 })
    await database.collection('audit_log').createIndex({ created_at: 1 })
    console.log('Created audit_log collection with indexes')
  }

  // Note: No default domain is created automatically.
  // All domains must be registered through the Super Admin API.

  console.log('Database initialized successfully')
}

// Generate a secure API key
function generateApiKey () {
  return `uma_${crypto.randomBytes(32).toString('hex')}`
}

// Generate a verification token
function generateVerificationToken () {
  return `uma-verify-${crypto.randomBytes(16).toString('hex')}`
}

// Close database connection
async function closeDatabase () {
  if (client) {
    await client.close()
    client = null
    db = null
  }
}

// Log audit event
async function logAuditEvent (auditData) {
  const db = await getDatabase()
  await db.collection('audit_log').insertOne({
    ...auditData,
    created_at: new Date()
  })
}

// Export database connection functions
module.exports = {
  connectToDatabase,
  getDatabase,
  closeDatabase,
  initializeDatabase,
  generateApiKey,
  generateVerificationToken,
  logAuditEvent
}
