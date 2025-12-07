const { initializeDatabase } = require('./database')

async function main () {
  try {
    // Initialize database with collections and indexes
    await initializeDatabase()

    console.log('Database initialization complete!')
  } catch (error) {
    console.error('Database initialization failed:', error)
    process.exit(1)
  }
}

main()
