'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((mod) => ({ default: mod.WalletMultiButton })),
  { ssr: false }
)
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { Loader2, Zap, Globe, StopCircle, ExternalLink, Youtube, Twitter } from 'lucide-react'
import { 
  createMerkleTree, 
  createCollectionNft, 
  mintCompressedNfts, 
  calculateTotalCost,
  getCompressedNftsByOwner 
} from '@/lib/bubblegum'
import {
  setupUmiWithCliWallet,
  createCompressedNftTree,
  mintMultipleCompressedNfts,
  verifyCompressedNfts,
  calculateBubblegumCost
} from '@/lib/bubblegumV2'
import { useTranslation, formatMessage, type Language } from '@/lib/i18n'
import { PublicKey } from '@solana/web3.js'

export default function Home() {
  const { publicKey, wallet, signTransaction, signAllTransactions } = useWallet()
  const { connection } = useConnection()
  const [language, setLanguage] = useState<Language>('en')
  const t = useTranslation(language)
  
  const [nftName, setNftName] = useState('Test')
  const [quantity, setQuantity] = useState<10 | 100 | 1000 | 10000>(10)
  const [isLoading, setIsLoading] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const shouldStopRef = useRef(false)
  
  const [transactionResult, setTransactionResult] = useState<{
    totalCost: number
    merkleTree: string
    collectionMint: string
  } | null>(null)
  const [showVerification, setShowVerification] = useState(false)
  const [verificationData, setVerificationData] = useState<Array<{id?: string; content?: {metadata?: {name?: string}}}>>([])
  const [isVerifying, setIsVerifying] = useState(false)
  const [mintProgress, setMintProgress] = useState({ current: 0, total: 0 })
  const [useLocalWallet, setUseLocalWallet] = useState(false)
  const [localWalletInfo, setLocalWalletInfo] = useState<{address: string; balance: number} | null>(null)
  const [showTimeWarning, setShowTimeWarning] = useState(false)

  // 残高チェック（10秒ごと）
  useEffect(() => {
    if (!localWalletInfo?.address) return

    const checkBalance = async () => {
      try {
        const response = await fetch('/api/solana-keypair', { method: 'POST' })
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.keypair) {
            const { Keypair } = await import('@solana/web3.js')
            const keypair = Keypair.fromSecretKey(new Uint8Array(data.keypair))
            const balance = await connection.getBalance(keypair.publicKey)
            setLocalWalletInfo(prev => prev ? { ...prev, balance: balance / 1e9 } : null)
          }
        }
      } catch (error) {
        console.error('Error checking balance:', error)
      }
    }

    const interval = setInterval(checkBalance, 10000) // 10秒ごと
    return () => clearInterval(interval)
  }, [localWalletInfo?.address, connection])

  const handleLoadSolanaCliWallet = async () => {
    try {
      const result = await setupUmiWithCliWallet(connection)
      
      if (!result) {
        alert(t.loadingFailed)
        return
      }
      
      const { address, keypair } = result
      
      // 残高確認
      const balance = await connection.getBalance(keypair.publicKey)
      
      setLocalWalletInfo({
        address,
        balance: balance / 1e9
      })
      
      alert(`${t.walletLoaded}\n${t.address}: ${address.slice(0, 20)}...\n${t.balance}: ${(balance / 1e9).toFixed(4)} SOL`)
    } catch (error) {
      console.error('Error loading Solana CLI wallet:', error)
      alert(t.loadingFailed)
    }
  }

  const handleTimeWarningConfirm = () => {
    setShowTimeWarning(false)
    handleMintNFTsLocal()
  }

  const handleMintNFTs = async () => {
    if (useLocalWallet) {
      // 100以上の場合は時間警告を表示
      if (quantity >= 100) {
        // const estimatedMinutes = Math.ceil(quantity * 0.5 / 60) // 0.5秒/NFTの概算
        setShowTimeWarning(true)
        return
      }
      return handleMintNFTsLocal()
    }

    if (!publicKey || !wallet || !signTransaction || !signAllTransactions) {
      alert('Please connect your wallet')
      return
    }

    setIsLoading(true)
    try {
      const estimatedCost = await calculateTotalCost(connection, quantity)
      
      const walletAdapter = {
        publicKey,
        signTransaction,
        signAllTransactions
      }
      
      const { umi, merkleTree } = await createMerkleTree(walletAdapter as unknown as import('@solana/wallet-adapter-base').BaseWalletAdapter, connection)
      const collectionMint = await createCollectionNft(umi, `${nftName} Collection`)
      
      setMintProgress({ current: 0, total: quantity })
      await mintCompressedNfts(
        umi,
        merkleTree,
        collectionMint,
        nftName,
        quantity,
        (current, total) => {
          setMintProgress({ current, total })
        }
      )

      setTransactionResult({
        totalCost: estimatedCost,
        merkleTree: merkleTree.publicKey.toString(),
        collectionMint: collectionMint.publicKey.toString()
      })
      
      alert(`Total cost: ${estimatedCost.toFixed(4)} SOL`)
    } catch (error) {
      console.error('Error minting NFTs:', error)
      alert(`${t.error}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsLoading(false)
      setMintProgress({ current: 0, total: 0 })
    }
  }

  const handleMintNFTsLocal = async () => {
    setIsLoading(true)
    shouldStopRef.current = false
    setIsStopping(false)
    
    try {
      const result = await setupUmiWithCliWallet(connection)
      
      if (!result) {
        alert(t.localWalletNotReady)
        setIsLoading(false)
        return
      }
      
      const { umi } = result
      
      console.log('🌳 Creating Merkle Tree...')
      const merkleTree = await createCompressedNftTree(umi, 10, 32)
      
      console.log('🎨 Starting bulk mint...')
      setMintProgress({ current: 0, total: quantity })
      const { mintedCount, signatures } = await mintMultipleCompressedNfts(
        umi,
        merkleTree,
        nftName,
        quantity,
        (current, total) => {
          setMintProgress({ current, total })
        },
        () => shouldStopRef.current
      )

      const estimatedCost = calculateBubblegumCost(quantity)
      
      setTransactionResult({
        totalCost: estimatedCost,
        merkleTree: merkleTree.publicKey.toString(),
        collectionMint: ''
      })
      
      if (!shouldStopRef.current) {
        console.log('🔍 Starting verification...')
        setShowVerification(true)
        setIsVerifying(true)
        
        try {
          const verifiedNfts = await verifyCompressedNfts(umi, signatures.slice(0, 10))
          setVerificationData(verifiedNfts.map(nft => ({
            id: nft.id,
            content: { metadata: { name: nft.name } }
          })))
        } catch (verifyError) {
          console.error('Verification error:', verifyError)
        } finally {
          setIsVerifying(false)
        }
        
        alert(`🚀 ${mintedCount} NFTs created successfully!\nTotal cost: ${estimatedCost.toFixed(4)} SOL`)
      } else {
        alert(t.mintingStopped)
      }
    } catch (error) {
      console.error('Error minting NFTs with Solana CLI wallet:', error)
      alert(`${t.error}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsLoading(false)
      setMintProgress({ current: 0, total: 0 })
      shouldStopRef.current = false
      setIsStopping(false)
    }
  }

  const handleStopMinting = () => {
    shouldStopRef.current = true
    setIsStopping(true)
  }

  const handleVerifyNFTs = async () => {
    if (!transactionResult || !publicKey) return
    
    setShowVerification(true)
    setIsVerifying(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const assets = await getCompressedNftsByOwner(
        connection,
        publicKey,
        transactionResult.collectionMint ? new PublicKey(transactionResult.collectionMint) : undefined
      )
      
      setVerificationData(assets)
    } catch (error) {
      console.error('Error verifying NFTs:', error)
      alert('Error occurred while verifying NFTs.')
    } finally {
      setIsVerifying(false)
    }
  }

  const isQuantityDisabledForExternal = (qty: number) => {
    return !useLocalWallet && qty >= 100
  }

  const estimatedMinutes = quantity >= 100 ? Math.ceil(quantity * 0.5 / 60) : 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-purple-900">
      <div className="container mx-auto px-4 py-8">
        {/* ヘッダー */}
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              {t.title}
            </h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2">
              Powered by Solana Bubblegum Protocol
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setLanguage(language === 'en' ? 'ja' : 'en')}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Globe className="h-4 w-4" />
              {language === 'en' ? '日本語' : 'English'}
            </button>
            {!useLocalWallet && <WalletMultiButton />}
            {useLocalWallet && localWalletInfo && (
              <div className="text-sm text-gray-600 dark:text-gray-400 text-right bg-white dark:bg-gray-800 p-3 rounded-lg border">
                <div className="font-medium">{t.localWallet}</div>
                <div className="font-mono text-xs text-gray-500">{localWalletInfo.address.slice(0, 10)}...</div>
                <div className="font-semibold text-green-600">{localWalletInfo.balance.toFixed(4)} SOL</div>
              </div>
            )}
          </div>
        </header>

        <main className="max-w-4xl mx-auto">
          {/* ウォレット選択 */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-8 border border-gray-100 dark:border-gray-700">
            <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
              <Zap className="h-6 w-6 text-blue-500" />
              {t.walletSelection}
            </h2>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setUseLocalWallet(false)}
                  className={`p-6 rounded-xl font-medium transition-all duration-300 ${
                    !useLocalWallet
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg transform scale-105'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <div className="text-lg font-semibold">{t.externalWallet}</div>
                  <div className="text-sm opacity-90 mt-1">Phantom, Solflare, etc.</div>
                </button>
                <button
                  onClick={() => setUseLocalWallet(true)}
                  className={`p-6 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-3 ${
                    useLocalWallet
                      ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg transform scale-105'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <Zap className="h-5 w-5" />
                  <div>
                    <div className="text-lg font-semibold">{t.localWallet}</div>
                    <div className="text-sm opacity-90">Solana CLI</div>
                  </div>
                </button>
              </div>
              
              {useLocalWallet && (
                <div className="border-t border-gray-200 dark:border-gray-600 pt-6">
                  {!localWalletInfo ? (
                    <div className="text-center">
                      <p className="text-gray-600 dark:text-gray-400 mb-4">
                        {t.localWalletNotReady}
                      </p>
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6">
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                          <strong>{t.cliKeypairLocation}</strong><br/>
                          <strong>{t.cliKeypairCommand}</strong>
                        </p>
                      </div>
                      <button
                        onClick={handleLoadSolanaCliWallet}
                        className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-xl font-medium transition-all duration-300 shadow-lg hover:shadow-xl"
                      >
                        {t.loadCliKeypair}
                      </button>
                    </div>
                  ) : (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                        <Zap className="h-5 w-5" />
                        <span className="font-semibold">{t.localWalletReady}</span>
                      </div>
                      <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                        {t.noConfirmationDialogs}
                      </p>
                    </div>
                  )}
                </div>
              )}
              
              {!useLocalWallet && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    {t.externalWalletNote}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* NFT作成設定 */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-8 border border-gray-100 dark:border-gray-700">
            <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
              {t.nftCreationSettings}
            </h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  {t.nftNamePrefix}
                </label>
                <input
                  type="text"
                  value={nftName}
                  onChange={(e) => setNftName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white transition-all duration-300"
                  placeholder="Test"
                />
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {formatMessage(t.nftNameExample, { prefix: nftName })}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  {t.quantity}
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[10, 100, 1000, 10000].map((num) => {
                    const isDisabled = isQuantityDisabledForExternal(num)
                    
                    return (
                      <button
                        key={num}
                        onClick={() => !isDisabled && setQuantity(num as 10 | 100 | 1000 | 10000)}
                        disabled={isDisabled}
                        className={`px-6 py-4 rounded-xl font-semibold transition-all duration-300 ${
                          quantity === num && !isDisabled
                            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg transform scale-105'
                            : isDisabled
                            ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 hover:shadow-md'
                        }`}
                        title={isDisabled ? t.greyedOutReason : undefined}
                      >
                        <div className="text-center">
                          <div className="text-lg">{num.toLocaleString()}</div>
                          <div className="text-xs opacity-75 mt-1">
                            {isDisabled ? '❌' : t.minConfirmations}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={handleMintNFTs}
                  disabled={(!publicKey && !useLocalWallet) || (useLocalWallet && !localWalletInfo) || isLoading}
                  className="flex-1 py-4 px-6 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 text-white font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-3 shadow-lg hover:shadow-xl disabled:shadow-none"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin h-5 w-5" />
                      {mintProgress.total > 0 ? (
                        <span>
                          {t.processing} {mintProgress.current}/{mintProgress.total} 
                          ({Math.round((mintProgress.current / mintProgress.total) * 100)}%)
                        </span>
                      ) : (
                        <span>{t.processing}</span>
                      )}
                    </>
                  ) : (
                    formatMessage(t.createNfts, { quantity: quantity.toString() })
                  )}
                </button>

                {isLoading && (
                  <button
                    onClick={handleStopMinting}
                    disabled={isStopping}
                    className="px-6 py-4 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white font-semibold rounded-xl transition-all duration-300 flex items-center gap-2"
                  >
                    <StopCircle className="h-5 w-5" />
                    {isStopping ? 'Stopping...' : t.stopMinting}
                  </button>
                )}
              </div>
              
              {isLoading && mintProgress.total > 0 && (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>{t.progress}</span>
                    <span>{mintProgress.current}/{mintProgress.total}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${(mintProgress.current / mintProgress.total) * 100}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                    {t.sequentialProcessing}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 結果表示 */}
          {transactionResult && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-8 border border-gray-100 dark:border-gray-700">
              <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
                {t.creationResults}
              </h2>
              <div className="space-y-4 mb-6">
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-xl">
                  <p className="text-gray-700 dark:text-gray-300">
                    {t.totalCost}: <span className="font-mono font-bold text-green-600">{transactionResult.totalCost.toFixed(4)} SOL</span>
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                    <p className="text-gray-600 dark:text-gray-400">{t.merkleTree}:</p>
                    <p className="font-mono text-xs text-gray-800 dark:text-gray-200 break-all">{transactionResult.merkleTree}</p>
                  </div>
                  {transactionResult.collectionMint && (
                    <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                      <p className="text-gray-600 dark:text-gray-400">{t.collection}:</p>
                      <p className="font-mono text-xs text-gray-800 dark:text-gray-200 break-all">{transactionResult.collectionMint}</p>
                    </div>
                  )}
                </div>
              </div>
              
              <button
                onClick={handleVerifyNFTs}
                disabled={isVerifying}
                className="w-full py-3 px-6 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-400 text-white font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="animate-spin h-5 w-5" />
                    {t.verifying}
                  </>
                ) : (
                  t.verify
                )}
              </button>
            </div>
          )}

          {/* 検証結果 */}
          {showVerification && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-8 border border-gray-100 dark:border-gray-700">
              <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
                {t.nftVerificationResults}
              </h2>
              {verificationData.length > 0 ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {formatMessage(t.nftsFound, { count: verificationData.length.toString() })}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                    {verificationData.slice(0, 10).map((asset, index) => (
                      <div key={index} className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-700 dark:to-gray-600 rounded-lg border">
                        <p className="font-mono font-semibold text-gray-800 dark:text-gray-200">
                          {asset.content?.metadata?.name || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 break-all">
                          ID: {asset.id?.slice(0, 20)}...
                        </p>
                      </div>
                    ))}
                  </div>
                  {verificationData.length > 10 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center mt-4">
                      ...{verificationData.length - 10} more
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-gray-700 dark:text-gray-300">
                  <p className="mb-4">{t.noNftsFound}</p>
                  <p className="text-sm mb-2">{t.checkpoints}</p>
                  <ul className="list-disc list-inside text-sm space-y-1 text-gray-600 dark:text-gray-400">
                    <li>{t.indexingDelay}</li>
                    <li>{t.waitAndRetry}</li>
                    <li>{t.checkConsole}</li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* 時間警告ダイアログ */}
          {showTimeWarning && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full">
                <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
                  ⏱️ Time Estimation
                </h3>
                <p className="text-gray-700 dark:text-gray-300 mb-6">
                  {formatMessage(t.createTreeWarning, { 
                    quantity: quantity.toString(), 
                    minutes: estimatedMinutes.toString() 
                  })}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowTimeWarning(false)}
                    className="flex-1 py-3 px-4 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-xl font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                  >
                    {t.cancel}
                  </button>
                  <button
                    onClick={handleTimeWarningConfirm}
                    className="flex-1 py-3 px-4 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl font-medium hover:from-purple-600 hover:to-purple-700 transition-all duration-300"
                  >
                    {t.continueAnyway}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 重要な注意事項とセットアップガイド */}
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 mb-8">
            <div className="flex items-start gap-3">
              <div className="text-red-500 text-xl">⚠️</div>
              <div>
                <h3 className="text-lg font-bold text-red-800 dark:text-red-300 mb-2">
                  {language === 'ja' ? '重要：テスト環境での使用について' : 'Important: Use in Test Environment Only'}
                </h3>
                <p className="text-red-700 dark:text-red-400 mb-2">
                  {language === 'ja' 
                    ? 'このツールは必ず資産が入っていないテスト用のアカウントで使用してください。本番環境や価値のある資産が入ったウォレットでは絶対に使用しないでください。'
                    : 'Please use this tool only with test accounts that contain no valuable assets. Never use it with production wallets or accounts containing real assets.'
                  }
                </p>
                <p className="text-red-700 dark:text-red-400 text-sm">
                  {language === 'ja' 
                    ? '開発者は一切の責任を負いません。自己責任でご利用ください。'
                    : 'The developers assume no responsibility. Use at your own risk.'
                  }
                </p>
              </div>
            </div>
          </div>

          {/* 初心者向け操作ガイド */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-6 mb-8">
            <h3 className="text-lg font-bold text-blue-800 dark:text-blue-300 mb-4 flex items-center gap-2">
              <span>📚</span>
              {language === 'ja' ? '初心者向け操作ガイド' : 'Beginner\'s Guide'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-blue-700 dark:text-blue-400 mb-2">
                  {language === 'ja' ? '1. ウォレットアプリをインストール' : '1. Install Wallet App'}
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-blue-600 dark:text-blue-300 ml-4">
                  <li>{language === 'ja' ? 'Phantom、Solflare、Backpack等のウォレットアプリをインストール' : 'Install wallet apps like Phantom, Solflare, or Backpack'}</li>
                  <li>{language === 'ja' ? '推奨：' : 'Recommended: '}
                    <a href="https://phantom.app/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 underline">
                      Phantom Wallet
                    </a>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-blue-700 dark:text-blue-400 mb-2">
                  {language === 'ja' ? '2. テストネット設定' : '2. Testnet Setup'}
                </h4>
                <ol className="list-decimal list-inside space-y-1 text-sm text-blue-600 dark:text-blue-300 ml-4">
                  <li>{language === 'ja' ? 'ウォレットで新しいアカウント（テスト用）を作成' : 'Create a new account (for testing) in your wallet'}</li>
                  <li>{language === 'ja' ? 'ネットワークを「Devnet」に切り替え' : 'Switch network to "Devnet"'}</li>
                  <li>{language === 'ja' ? 'このアプリで「Select Wallet」からウォレットを接続' : 'Connect your wallet using "Select Wallet" in this app'}</li>
                </ol>
              </div>

              <div>
                <h4 className="font-semibold text-blue-700 dark:text-blue-400 mb-2">
                  {language === 'ja' ? '3. テストトークン取得' : '3. Get Test Tokens'}
                </h4>
                <ol className="list-decimal list-inside space-y-1 text-sm text-blue-600 dark:text-blue-300 ml-4">
                  <li>
                    <a 
                      href="https://faucet.solana.com/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-700 underline"
                    >
                      Solana Faucet
                    </a>
                    {language === 'ja' ? ' にアクセス' : ' - Access this site'}
                  </li>
                  <li>{language === 'ja' ? 'ウォレットアドレスを入力して「Request Airdrop」をクリック' : 'Enter your wallet address and click "Request Airdrop"'}</li>
                  <li>{language === 'ja' ? 'SOLが入金されたらNFT作成開始！' : 'Once SOL is received, start creating NFTs!'}</li>
                </ol>
              </div>

              <div>
                <h4 className="font-semibold text-blue-700 dark:text-blue-400 mb-2">
                  {language === 'ja' ? '4. 作成したNFTの確認方法' : '4. How to View Created NFTs'}
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-blue-600 dark:text-blue-300 ml-4">
                  <li>{language === 'ja' ? 'Solana Explorer: ' : 'Solana Explorer: '}
                    <a 
                      href="https://explorer.solana.com/?cluster=devnet" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-700 underline"
                    >
                      explorer.solana.com
                    </a>
                  </li>
                  <li>{language === 'ja' ? 'SolanaFM: ' : 'SolanaFM: '}
                    <a 
                      href="https://solana.fm/?cluster=devnet-solana" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-700 underline"
                    >
                      solana.fm
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* フッター - Yuki様の宣伝 */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl shadow-xl p-8 text-white">
            <div className="text-center">
              <h3 className="text-2xl font-bold mb-4">
                {language === 'ja' ? '🎓 Web3開発を学ぼう！' : '🎓 Learn Web3 Development!'}
              </h3>
              <p className="text-purple-100 mb-6">
                {language === 'ja' 
                  ? '初心者向けのハンズオン動画をYouTubeで大量公開中！Solana開発からDeFiまで幅広くカバー。'
                  : 'Comprehensive hands-on tutorials for beginners on YouTube! From Solana development to DeFi and beyond.'
                }
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <a
                  href="https://www.youtube.com/@yuki_web3"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  <Youtube className="h-5 w-5" />
                  {language === 'ja' ? 'YouTubeチャンネル' : 'YouTube Channel'}
                  <ExternalLink className="h-4 w-4" />
                </a>
                <a
                  href="https://x.com/yuki_solana"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-6 py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  <Twitter className="h-5 w-5" />
                  {language === 'ja' ? 'Xをフォロー' : 'Follow on X'}
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
              <p className="text-sm text-purple-200 mt-4">
                @yuki_web3 | @yuki_solana
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}