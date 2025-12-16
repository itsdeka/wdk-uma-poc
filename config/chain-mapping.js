const chainMapping = {
  spark: { layer: 'spark', asset: 'BTC' },
  lightning: { layer: 'ln', asset: 'BTC' },
  ethereum: { layer: 'ethereum', asset: 'USDT', chainId : 1 },
  polygon: { layer: 'polygon', asset: 'USDT', chainId : 137 },
  arbitrum: { layer: 'arbitrum', asset: 'USDT', chainId : 42161 },
  optimism: { layer: 'optimism', asset: 'USDT', chainId : 10},
  base: { layer: 'base', asset: 'USDT', chainId : 8453 },
  solana: { layer: 'solana', asset: 'USDT' },
  plasma: { layer: 'plasma', asset: 'USDT' }
}

module.exports = chainMapping
