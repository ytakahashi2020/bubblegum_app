'use client'

import { useState } from 'react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { Loader2, Zap } from 'lucide-react'
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
import { PublicKey } from '@solana/web3.js'

export default function Home() {
  const { publicKey, wallet, signTransaction, signAllTransactions } = useWallet()
  const { connection } = useConnection()
  const [nftName, setNftName] = useState('Test')
  const [quantity, setQuantity] = useState<10 | 100 | 1000 | 10000>(10)
  const [isLoading, setIsLoading] = useState(false)
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

  const handleLoadSolanaCliWallet = async () => {
    try {
      const result = await setupUmiWithCliWallet(connection)
      
      if (!result) {
        alert('Solana CLIキーペアの読み込みがキャンセルされました')
        return
      }
      
      const { address, keypair } = result
      
      // 残高確認
      const balance = await connection.getBalance(keypair.publicKey)
      
      setLocalWalletInfo({
        address,
        balance: balance / 1e9 // lamportsをSOLに変換
      })
      
      alert(`Solana CLIウォレットを読み込みました！\nアドレス: ${address.slice(0, 20)}...\n残高: ${(balance / 1e9).toFixed(4)} SOL`)
    } catch (error) {
      console.error('Error loading Solana CLI wallet:', error)
      alert('Solana CLIウォレットの読み込みに失敗しました')
    }
  }

  const handleMintNFTs = async () => {
    if (useLocalWallet) {
      return handleMintNFTsLocal()
    }

    if (!publicKey || !wallet || !signTransaction || !signAllTransactions) {
      alert('ウォレットを接続してください')
      return
    }

    setIsLoading(true)
    try {
      // コスト計算
      const estimatedCost = await calculateTotalCost(connection, quantity)
      
      // ウォレットアダプターを作成
      const walletAdapter = {
        publicKey,
        signTransaction,
        signAllTransactions
      }
      
      // Merkle Tree作成
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { umi, merkleTree } = await createMerkleTree(walletAdapter as any, connection)
      
      // Collection NFT作成
      const collectionMint = await createCollectionNft(umi, `${nftName} Collection`)
      
      // Compressed NFTsをミント
      setMintProgress({ current: 0, total: quantity })
      await mintCompressedNfts(
        umi,
        merkleTree,
        collectionMint,
        nftName,
        quantity,
        (current, total) => {
          console.log(`Progress: ${current}/${total}`)
          setMintProgress({ current, total })
        }
      )

      // 実際のコストを計算（簡易版）
      const actualCost = estimatedCost // 実際は前後の残高差から計算

      setTransactionResult({
        totalCost: actualCost,
        merkleTree: merkleTree.publicKey.toString(),
        collectionMint: collectionMint.publicKey.toString()
      })
      
      alert(`合計 ${actualCost.toFixed(4)} SOL かかりました`)
    } catch (error) {
      console.error('Error minting NFTs:', error)
      alert('エラーが発生しました: ' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setIsLoading(false)
      setMintProgress({ current: 0, total: 0 })
    }
  }

  const handleMintNFTsLocal = async () => {
    setIsLoading(true)
    try {
      // Solana CLIウォレットを使用してUmiをセットアップ
      const result = await setupUmiWithCliWallet(connection)
      
      if (!result) {
        alert('Solana CLIウォレットが読み込まれていません')
        setIsLoading(false)
        return
      }
      
      const { umi } = result
      
      // Merkle Tree作成（小さなサイズで高い成功率）
      console.log('🌳 Creating Merkle Tree...')
      const merkleTree = await createCompressedNftTree(umi, 10, 32) // より小さなサイズ
      
      // Compressed NFTsを一括ミント
      console.log('🎨 Starting bulk mint...')
      setMintProgress({ current: 0, total: quantity })
      const { mintedCount, signatures } = await mintMultipleCompressedNfts(
        umi,
        merkleTree,
        nftName,
        quantity,
        (current, total) => {
          console.log(`Progress: ${current}/${total}`)
          setMintProgress({ current, total })
        }
      )

      const estimatedCost = calculateBubblegumCost(quantity)
      
      setTransactionResult({
        totalCost: estimatedCost,
        merkleTree: merkleTree.publicKey.toString(),
        collectionMint: '' // V2では直接ミントするのでコレクション不要
      })
      
      // 検証を自動で開始
      console.log('🔍 Starting verification...')
      setShowVerification(true)
      setIsVerifying(true)
      
      try {
        const verifiedNfts = await verifyCompressedNfts(umi, signatures.slice(0, 10)) // 最初の10個だけ検証
        setVerificationData(verifiedNfts.map(nft => ({
          id: nft.id,
          content: { metadata: { name: nft.name } }
        })))
      } catch (verifyError) {
        console.error('Verification error:', verifyError)
      } finally {
        setIsVerifying(false)
      }
      
      alert(`🚀 Solana CLIウォレットで${mintedCount}個のNFTを高速作成完了！\n確認ダイアログなしで処理しました。\n合計 ${estimatedCost.toFixed(4)} SOL かかりました`)
    } catch (error) {
      console.error('Error minting NFTs with Solana CLI wallet:', error)
      alert('エラーが発生しました: ' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setIsLoading(false)
      setMintProgress({ current: 0, total: 0 })
    }
  }

  const handleVerifyNFTs = async () => {
    if (!transactionResult || !publicKey) return
    
    setShowVerification(true)
    setIsVerifying(true)
    try {
      // 少し待機してからNFTを確認
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const assets = await getCompressedNftsByOwner(
        connection,
        publicKey,
        transactionResult.collectionMint ? new PublicKey(transactionResult.collectionMint) : undefined
      )
      
      console.log('Found assets:', assets)
      setVerificationData(assets)
    } catch (error) {
      console.error('Error verifying NFTs:', error)
      alert('NFTの確認中にエラーが発生しました。')
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Bubblegum NFT 大量作成デモ
          </h1>
          <div className="flex items-center gap-4">
            {!useLocalWallet && <WalletMultiButton />}
            {useLocalWallet && localWalletInfo && (
              <div className="text-sm text-gray-600 dark:text-gray-400 text-right">
                <div>ローカルウォレット</div>
                <div className="font-mono text-xs">{localWalletInfo.address.slice(0, 10)}...</div>
                <div>{localWalletInfo.balance.toFixed(4)} SOL</div>
              </div>
            )}
          </div>
        </header>

        <main className="max-w-2xl mx-auto">
          {/* ウォレット選択 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              ウォレット選択
            </h2>
            <div className="space-y-4">
              <div className="flex gap-4">
                <button
                  onClick={() => setUseLocalWallet(false)}
                  className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                    !useLocalWallet
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  外部ウォレット (Phantom等)
                </button>
                <button
                  onClick={() => setUseLocalWallet(true)}
                  className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                    useLocalWallet
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  <Zap className="h-4 w-4" />
                  ローカルウォレット (高速)
                </button>
              </div>
              
              {useLocalWallet && (
                <div className="border-t pt-4">
                  {!localWalletInfo ? (
                    <div className="text-center">
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        Solana CLIで設定されているキーペアファイル（id.json）を選択してください
                      </p>
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                          <strong>通常の場所:</strong> ~/.config/solana/id.json<br/>
                          <strong>コマンド:</strong> `solana config get` で確認可能
                        </p>
                      </div>
                      <button
                        onClick={handleLoadSolanaCliWallet}
                        className="py-2 px-4 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium"
                      >
                        Solana CLIキーペアを読み込み
                      </button>
                    </div>
                  ) : (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                        <Zap className="h-4 w-4" />
                        <span className="font-medium">ローカルウォレット準備完了</span>
                      </div>
                      <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                        確認ダイアログなしで高速ミントが可能です
                      </p>
                    </div>
                  )}
                </div>
              )}
              
              {!useLocalWallet && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    外部ウォレットでは各NFTごとに確認ダイアログが表示されます
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              NFT作成設定
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  NFT名のプレフィックス
                </label>
                <input
                  type="text"
                  value={nftName}
                  onChange={(e) => setNftName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="例: Test"
                />
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {nftName}000001, {nftName}000002... のような名前になります
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  作成数量
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[10, 100, 1000, 10000].map((num) => {
                    const estimatedConfirms = '最小限' // 確認なし送信を使用
                    
                    return (
                      <button
                        key={num}
                        onClick={() => setQuantity(num as 10 | 100 | 1000 | 10000)}
                        className={`px-4 py-2 rounded-md font-medium transition-colors ${
                          quantity === num
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                        }`}
                      >
                        <div className="text-center">
                          <div>{num.toLocaleString()}</div>
                          <div className="text-xs opacity-75">確認{estimatedConfirms}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <button
                onClick={handleMintNFTs}
                disabled={(!publicKey && !useLocalWallet) || (useLocalWallet && !localWalletInfo) || isLoading}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin h-5 w-5" />
                    {mintProgress.total > 0 ? (
                      <span>
                        処理中... {mintProgress.current}/{mintProgress.total} 
                        ({Math.round((mintProgress.current / mintProgress.total) * 100)}%)
                      </span>
                    ) : (
                      <span>処理中...</span>
                    )}
                  </>
                ) : (
                  `${quantity.toLocaleString()}個のNFTを作成`
                )}
              </button>
              
              {isLoading && mintProgress.total > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                    <span>進捗</span>
                    <span>{mintProgress.current}/{mintProgress.total}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(mintProgress.current / mintProgress.total) * 100}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    高速シーケンシャル処理でミント中 • 確認なし送信で最適化
                  </p>
                </div>
              )}
            </div>
          </div>

          {transactionResult && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                作成結果
              </h2>
              <div className="space-y-2 mb-4">
                <p className="text-gray-700 dark:text-gray-300">
                  合計コスト: <span className="font-mono font-semibold">{transactionResult.totalCost} SOL</span>
                </p>
                <p className="text-gray-700 dark:text-gray-300">
                  Merkle Tree: <span className="font-mono text-sm">{transactionResult.merkleTree.slice(0, 20)}...</span>
                </p>
                <p className="text-gray-700 dark:text-gray-300">
                  Collection: <span className="font-mono text-sm">{transactionResult.collectionMint.slice(0, 20)}...</span>
                </p>
              </div>
              
              <button
                onClick={handleVerifyNFTs}
                disabled={isVerifying}
                className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors flex items-center justify-center gap-2"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="animate-spin h-5 w-5" />
                    確認中...
                  </>
                ) : (
                  '確認をする'
                )}
              </button>
            </div>
          )}

          {showVerification && (
            <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                NFT確認結果
              </h2>
              {verificationData.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {verificationData.length}個のNFTが見つかりました
                  </p>
                  {verificationData.slice(0, 10).map((asset, index) => (
                    <div key={index} className="p-2 bg-gray-100 dark:bg-gray-700 rounded">
                      <p className="text-sm font-mono text-gray-800 dark:text-gray-200">
                        {asset.content?.metadata?.name || 'Unknown'}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        ID: {asset.id?.slice(0, 20)}...
                      </p>
                    </div>
                  ))}
                  {verificationData.length > 10 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center mt-2">
                      ...他{verificationData.length - 10}個
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-gray-700 dark:text-gray-300">
                  <p>NFTが見つかりませんでした。</p>
                  <p className="text-sm mt-2">以下の点をご確認ください：</p>
                  <ul className="list-disc list-inside text-sm mt-1 space-y-1">
                    <li>NFTの作成直後は、インデックスに時間がかかる場合があります</li>
                    <li>数分待ってから再度確認してください</li>
                    <li>ブラウザの開発者ツールでコンソールログを確認してください</li>
                  </ul>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}