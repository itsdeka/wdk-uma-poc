#!/usr/bin/env node

require('dotenv').config()
const { initializeDatabase } = require('./src/db/database')
const { domainService } = require('./src/services/domains')
const { userService } = require('./src/services/users')

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--help' || arg === '-h') {
      showHelp()
      process.exit(0)
    }

    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const value = args[i + 1]

      if (!value || value.startsWith('--')) {
        console.error(`Error: Missing value for --${key}`)
        process.exit(1)
      }

      options[key] = value
      i++ // Skip the value in next iteration
    } else {
      console.error(`Error: Unknown argument: ${arg}`)
      console.error('Use --help for usage information')
      process.exit(1)
    }
  }

  return options
}

function showHelp() {
  console.log(`
UMA User CLI - Add users manually to the system

USAGE:
  node cli.js [options]

OPTIONS:
  --domain <domain>          Domain name (e.g., example.com) [required]
  --username <username>      Username for the UMA address [required]
  --spark-key <key>          Spark public key for Lightning payments [required]
  --evm-address <address>    EVM address for blockchain payments [required]
  --display-name <name>      Optional display name for the user
  --help, -h                 Show this help message

EXAMPLES:
  # Add a user with minimal required fields
  node cli.js --domain example.com --username alice --spark-key abc123... --evm-address 0x1234...

  # Add a user with display name
  node cli.js --domain example.com --username bob --spark-key def456... --evm-address 0x5678... --display-name "Bob Smith"

NOTES:
  - The domain will be created automatically if it doesn't exist
  - Spark public key is required for Lightning Network payments
  - EVM address is required for blockchain settlements (Polygon, Ethereum, etc.)
  - Username must be unique within the domain and follow format: lowercase letters, numbers, underscores, hyphens (1-64 chars)
`)
}

async function main() {
  try {
    const options = parseArgs()

    // Validate required arguments
    const required = ['domain', 'username', 'spark-key', 'evm-address']
    const missing = required.filter(key => !options[key])

    if (missing.length > 0) {
      console.error('Error: Missing required arguments:', missing.join(', '))
      console.error('Use --help for usage information')
      process.exit(1)
    }

    const {
      domain: domainName,
      username,
      'spark-key': sparkPublicKey,
      'evm-address': evmAddress,
      'display-name': displayName
    } = options

    console.log('🚀 UMA User CLI')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`📧 Domain: ${domainName}`)
    console.log(`👤 Username: ${username}`)
    console.log(`⚡ Spark Key: ${sparkPublicKey.substring(0, 20)}...`)
    console.log(`🔗 EVM Address: ${evmAddress}`)
    if (displayName) {
      console.log(`📝 Display Name: ${displayName}`)
    }
    console.log('')

    // Initialize database
    console.log('📊 Initializing database...')
    await initializeDatabase()
    console.log('✅ Database initialized')
    console.log('')

    // Check if domain exists, create if not
    console.log(`🔍 Checking domain: ${domainName}`)
    let domain = await domainService.getDomainByName(domainName)

    if (!domain) {
      console.log(`📝 Creating domain: ${domainName}`)
      const domainResult = await domainService.createDomain({
        domain: domainName,
        ownerEmail: `admin@${domainName}`,
        isDefault: false
      })
      domain = domainResult.domain
      console.log(`✅ Domain created with ID: ${domain._id}`)
    } else {
      console.log(`✅ Domain exists with ID: ${domain._id}`)
    }
    console.log('')

    // Check if user already exists
    console.log(`🔍 Checking if user exists: ${username}@${domainName}`)
    const existingUser = await userService.getUserByUsernameAndDomain(username, domain._id)

    if (existingUser) {
      console.error(`❌ Error: User "${username}" already exists in domain "${domainName}"`)
      process.exit(1)
    }

    // Create the user
    console.log(`👤 Creating user: ${username}@${domainName}`)
    const userResult = await userService.createUser({
      username,
      domainId: domain._id,
      displayName: displayName || username,
      sparkPublicKey,
      addresses: {
        polygon: evmAddress, // Use polygon as the primary EVM address
        ethereum: evmAddress // Also set ethereum to the same address for now
      }
    })

    // Get the complete user with addresses
    const completeUser = await userService.enrichUserWithAddresses(userResult)

    console.log('✅ User created successfully!')
    console.log('')
    console.log('📋 User Details:')
    console.log(`   ID: ${completeUser._id}`)
    console.log(`   UMA Address: ${username}@${domainName}`)
    console.log(`   Display Name: ${completeUser.display_name}`)
    console.log(`   Spark Public Key: ${completeUser.spark_public_key ? '✅ Set' : '❌ Not set'}`)
    console.log(`   EVM Addresses: ${Object.keys(completeUser.addresses || {}).length} configured`)
    console.log(`   Created: ${completeUser.created_at}`)
    console.log('')
    console.log('🎉 User is now ready to receive UMA payments!')
    console.log(`   Test with: curl "http://localhost:3000/.well-known/lnurlp/${username}"`)

  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.message.includes('Invalid username format')) {
      console.error('')
      console.error('💡 Username format: lowercase letters, numbers, underscores, and hyphens only (1-64 characters)')
    }
    process.exit(1)
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason)
  process.exit(1)
})

// Run the CLI
if (require.main === module) {
  main()
}

module.exports = { main, parseArgs, showHelp }
