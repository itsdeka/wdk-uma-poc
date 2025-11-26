import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { initializeDatabase } from './db/database';
import { createUmaService } from './services/umaService';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize database
initializeDatabase();
console.log('✅ Database initialized');

// Create UMA service
const umaService = createUmaService(BASE_URL);

/**
 * UMA Endpoint - Handles both lookup and pay requests
 * GET /.well-known/lnurlp/:username
 * 
 * Without amount parameter: Returns UMA lookup response
 * With amount parameter: Returns UMA pay response (with invoice)
 */
app.get('/.well-known/lnurlp/:username', async (req: Request, res: Response) => {
  const { username } = req.params;
  const { amount, nonce, currency, settlementLayer, assetIdentifier } = req.query;

  try {
    // Case 1: Lookup request (no amount parameter)
    if (!amount) {
      const lookupResponse = umaService.generateLookupResponse(username);
      
      if (!lookupResponse) {
        return res.status(404).json({
          status: 'ERROR',
          reason: 'User not found',
        });
      }

      return res.json(lookupResponse);
    }

    // Case 2: Pay request (with amount parameter)
    if (!nonce) {
      return res.status(400).json({
        status: 'ERROR',
        reason: 'Missing required parameter: nonce',
      });
    }

    const amountMsats = parseInt(amount as string, 10);
    if (isNaN(amountMsats) || amountMsats <= 0) {
      return res.status(400).json({
        status: 'ERROR',
        reason: 'Invalid amount',
      });
    }

    const payResponse = await umaService.generatePayResponse(
      username,
      amountMsats,
      nonce as string,
      currency as string | undefined,
      settlementLayer as string | undefined,
      assetIdentifier as string | undefined
    );

    if (!payResponse) {
      return res.status(404).json({
        status: 'ERROR',
        reason: 'User not found',
      });
    }

    return res.json(payResponse);
  } catch (error: any) {
    console.error('Error handling UMA request:', error);
    
    // Handle duplicate nonce error
    if (error.message === 'DUPLICATE_NONCE') {
      return res.status(409).json({
        status: 'ERROR',
        reason: 'Duplicate payment request. This nonce has already been used.',
      });
    }
    
    // Handle invalid settlement layer
    if (error.message?.includes('Address not found for settlement layer')) {
      return res.status(400).json({
        status: 'ERROR',
        reason: 'Unsupported or invalid settlement layer. Check available settlement options from the lookup endpoint.',
      });
    }
    
    return res.status(500).json({
      status: 'ERROR',
      reason: 'Internal server error',
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Root endpoint - API information
 */
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'UMA Multi-Chain Payment Backend',
    version: '1.0.0',
    description: 'A minimal UMA-compliant backend service with multi-chain support',
    endpoints: {
      uma_lookup: '/.well-known/lnurlp/{username}',
      uma_pay: '/.well-known/lnurlp/{username}?amount=1000&nonce=abc123',
      health: '/health',
    },
    documentation: 'https://github.com/uma-universal-money-address/protocol',
  });
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('🚀 UMA Multi-Chain Payment Backend');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 Server running on: ${BASE_URL}`);
  console.log(`🔗 UMA endpoint: ${BASE_URL}/.well-known/lnurlp/{username}`);
  console.log('');
  console.log('Example requests:');
  console.log(`  Lookup: curl ${BASE_URL}/.well-known/lnurlp/alice`);
  console.log(`  Pay:    curl "${BASE_URL}/.well-known/lnurlp/alice?amount=1000&nonce=test123"`);
  console.log(`  Pay (with settlement): curl "${BASE_URL}/.well-known/lnurlp/alice?amount=1000&currency=USD&nonce=test123&settlementLayer=polygon&assetIdentifier=USDT_POLYGON"`);
  console.log('');
});

