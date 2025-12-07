# UMA Microservice

A minimal, production-ready microservice for Universal Money Address (UMA) domain and user registry. Supports Lightning Network payments and multi-chain settlements (Polygon, Ethereum, Arbitrum, Optimism, Base, Solana, Plasma).

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [API Documentation](#api-documentation)
- [Integration Guide](#integration-guide)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## 🔧 Quick Start

### Prerequisites

- Node.js 16+
- MongoDB 4.4+
- Spark Wallet (optional, for Lightning payments)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd uma-microservice

# Install dependencies
npm install

# Copy environment configuration
cp env.example .env

# Edit .env with your configuration
nano .env

# Initialize database
npm run db:init

# Start the service
npm start

# Use the CLI to add users manually
npm run cli -- --domain example.com --username alice --spark-key your-spark-public-key --evm-address 0x1234...
```

### Basic Usage

```bash
# Check service health
curl http://localhost:3000/health

# Get API information
curl http://localhost:3000/

# View Swagger documentation
open http://localhost:3000/documentation
```

### Adding Users with CLI

Use the built-in CLI to add users manually:

```bash
# Add a user with required fields
npm run cli -- --domain example.com --username alice --spark-key abc123def456... --evm-address 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

# Add a user with display name
npm run cli -- --domain example.com --username bob --spark-key def456ghi789... --evm-address 0x123456789abcdef --display-name "Bob Smith"

# Get help
npm run cli -- --help
```

The CLI will:
- Create the domain if it doesn't exist
- Validate all input parameters
- Create the user with Spark public key and EVM address
- Display the created user's UMA address

## 🏗️ Architecture

### Overview

This microservice provides UMA (Universal Money Address) functionality as a standalone service that can be integrated into larger applications. It handles:

1. **Domain Management** - Register and manage domains for UMA addresses
2. **User Registry** - Create and manage users within domains
3. **UMA Protocol** - Handle LNURL requests for payment lookups and execution
4. **Multi-chain Payments** - Support for Lightning, Polygon, Ethereum, Arbitrum, Optimism, Base, Solana, and Plasma settlement layers

### Key Components

```
├── src/
│   ├── server.js          # Fastify server with Swagger docs
│   ├── routes/admin.js    # Domain and user management APIs
│   ├── services/          # Business logic
│   │   ├── domains.js     # Domain operations
│   │   ├── users.js       # User operations
│   │   ├── uma.js         # UMA protocol handling
│   │   └── payments.js    # Payment request management
│   └── db/                # Database layer
│       ├── database.js    # MongoDB connection & utilities
│       └── init.js        # Database initialization
```

## 📚 API Documentation

### Swagger UI

Interactive API documentation is available at `/documentation` when the service is running:

```
http://localhost:3000/documentation
```

### Core Endpoints

#### UMA Protocol Endpoints

```http
# Lookup user and get payment options
GET /.well-known/lnurlp/{username}

# Request payment with specific amount
GET /.well-known/lnurlp/{username}?amount=1000&nonce=optional&settlementLayer=polygon
```

#### Admin Endpoints

```http
# Domain management
POST /api/admin/domains                    # Create domain
GET  /api/admin/domains                    # List domains
GET  /api/admin/domains/{domainId}         # Get domain details
DELETE /api/admin/domains/{domainId}       # Delete domain

# User management
GET  /api/admin/users/{domainId}           # List domain users
POST /api/admin/users/{domainId}           # Create user
DELETE /api/admin/users/{domainId}/{username}  # Delete user

# Service endpoints
GET  /health                               # Health check
GET  /                                     # API information
```

## 🔗 Integration Guide

### Backend Integration Pattern

This microservice is designed to be called from your main backend application. Here's the recommended integration pattern:

```javascript
// In your main backend application

class PaymentService {
  constructor() {
    this.umaServiceUrl = process.env.UMA_SERVICE_URL;
  }

  // Handle UMA address resolution
  async resolveUmaAddress(umaAddress) {
    // Parse umaAddress (e.g., "alice@example.com")
    const [username, domain] = umaAddress.split('@');

    // Call UMA microservice for lookup
    const lookupUrl = `${this.umaServiceUrl}/.well-known/lnurlp/${username}`;
    const lookupResponse = await fetch(lookupUrl);

    if (!lookupResponse.ok) {
      throw new Error('UMA address not found');
    }

    const lnurlData = await lookupResponse.json();
    return lnurlData;
  }

  // Create payment request
  async createPayment(umaAddress, amountMsats, options = {}) {
    const [username, domain] = umaAddress.split('@');

    const params = new URLSearchParams({
      amount: amountMsats.toString(),
      currency: options.currency || 'USD',
      settlementLayer: options.settlementLayer || 'polygon'
    });

    if (options.nonce) {
      params.append('nonce', options.nonce);
    }

    const payUrl = `${this.umaServiceUrl}/.well-known/lnurlp/${username}?${params}`;
    const payResponse = await fetch(payUrl);

    if (!payResponse.ok) {
      const error = await payResponse.json();
      throw new Error(error.reason || 'Payment request failed');
    }

    return await payResponse.json();
  }

  // Domain and user management
  async setupUmaDomain(domain, ownerEmail) {
    const response = await fetch(`${this.umaServiceUrl}/api/admin/domains`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain,
        ownerEmail,
        isDefault: false
      })
    });

    if (!response.ok) {
      throw new Error('Failed to create domain');
    }

    return await response.json();
  }

  async createUmaUser(domainId, username, options = {}) {
    const response = await fetch(`${this.umaServiceUrl}/api/admin/users/${domainId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        displayName: options.displayName,
        addresses: options.addresses || {},
        sparkPublicKey: options.sparkPublicKey
      })
    });

    if (!response.ok) {
      throw new Error('Failed to create user');
    }

    return await response.json();
  }
}
```

### Example Integration Flow

```javascript
// 1. Setup domain (one-time)
const domainResult = await paymentService.setupUmaDomain('example.com', 'admin@example.com');
const domainId = domainResult.domain.id;

// 2. Create users
await paymentService.createUmaUser(domainId, 'alice', {
  displayName: 'Alice Smith',
  addresses: {
    polygon: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    lightning: 'lnbc1000n1pj9x3z0pp5...'
  },
  sparkPublicKey: 'optional-spark-key-for-lightning'
});

// 3. Handle payments
const lnurlData = await paymentService.resolveUmaAddress('alice@example.com');
// Returns LNURL data with payment options

const paymentRequest = await paymentService.createPayment('alice@example.com', 1000000, {
  settlementLayer: 'polygon',
  currency: 'USD'
});
// Returns payment details with blockchain address or Lightning invoice
```

### Error Handling

The microservice returns structured error responses:

```javascript
// Successful responses
{ success: true, data: {...} }

// Error responses
{
  error: 'Bad Request',
  message: 'Username is required'
}

// UMA protocol errors
{
  status: 'ERROR',
  reason: 'User not found'
}
```

### Authentication & Authorization

**Important**: This microservice does NOT handle authentication or authorization. It assumes your backend has already:

1. **Authenticated** the user making requests
2. **Authorized** the user to perform the requested operations
3. **Validated** input data

Your backend should:

```javascript
// Example middleware in your main app
async function umaProxyMiddleware(req, res) {
  // 1. Authenticate user
  const user = await authenticateUser(req);

  // 2. Authorize action
  if (req.method === 'POST' && req.path.includes('/users/')) {
    await authorizeDomainAccess(user, req.params.domainId);
  }

  // 3. Proxy to UMA microservice
  const umaResponse = await proxyToUmaService(req);
  res.send(umaResponse);
}
```

## ⚙️ Configuration

### Environment Variables

```bash
# Server Configuration
PORT=3000
BASE_URL=http://localhost:3000

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/uma-service
DB_NAME=uma-service

# Spark Wallet Configuration (Optional)
SPARK_SEED="your-spark-seed-here"
```

### Domain Configuration

- **Multi-tenant mode**: Create separate domains for different businesses
- **Self-hosted mode**: Use `isDefault: true` for single-domain deployments
- **Domain verification**: Not required - domains are created instantly

### Spark Wallet Setup (Optional)

For Lightning Network payments, configure Spark:

```bash
# Install Spark
# Configure SPARK_SEED in .env
# Users can optionally provide sparkPublicKey for Lightning invoices
```

### Production Considerations

1. **Database**: Use MongoDB replica set for production
2. **Monitoring**: Implement health checks and metrics
3. **Scaling**: Service is stateless, can be horizontally scaled
4. **Security**: Run behind reverse proxy with TLS
5. **Backup**: Regular database backups

### Health Checks

```bash
# Health endpoint
curl https://your-domain.com/health

# Expected response
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
node tests/database.test.js
```

### Test Coverage

The service includes comprehensive test coverage:

- **Unit tests** for all services and utilities
- **Integration tests** for end-to-end UMA flows
- **Error handling** and edge case testing
- **Database operations** testing

## 🔧 Troubleshooting

### Common Issues

#### MongoDB Connection Issues

```bash
# Check MongoDB status
mongosh --eval "db.adminCommand('ismaster')"

# Reset database
npm run db:init
```

#### Spark Wallet Issues

```bash
# Verify Spark configuration
curl http://localhost:3000/health

# Check Spark logs
# Ensure SPARK_SEED is correctly set
```

#### Domain Resolution Issues

```bash
# Test domain lookup
curl "http://localhost:3000/.well-known/lnurlp/testuser"

# Check domain exists
curl "http://localhost:3000/api/admin/domains"
```

### Debug Mode

Enable debug logging:

```bash
DEBUG=* npm start
```

### Logs

Check application logs for errors:

```bash
# Server logs are output to console
# Check for MongoDB connection errors
# Verify environment variables are loaded
```
