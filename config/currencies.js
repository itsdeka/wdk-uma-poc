
const VALID_DOMAIN_CURRENCIES = ['BTC', 'USDT_POLYGON', 'USDT_SOLANA', 'USDT_TRON', 'USDT_ETH', 'USD']

const currencies = {
  USD: {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    decimals: 2,
    defaultLimits : {
      minSendable : 1,
      maxSendable : 100000
    }
  },
  BTC: {
    code: 'BTC',
    name: 'Bitcoin',
    symbol: '₿',
    decimals: 8,
    defaultLimits: {
      minSendable: 1000,
      maxSendable: 100000000
    }
  },
  USDT: {
    code: 'USDT',
    name: 'Tether USD',
    symbol: '₮',
    decimals: 6,
    defaultLimits : {
      minSendable : 1,
      maxSendable : 100000
    }

  }
}

module.exports = currencies
module.exports.VALID_DOMAIN_CURRENCIES = VALID_DOMAIN_CURRENCIES
