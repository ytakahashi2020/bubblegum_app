'use client'

import { useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { clusterApiUrl } from '@solana/web3.js'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets'

import '@solana/wallet-adapter-react-ui/styles.css'

export default function Providers({ children }: { children: React.ReactNode }) {
  const network = WalletAdapterNetwork.Devnet
  const endpoint = useMemo(() => {
    const heliusUrl = process.env.NEXT_PUBLIC_HELIUS_RPC_URL
    const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY
    return heliusUrl && apiKey ? `${heliusUrl}/?api-key=${apiKey}` : clusterApiUrl(network)
  }, [network])
  
  const wallets = useMemo(
    () => [new PhantomWalletAdapter()],
    []
  )

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}