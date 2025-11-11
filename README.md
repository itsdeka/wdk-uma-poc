# UMA Multi-Chain Payment Backend - Proof of Concept

A TypeScript-based minimal UMA (Universal Money Address) backend service that bridges Lightning Network payments with multi-chain crypto addresses.

## 🎯 Project Overview

This proof of concept implements a **UMA-compliant backend service** that:
- Creates Lightning Network invoices with embedded Spark addresses using the [Spark SDK](https://www.npmjs.com/package/@buildonspark/spark-sdk)
- Extends the UMA protocol by including multi-chain cryptocurrency addresses in the `payeeData` field
- Enables instant Spark-to-Spark transfers when both parties are Spark users
- Maintains 100% compliance with the [UMA standard](https://github.com/uma-universal-money-address/protocol)

## 💡 The Innovation

While standard UMA implementations focus on Lightning Network payments, this POC extends the protocol by leveraging the `payeeData` field to return a comprehensive list of payment addresses across multiple blockchain networks:

- **EVM Chains**: Ethereum, Polygon, Arbitrum, Optimism, Base, etc.
- **Solana**: Native Solana addresses
- **Other Chains**: Bitcoin, Cosmos, etc. (extensible)

This allows a single UMA address to serve as a universal payment endpoint for both Lightning Network and various blockchain networks.

## 🏗️ Architecture

```
UMA Request (LNURL-Pay)
         ↓
   UMA Backend Service
         ↓
    ┌────┴────┐
    ↓         ↓
Lightning   Multi-Chain
 Address     Addresses
    ↓         ↓
  Invoice + PayeeData
```
## 🚀 Getting Started

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd wdk-uma-poc

# Install dependencies
npm install
```

### Add Users

Add a new user with default multi-chain addresses:

```bash
# Interactive mode
npm run add-user

# With username
npm run add-user bob

# With username and display name
npm run add-user bob "Bob Johnson"

# Or use the bash script directly
./scripts/add-user.sh alice "Alice Smith"
```

This will create a user with default addresses for:
- Spark (identity pubkey)
- Ethereum, Polygon, Arbitrum, Optimism, Base
- Solana Mainnet

### Run Development Server

```bash
npm run dev
```

## 🔌 API Endpoints

### 1. UMA Lookup Endpoint (LNURL-pay Metadata)

**GET** `/.well-known/lnurlp/{username}`

Returns UMA configuration and supported currencies.

**Response:**
```json
{
  "callback": "https://yourdomain.com/.well-known/lnurlp/{username}",
  "maxSendable": 100000000,
  "minSendable": 1000,
  "metadata": "[[\"text/plain\", \"Pay to {username}\"]]",
  "currencies": [...],
  "payerData": {...},
  "umaVersion": "1.0",
  "commentAllowed": 255
}
```

### 2. UMA Pay Request Endpoint (Invoice Generation)

**GET** `/.well-known/lnurlp/{username}` (with query parameters)

Generates Lightning invoice and returns multi-chain addresses in `payeeData`.

**Parameters:**
- `amount`: Amount in millisatoshis
- `currency`: Currency code (optional)
- `nonce`: Unique request identifier

**Response:**
```json
{
  "pr": "lnbc...",
  "routes": [],
  "payeeData": {
    "chains": {
      "spark": {
        "address": "0250949ec35b022e3895fd37750102f94fe813523fa220108328a81790bf67ade5"
      },
      "ethereum": {
        "address": "0x...",
        "chainId": 1
      },
      "polygon": {
        "address": "0x...",
        "chainId": 137
      },
      "arbitrum": {
        "address": "0x...",
        "chainId": 42161
      },
      "optimism": {
        "address": "0x...",
        "chainId": 10
      },
      "base": {
        "address": "0x...",
        "chainId": 8453
      },
      "solana-mainnet": {
        "address": "..."
      }
    }
  },
  "disposable": false,
  "successAction": {
    "tag": "message",
    "message": "Payment received!"
  }
}
```

## 🔐 UMA Standard Compliance

This implementation strictly adheres to the UMA protocol specification:

1. ✅ Implements required LNURL-Pay endpoints
2. ✅ Returns proper metadata and callback URLs
3. ✅ Handles currency conversions
4. ✅ Supports payer data collection
5. ✅ Generates valid Lightning invoices via Spark
6. ✅ Uses `payeeData` field for additional payment options (spec-compliant extension)

The `payeeData` field is used as an extension point, which is allowed by the UMA specification for additional payment metadata.

## 📝 Implementation Details

### UMA Callback Flow

1. Sender queries `/.well-known/lnurlp/{username}` (initial lookup)
2. Backend returns callback URL (same endpoint) and metadata
3. Sender makes second request to `/.well-known/lnurlp/{username}?amount=X&nonce=Y`
4. Backend generates Lightning invoice via Spark SDK with embedded Spark address
5. Backend includes multi-chain addresses (including Spark identity) in `payeeData`
6. Sender chooses payment method:
   - **Spark-to-Spark transfer** (instant, low-cost, via embedded address)
   - **Lightning Network** (traditional bolt11 payment)
   - **On-chain** (any of the supported blockchain networks)
7. Payment is executed on chosen network

### Spark Integration

The Lightning invoice includes an embedded **Spark address** in the fallback field, enabling:
- **Instant Spark-to-Spark transfers** when both parties are Spark users
- Automatic fallback to standard Lightning payment if not
- The Spark identity pubkey (33 bytes) is stored as a regular chain address (chain_name='spark')
- Invoice generation uses `includeSparkAddress=true` and optionally `receiverIdentityPubkey`

## 🧪 Testing

### Run Integration Tests

```bash
npm test
```

This will:
- Clean up any existing test database
- Initialize a fresh database
- Create a test user with multi-chain addresses
- Test UMA lookup and pay responses
- Verify invoice generation and address formatting
- Test error handling and database constraints

### Manual API Testing

```bash
# Test UMA lookup endpoint
curl http://localhost:3000/.well-known/lnurlp/alice

# Test pay request (same endpoint with query parameters)
curl "http://localhost:3000/.well-known/lnurlp/alice?amount=1000&nonce=abc123"
```

