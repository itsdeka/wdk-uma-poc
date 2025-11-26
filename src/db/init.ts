import { initializeDatabase, userQueries, addressQueries } from './database';

// Initialize database with schema
initializeDatabase();

// Seed with example user data
const exampleUser = userQueries.findByUsername.get('alice') as any;

if (!exampleUser) {
  console.log('Seeding example user data...');
  
  // Create example user
  const result = userQueries.create.run('alice', 'Alice Smith');
  const userId = result.lastInsertRowid as number;
  
  // Add example addresses
  const exampleAddresses = [
    { chain_name: 'spark', address: '0250949ec35b022e3895fd37750102f94fe813523fa220108328a81790bf67ade5' },
    { chain_name: 'ethereum', address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb' },
    { chain_name: 'polygon', address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb' },
    { chain_name: 'arbitrum', address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb' },
    { chain_name: 'optimism', address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb' },
    { chain_name: 'base', address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb' },
    { chain_name: 'solana', address: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK' },
  ];
  
  for (const addr of exampleAddresses) {
    addressQueries.create.run(userId, addr.chain_name, addr.address);
  }
  
  console.log('Example user "alice" created with multi-chain addresses');
} else {
  console.log('Database already seeded');
}

console.log('Database initialization complete!');

