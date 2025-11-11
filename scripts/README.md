# Scripts

Utility scripts for managing the UMA backend.

## Add User Script

Add a new user to the database with default multi-chain addresses.

### Usage

**Interactive mode** (prompts for input):
```bash
npm run add-user
```

**With username only**:
```bash
npm run add-user alice
```

**With username and display name**:
```bash
npm run add-user alice "Alice Smith"
```

**Using bash script directly**:
```bash
./scripts/add-user.sh bob "Bob Johnson"
```

### What It Does

1. Creates a new user in the database
2. Adds default addresses for the following chains:
   - **Spark** - Identity pubkey for Spark-to-Spark transfers
   - **Ethereum** - Mainnet (chainId: 1)
   - **Polygon** - Matic Network (chainId: 137)
   - **Arbitrum** - Arbitrum One (chainId: 42161)
   - **Optimism** - Optimism (chainId: 10)
   - **Base** - Base (chainId: 8453)
   - **Solana** - Solana Mainnet
3. Displays the UMA address and endpoint

### Example Output

```
════════════════════════════════════════════
  UMA Backend - Add User
════════════════════════════════════════════

Enter username: alice
Enter display name (or press Enter for "alice"): Alice Smith

─────────────────────────────────────────
Creating user...
─────────────────────────────────────────

✓ User created successfully!
  ID: 2
  Username: alice
  Display Name: Alice Smith

─────────────────────────────────────────
Adding default chain addresses...
─────────────────────────────────────────

✓ spark                Spark Identity (33-byte compressed pubkey)
  0250949ec35b022e3895fd37750102f94fe813523fa220108328...
✓ ethereum             Ethereum Mainnet
  0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
✓ polygon              Polygon (Matic)
  0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
...

════════════════════════════════════════════
  ✓ User Created Successfully!
════════════════════════════════════════════

UMA Address:
  alice@localhost:3000

UMA Endpoint:
  http://localhost:3000/.well-known/lnurlp/alice
```

### Customizing Default Addresses

To customize the default addresses, edit `scripts/add-user.ts` and modify the `DEFAULT_ADDRESSES` array:

```typescript
const DEFAULT_ADDRESSES = [
  {
    chain_name: 'spark',
    address: 'your_spark_pubkey_here',
    description: 'Spark Identity',
  },
  {
    chain_name: 'ethereum',
    address: '0xYourEthereumAddress',
    description: 'Ethereum Mainnet',
  },
  // Add more chains...
];
```

### Error Handling

The script will:
- ✗ Prevent duplicate usernames
- ✗ Require a username (cannot be empty)
- ✗ Show errors if address creation fails
- ✓ Validate user input

