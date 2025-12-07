require('dotenv').config()
const fastify = require('fastify')({ logger: true })
const { initializeDatabase } = require('./db/database')
const { umaService } = require('./services/uma')

// Swagger configuration
fastify.register(require('@fastify/swagger'), {
  openapi: {
    openapi: '3.0.0',
    info: {
      title: 'UMA Microservice API',
      description: 'Minimal UMA domain and user registry for Lightning payments',
      version: '1.0.0'
    },
    servers: [
      {
        url: process.env.BASE_URL || 'http://localhost:3000',
        description: 'Development server'
      }
    ],
    tags: [
      { name: 'UMA', description: 'Universal Money Address endpoints' },
      { name: 'Admin', description: 'Domain and user management' },
      { name: 'Health', description: 'Health check endpoints' }
    ]
  }
})

// Swagger UI
fastify.register(require('@fastify/swagger-ui'), {
  routePrefix: '/documentation',
  uiConfig: {
    docExpansion: 'full',
    deepLinking: false
  },
  staticCSP: true,
  transformStaticCSP: (header) => header
})

const PORT = process.env.PORT || 3000
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`

// Initialize database and register routes
async function initializeApp () {
  try {
    await initializeDatabase()
    console.log('✅ Database initialized')

    // Register routes
    await fastify.register(require('./routes/admin'), { prefix: '/api/admin' })

    console.log('✅ Routes registered')
  } catch (error) {
    console.error('❌ Failed to initialize app:', error)
    process.exit(1)
  }
}

// UMA Endpoint - Handles both lookup and pay requests
fastify.get('/.well-known/lnurlp/:username', {
  schema: {
    description: 'UMA LNURL endpoint for user lookup and payment requests',
    tags: ['UMA'],
    params: {
      type: 'object',
      properties: {
        username: {
          type: 'string',
          description: 'The UMA username (e.g., alice@example.com)'
        }
      }
    },
    querystring: {
      type: 'object',
      properties: {
        amount: {
          type: 'string',
          description: 'Payment amount in millisats (for pay requests only)'
        },
        nonce: {
          type: 'string',
          description: 'Optional nonce for replay attack prevention (auto-generated if not provided)'
        },
        currency: {
          type: 'string',
          default: 'USD',
          description: 'Currency code'
        },
        settlementLayer: {
          type: 'string',
          enum: ['ln', 'spark', 'polygon', 'ethereum', 'arbitrum', 'optimism', 'base', 'solana', 'plasma'],
          description: 'Preferred settlement layer for payment'
        },
        assetIdentifier: {
          type: 'string',
          description: 'Asset identifier for the settlement layer (e.g., USDT_POLYGON)'
        }
      }
    },
    response: {
      200: {
        description: 'Successful response',
        type: 'object',
        properties: {
          callback: {
            type: 'string',
            description: 'URL for payment execution'
          },
          maxSendable: {
            type: 'number',
            description: 'Maximum amount sendable in millisats'
          },
          minSendable: {
            type: 'number',
            description: 'Minimum amount sendable in millisats'
          },
          metadata: {
            type: 'string',
            description: 'LNURL metadata'
          },
          tag: {
            type: 'string',
            description: 'LNURL tag'
          }
        }
      },
      400: {
        description: 'Bad request',
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ERROR' },
          reason: { type: 'string' }
        }
      },
      404: {
        description: 'User not found',
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ERROR' },
          reason: { type: 'string', example: 'User not found' }
        }
      },
      409: {
        description: 'Duplicate nonce',
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ERROR' },
          reason: { type: 'string', example: 'Duplicate payment request. This nonce has already been used.' }
        }
      }
    }
  }
}, async (req, reply) => {
  const { username } = req.params
  const { amount, nonce, currency, settlementLayer, assetIdentifier } = req.query

  try {
    // Case 1: Lookup request (no amount parameter)
    if (!amount) {
      const lookupResponse = await umaService.generateLookupResponseLegacy(username, BASE_URL)

      if (!lookupResponse) {
        return reply.status(404).send({
          status: 'ERROR',
          reason: 'User not found'
        })
      }

      return reply.send(lookupResponse)
    }

    // Case 2: Pay request (with amount parameter)
    // Nonce is optional - auto-generate if not provided (for replay attack prevention)
    const paymentNonce = nonce || `uma_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

    const amountMsats = parseInt(amount, 10)
    if (isNaN(amountMsats) || amountMsats <= 0) {
      return reply.status(400).send({
        status: 'ERROR',
        reason: 'Invalid amount'
      })
    }

    const payResponse = await umaService.generatePayResponseLegacy(
      username,
      amountMsats,
      paymentNonce,
      currency,
      settlementLayer,
      assetIdentifier
    )

    if (!payResponse) {
      return reply.status(404).send({
        status: 'ERROR',
        reason: 'User not found'
      })
    }

    return reply.send(payResponse)
  } catch (error) {
    console.error('Error handling UMA request:', error)

    // Handle duplicate nonce error
    if (error.message === 'DUPLICATE_NONCE') {
      return reply.status(409).send({
        status: 'ERROR',
        reason: 'Duplicate payment request. This nonce has already been used.'
      })
    }

    // Handle invalid settlement layer
    if (error.message?.includes('Address not found for settlement layer')) {
      return reply.status(400).send({
        status: 'ERROR',
        reason: 'Unsupported or invalid settlement layer. Check available settlement options from the lookup endpoint.'
      })
    }

    return reply.status(500).send({
      status: 'ERROR',
      reason: 'Internal server error'
    })
  }
})

// Health check endpoint
fastify.get('/health', {
  schema: {
    description: 'Health check endpoint',
    tags: ['Health'],
    response: {
      200: {
        description: 'Service is healthy',
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          timestamp: { type: 'string', format: 'date-time' }
        }
      }
    }
  }
}, async (req, reply) => {
  reply.send({
    status: 'ok',
    timestamp: new Date().toISOString()
  })
})

// Root endpoint - API information
fastify.get('/', {
  schema: {
    description: 'API information and endpoint overview',
    tags: ['Health'],
    response: {
      200: {
        description: 'API information',
        type: 'object',
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
          description: { type: 'string' },
          endpoints: {
            type: 'object',
            properties: {
              uma_lookup: { type: 'string' },
              uma_pay: { type: 'string' },
              create_domain: { type: 'string' },
              list_users: { type: 'string' },
              create_user: { type: 'string' },
              delete_user: { type: 'string' },
              get_domain: { type: 'string' },
              delete_domain: { type: 'string' },
              health: { type: 'string' }
            }
          },
          notes: {
            type: 'object',
            properties: {
              authentication: { type: 'string' },
              domains: { type: 'string' },
              spark_key: { type: 'string' },
              nonce: { type: 'string' },
              settlement: { type: 'string' }
            }
          },
          documentation: { type: 'string' }
        }
      }
    }
  }
}, async (req, reply) => {
  reply.send({
    name: 'UMA Microservice',
    version: '1.0.0',
    description: 'Minimal UMA domain and user registry for Lightning payments',
    endpoints: {
      uma_lookup: '/.well-known/lnurlp/{username}',
      uma_pay: '/.well-known/lnurlp/{username}?amount=1000[&nonce=optional][&currency=USD][&settlementLayer=polygon][&assetIdentifier=USDT_POLYGON]',
      create_domain: 'POST /api/admin/domains',
      list_users: 'GET /api/admin/users/{domainId}',
      create_user: 'POST /api/admin/users/{domainId}',
      delete_user: 'DELETE /api/admin/users/{domainId}/{username}',
      get_domain: 'GET /api/admin/domain/{domainId}',
      delete_domain: 'DELETE /api/admin/domain/{domainId}',
      health: '/health'
    },
    notes: {
      authentication: 'None - handled by calling backend',
      domains: 'Multi-tenant - each domain has isolated users',
      spark_key: 'Optional for users - required for Lightning invoice generation',
      nonce: 'Optional - auto-generated if not provided',
      settlement: 'Supports Lightning (with Spark), blockchain payments'
    },
    documentation: 'https://github.com/uma-universal-money-address/protocol'
  })
})

// Start server
async function start () {
  try {
    // Initialize app first
    await initializeApp()

    // Start listening
    await fastify.listen({ port: PORT, host: '0.0.0.0' })

    console.log('')
    console.log('🚀 UMA Multi-Chain Payment Backend')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`📡 Server running on: ${BASE_URL}`)
    console.log(`🔗 UMA endpoint: ${BASE_URL}/.well-known/lnurlp/{username}`)
    console.log('')
    console.log('Example requests:')
    console.log(`  Lookup: curl ${BASE_URL}/.well-known/lnurlp/alice`)
    console.log(`  Pay (auto nonce): curl "${BASE_URL}/.well-known/lnurlp/alice?amount=1000"`)
    console.log(`  Pay (custom nonce): curl "${BASE_URL}/.well-known/lnurlp/alice?amount=1000&nonce=custom123"`)
    console.log(`  Pay (with settlement): curl "${BASE_URL}/.well-known/lnurlp/alice?amount=1000&settlementLayer=polygon"`)
    console.log('')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
