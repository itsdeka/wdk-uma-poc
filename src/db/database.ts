import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const DB_PATH = process.env.DB_PATH || './data/uma.db';

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
export const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Check if database is initialized (has tables)
function isDatabaseInitialized(): boolean {
  try {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='users'
    `).get();
    return tables !== undefined;
  } catch {
    return false;
  }
}

// Initialize schema
export function initializeDatabase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  
  db.exec(schema);
  console.log('Database initialized successfully');
}

// Auto-initialize database if tables don't exist
if (!isDatabaseInitialized()) {
  console.log('Database tables not found, initializing...');
  initializeDatabase();
}

// User operations
export interface User {
  id?: number;
  username: string;
  display_name?: string;
  created_at?: string;
}

export interface ChainAddress {
  id?: number;
  user_id: number;
  chain_name: string;
  address: string;
  created_at?: string;
}

export interface PaymentRequest {
  id?: number;
  user_id: number;
  nonce: string;
  amount_msats: number;
  currency?: string;
  invoice?: string;
  created_at?: string;
}

// User queries
export const userQueries = {
  create: db.prepare(
    'INSERT INTO users (username, display_name) VALUES (?, ?)'
  ),
  findByUsername: db.prepare(
    'SELECT * FROM users WHERE username = ?'
  ),
  getAll: db.prepare('SELECT * FROM users'),
};

// Chain address queries
export const addressQueries = {
  create: db.prepare(
    'INSERT INTO chain_addresses (user_id, chain_name, address) VALUES (?, ?, ?)'
  ),
  findByUserId: db.prepare(
    'SELECT * FROM chain_addresses WHERE user_id = ?'
  ),
  deleteByUserId: db.prepare(
    'DELETE FROM chain_addresses WHERE user_id = ?'
  ),
};

// Payment request queries
export const paymentQueries = {
  create: db.prepare(
    'INSERT INTO payment_requests (user_id, nonce, amount_msats, currency, invoice) VALUES (?, ?, ?, ?, ?)'
  ),
  findByNonce: db.prepare(
    'SELECT * FROM payment_requests WHERE nonce = ?'
  ),
};

export default db;

