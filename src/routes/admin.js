const { domainService } = require('../services/domains')
const { userService } = require('../services/users')

async function adminRoutes (fastify, options) {
  // Authentication required - Bearer token with API key

  // Authentication middleware
  async function authenticateAdmin (request, reply) {
    const authHeader = request.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header'
      })
    }

    const providedKey = authHeader.substring(7) // Remove 'Bearer ' prefix
    const API_KEY = process.env.API_KEY

    if (!API_KEY) {
      return reply.status(500).send({
        error: 'Server Configuration Error',
        message: 'API authentication not configured'
      })
    }

    if (providedKey !== API_KEY) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Invalid API key'
      })
    }
  }

  /**
   * POST /api/admin/domains
   * Register a new domain
   */
  fastify.post('/domains', {
    preHandler: authenticateAdmin,
    schema: {
      description: 'Register a new domain for UMA addresses',
      tags: ['Admin'],
      body: {
        type: 'object',
        required: ['domain', 'ownerEmail'],
        properties: {
          domain: {
            type: 'string',
            description: 'Domain name (e.g., example.com)'
          },
          ownerEmail: {
            type: 'string',
            format: 'email',
            description: 'Owner email address'
          },
          displayName: {
            type: 'string',
            description: 'Optional display name for the domain'
          },
          isDefault: {
            type: 'boolean',
            default: false,
            description: 'Whether this is the default domain for self-hosted mode'
          }
        }
      },
      response: {
        201: {
          description: 'Domain created successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            domain: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                domain: { type: 'string' },
                ownerEmail: { type: 'string' },
                displayName: { type: 'string' },
                isActive: { type: 'boolean' },
                isDefault: { type: 'boolean' },
                createdAt: { type: 'string', format: 'date-time' }
              }
            },
            message: { type: 'string' }
          }
        },
        400: {
          description: 'Bad request - missing required fields',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Bad Request' },
            message: { type: 'string' }
          }
        },
        409: {
          description: 'Domain already exists',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Conflict' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const { domain, ownerEmail, displayName, isDefault } = req.body

      if (!domain) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Domain is required'
        })
      }

      const result = await domainService.createDomain({
        domain,
        ownerEmail,
        displayName,
        isDefault: isDefault || false
      })

      reply.status(201).send({
        success: true,
        domain: {
          id: result.domain._id,
          domain: result.domain.domain,
          ownerEmail: result.domain.owner_email,
          displayName: result.domain.display_name,
          isActive: result.domain.is_active,
          isDefault: result.domain.is_default,
          createdAt: result.domain.created_at
        },
        message: result.message
      })
    } catch (error) {
      console.error('Error creating domain:', error)

      if (error.message.includes('already exists')) {
        return reply.status(409).send({
          error: 'Conflict',
          message: error.message
        })
      }

      reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message
      })
    }
  })

  /**
   * GET /api/admin/users/:domainId
   * List users for a domain
   */
  fastify.get('/users/:domainId', {
    preHandler: authenticateAdmin,
    schema: {
      description: 'List all users for a specific domain',
      tags: ['Admin'],
      params: {
        type: 'object',
        properties: {
          domainId: {
            type: 'string',
            description: 'Domain ID to list users for'
          }
        }
      },
      response: {
        200: {
          description: 'Users retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            users: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  username: { type: 'string' },
                  displayName: { type: 'string' },
                  domainId: { type: 'string' },
                  addresses: { type: 'object' },
                  createdAt: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        },
        500: {
          description: 'Internal server error',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Internal Server Error' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const { domainId } = req.params
      const users = await userService.getUsersByDomainWithAddresses(domainId)

      reply.send({
        success: true,
        users: users.map(user => ({
          id: user._id,
          username: user.username,
          displayName: user.display_name,
          domainId: user.domain_id,
          addresses: user.addresses,
          createdAt: user.created_at
        }))
      })
    } catch (error) {
      console.error('Error listing users:', error)
      reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message
      })
    }
  })

  /**
   * POST /api/admin/users/:domainId
   * Create a user for a domain
   */
  fastify.post('/users/:domainId', {
    preHandler: authenticateAdmin,
    schema: {
      description: 'Create a new UMA user for a domain',
      tags: ['Admin'],
      params: {
        type: 'object',
        properties: {
          domainId: {
            type: 'string',
            description: 'Domain ID where the user will be created'
          }
        }
      },
      body: {
        type: 'object',
        required: ['username'],
        properties: {
          username: {
            type: 'string',
            description: 'Username for the UMA address (e.g., alice for alice@example.com)',
            pattern: '^[a-zA-Z0-9_-]+$',
            minLength: 1,
            maxLength: 64
          },
          displayName: {
            type: 'string',
            description: 'Optional display name for the user'
          },
          addresses: {
            type: 'object',
            description: 'Multi-chain addresses for the user',
            properties: {
              lightning: { type: 'string', description: 'Lightning Network address' },
              polygon: { type: 'string', description: 'Polygon address' },
              ethereum: { type: 'string', description: 'Ethereum address' },
              arbitrum: { type: 'string', description: 'Arbitrum address' },
              optimism: { type: 'string', description: 'Optimism address' },
              base: { type: 'string', description: 'Base address' },
              solana: { type: 'string', description: 'Solana address' }
            }
          },
          sparkPublicKey: {
            type: 'string',
            description: 'Optional Spark public key for Lightning invoice generation'
          }
        }
      },
      response: {
        201: {
          description: 'User created successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                username: { type: 'string' },
                displayName: { type: 'string' },
                domainId: { type: 'string' },
                addresses: { type: 'object' },
                sparkPublicKey: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' }
              }
            },
            message: { type: 'string' }
          }
        },
        400: {
          description: 'Bad request - invalid username or missing required fields',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Bad Request' },
            message: { type: 'string' }
          }
        },
        404: {
          description: 'Domain not found',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Not Found' },
            message: { type: 'string' }
          }
        },
        409: {
          description: 'Username already exists in domain',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Conflict' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const { domainId } = req.params
      const { username, displayName, addresses, sparkPublicKey } = req.body

      if (!username) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Username is required'
        })
      }

      const user = await userService.createUser({
        username,
        domainId,
        displayName,
        addresses,
        sparkPublicKey
      })

      reply.status(201).send({
        success: true,
        user: {
          id: user._id,
          username: user.username,
          displayName: user.display_name,
          domainId: user.domain_id,
          addresses: user.addresses,
          sparkPublicKey: user.spark_public_key,
          createdAt: user.created_at
        }
      })
    } catch (error) {
      console.error('Error creating user:', error)

      if (error.message.includes('duplicate')) {
        return reply.status(409).send({
          error: 'Conflict',
          message: error.message
        })
      }

      reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message
      })
    }
  })

  /**
   * DELETE /api/admin/users/:domainId/:username
   * Delete a user from a domain
   */
  fastify.delete('/users/:domainId/:username', {
    preHandler: authenticateAdmin,
    schema: {
      description: 'Delete a user from a domain',
      tags: ['Admin'],
      params: {
        type: 'object',
        properties: {
          domainId: {
            type: 'string',
            description: 'Domain ID where the user exists'
          },
          username: {
            type: 'string',
            description: 'Username of the user to delete'
          }
        }
      },
      response: {
        200: {
          description: 'User deleted successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'User deleted successfully' }
          }
        },
        404: {
          description: 'User not found',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Not Found' },
            message: { type: 'string', example: 'User not found' }
          }
        },
        500: {
          description: 'Internal server error',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Internal Server Error' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const { domainId, username } = req.params

      const user = await userService.getUserByUsernameAndDomain(username, domainId)

      if (!user) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'User not found'
        })
      }

      await userService.deleteUser(user._id)

      reply.send({
        success: true,
        message: 'User deleted successfully'
      })
    } catch (error) {
      console.error('Error deleting user:', error)
      reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message
      })
    }
  })

  /**
   * GET /api/admin/domain/:domainId
   * Get domain details
   */
  fastify.get('/domain/:domainId', {
    preHandler: authenticateAdmin
  }, async (req, reply) => {
    try {
      const { domainId } = req.params
      const domain = await domainService.getDomainById(domainId)

      if (!domain) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Domain not found'
        })
      }

      reply.send({
        success: true,
        domain: {
          id: domain._id,
          domain: domain.domain,
          ownerEmail: domain.owner_email,
          displayName: domain.display_name,
          isActive: domain.is_active,
          isDefault: domain.is_default,
          createdAt: domain.created_at
        }
      })
    } catch (error) {
      console.error('Error getting domain:', error)
      reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message
      })
    }
  })

  /**
   * PATCH /api/admin/domain/:domainId/currency/:currencyCode
   * Update currency settings for a domain
   */
  fastify.patch('/domain/:domainId/currency/:currencyCode', {
    preHandler: authenticateAdmin,
    schema: {
      description: 'Update currency settings for a domain',
      tags: ['Admin'],
      params: {
        type: 'object',
        properties: {
          domainId: {
            type: 'string',
            description: 'Domain ID'
          },
          currencyCode: {
            type: 'string',
            description: 'Currency code (BTC, USDT_POLYGON, USDT_SOLANA, USDT_TRON, USDT_ETH, USD)'
          }
        }
      },
      body: {
        type: 'object',
        properties: {
          active: {
            type: 'boolean',
            description: 'Whether this currency is active for the domain'
          },
          minSendable: {
            type: 'number',
            description: 'Minimum sendable amount'
          },
          maxSendable: {
            type: 'number',
            description: 'Maximum sendable amount'
          }
        }
      },
      response: {
        200: {
          description: 'Currency settings updated successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            domain: { type: 'object' },
            message: { type: 'string' }
          }
        },
        400: {
          description: 'Bad request - invalid currency code or settings',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Bad Request' },
            message: { type: 'string' }
          }
        },
        404: {
          description: 'Domain not found',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Not Found' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const { domainId, currencyCode } = req.params
      const { active, minSendable, maxSendable } = req.body

      const updatedDomain = await domainService.updateCurrencySettings(domainId, currencyCode, {
        active,
        minSendable,
        maxSendable
      })

      reply.send({
        success: true,
        domain: {
          id: updatedDomain._id,
          domain: updatedDomain.domain,
          currencySettings: updatedDomain.currency_settings
        },
        message: `Currency settings for ${currencyCode} updated successfully`
      })
    } catch (error) {
      console.error('Error updating currency settings:', error)

      if (error.message.includes('Invalid currency code')) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: error.message
        })
      }

      if (error.message.includes('Domain not found')) {
        return reply.status(404).send({
          error: 'Not Found',
          message: error.message
        })
      }

      if (error.message.includes('must be') || error.message.includes('cannot be')) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: error.message
        })
      }

      reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message
      })
    }
  })

  /**
   * DELETE /api/admin/domain/:domainId
   * Delete a domain and all its users
   */
  fastify.delete('/domain/:domainId', {
    preHandler: authenticateAdmin
  }, async (req, reply) => {
    try {
      const { domainId } = req.params

      await domainService.deleteDomain(domainId)

      reply.send({
        success: true,
        message: 'Domain and all associated data deleted successfully'
      })
    } catch (error) {
      console.error('Error deleting domain:', error)
      reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message
      })
    }
  })
}

module.exports = adminRoutes
