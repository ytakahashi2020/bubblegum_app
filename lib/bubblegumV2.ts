import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { generateSigner, keypairIdentity, none } from '@metaplex-foundation/umi'
import {
  createTreeV2,
  mintV2,
  parseLeafFromMintV2Transaction,
} from '@metaplex-foundation/mpl-bubblegum'
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters'
import { dasApi } from '@metaplex-foundation/digital-asset-standard-api'
import { Connection, Keypair } from '@solana/web3.js'

const FIXED_IMAGE_URI = 'https://raw.githubusercontent.com/metaplex-foundation/js-examples/main/getting-started-vite/src/example.png'

// Solana CLI キーペアを読み込んでUmiをセットアップ
export async function setupUmiWithCliWallet(connection: Connection) {
  try {
    // API経由でSolana CLIキーペアを読み込み
    const response = await fetch('/api/solana-keypair', { method: 'POST' })
    
    if (!response.ok) {
      const error = await response.json()
      console.error('Failed to load Solana CLI keypair:', error)
      return null
    }
    
    const data = await response.json()
    
    if (!data.success || !data.keypair) {
      console.error('Invalid response from Solana CLI keypair API')
      return null
    }
    
    // Web3.js Keypairを作成
    const keypair = Keypair.fromSecretKey(new Uint8Array(data.keypair))
    
    // Umiインスタンスを作成
    const umi = createUmi(connection.rpcEndpoint)
      .use(keypairIdentity(fromWeb3JsKeypair(keypair)))
      .use(dasApi())
    
    const address = keypair.publicKey.toBase58()
    console.log(`✅ Loaded Solana CLI keypair: ${address}`)
    console.log(`🔑 Umi identity: ${umi.identity.publicKey}`)
    
    return { umi, keypair, address }
  } catch (error) {
    console.error('Error setting up Umi with CLI wallet:', error)
    return null
  }
}

// Merkle Treeを作成
export async function createCompressedNftTree(
  umi: any,
  maxDepth: number = 14,
  maxBufferSize: number = 64
) {
  console.log(`🌳 Creating Merkle Tree (depth: ${maxDepth}, buffer: ${maxBufferSize})...`)
  
  const merkleTree = generateSigner(umi)
  
  const builder = await createTreeV2(umi, {
    merkleTree,
    maxDepth,
    maxBufferSize,
  })

  await builder.sendAndConfirm(umi)
  
  console.log(`✅ Merkle Tree created: ${merkleTree.publicKey}`)
  
  // Merkle Tree初期化完了まで待機
  console.log(`⏳ Waiting for Merkle Tree initialization...`)
  await new Promise(resolve => setTimeout(resolve, 10000)) // 10秒待機
  
  console.log(`✅ Merkle Tree initialization completed`)
  return merkleTree
}

// 単一のCompressed NFTをミント
export async function mintSingleCompressedNft(
  umi: any,
  merkleTree: any,
  name: string,
  uri: string = FIXED_IMAGE_URI
) {
  console.log(`🎨 Minting NFT: ${name}`)
  
  const { signature } = await mintV2(umi, {
    leafOwner: umi.identity.publicKey,
    merkleTree: merkleTree.publicKey,
    metadata: {
      name,
      uri,
      sellerFeeBasisPoints: 0,
      collection: none(),
      creators: [],
    },
  }).sendAndConfirm(umi)

  console.log(`✅ NFT minted successfully: ${name}`)
  console.log(`📝 Transaction signature: ${signature}`)
  
  return { signature, name }
}

// 複数のCompressed NFTを一括ミント（レート制限対応版）
export async function mintMultipleCompressedNfts(
  umi: any,
  merkleTree: any,
  namePrefix: string,
  quantity: number,
  onProgress?: (current: number, total: number) => void
): Promise<{ mintedCount: number; signatures: string[] }> {
  let mintedCount = 0
  const signatures: string[] = []
  
  console.log(`🚀 Starting to mint ${quantity} Compressed NFTs...`)
  
  for (let i = 0; i < quantity; i++) {
    const index = i + 1
    const paddedIndex = index.toString().padStart(6, '0')
    const name = `${namePrefix}${paddedIndex}`

    let retryCount = 0
    const maxRetries = 3

    while (retryCount <= maxRetries) {
      try {
        const result = await mintSingleCompressedNft(umi, merkleTree, name)
        signatures.push(result.signature)
        mintedCount++
        
        console.log(`📦 Progress: ${mintedCount}/${quantity} (${name})`)
        
        if (onProgress) {
          onProgress(mintedCount, quantity)
        }

        break // 成功したらループを抜ける

      } catch (error: any) {
        console.error(`❌ Error minting NFT ${index} (${name}) - Attempt ${retryCount + 1}:`, error)
        
        // レート制限エラーの場合は待機時間を増やす
        if (error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
          const waitTime = Math.pow(2, retryCount) * 1000 // 指数バックオフ
          console.log(`⏳ Rate limited. Waiting ${waitTime}ms before retry...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
        } else if (error.message?.includes('AccountNotInitialized')) {
          // Tree初期化エラーの場合は長めに待機
          console.log(`⏳ Tree not ready. Waiting 5 seconds...`)
          await new Promise(resolve => setTimeout(resolve, 5000))
        }
        
        retryCount++
        
        if (retryCount > maxRetries) {
          console.error(`❌ Failed to mint NFT ${index} after ${maxRetries} retries`)
          break
        }
      }
    }

    // 次のミントまで待機（レート制限回避）
    if (i < quantity - 1) {
      await new Promise(resolve => setTimeout(resolve, 500)) // 500ms間隔
    }
  }

  console.log(`🎉 Bulk minting completed! ${mintedCount}/${quantity} NFTs minted`)
  return { mintedCount, signatures }
}

// 作成されたNFTを検証
export async function verifyCompressedNfts(
  umi: any,
  signatures: string[]
): Promise<Array<{ id: string; name?: string }>> {
  console.log(`🔍 Verifying ${signatures.length} minted NFTs...`)
  
  const verifiedNfts: Array<{ id: string; name?: string }> = []
  
  for (let i = 0; i < signatures.length; i++) {
    try {
      console.log(`📋 Parsing leaf from transaction ${i + 1}/${signatures.length}...`)
      
      // 少し待機してからパース
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const leaf = await parseLeafFromMintV2Transaction(umi, signatures[i])
      
      if (leaf && leaf.id) {
        console.log(`✅ Found asset ID: ${leaf.id}`)
        
        // DAS APIでメタデータを取得
        try {
          await new Promise(resolve => setTimeout(resolve, 2000))
          const asset = await umi.rpc.getAsset(leaf.id)
          
          verifiedNfts.push({
            id: leaf.id,
            name: asset?.content?.metadata?.name || 'Unknown'
          })
          
          console.log(`📝 Asset verified: ${asset?.content?.metadata?.name || 'Unknown'}`)
        } catch (dasError) {
          console.warn(`⚠️ Could not fetch asset details for ${leaf.id}:`, dasError)
          verifiedNfts.push({ id: leaf.id })
        }
      }
    } catch (error) {
      console.error(`❌ Error parsing transaction ${i + 1}:`, error)
    }
  }
  
  console.log(`🎯 Verification complete: ${verifiedNfts.length}/${signatures.length} NFTs verified`)
  return verifiedNfts
}

// コスト計算（簡易版）
export function calculateBubblegumCost(quantity: number): number {
  // Merkle Tree作成コスト（14 depth, 64 buffer）
  const treeCost = 0.35
  
  // 各NFTミントコスト（非常に小さい）
  const mintCostPerNft = 0.00001
  const totalMintCost = mintCostPerNft * quantity
  
  // トランザクション手数料（概算）
  const txFees = quantity * 0.000005
  
  return treeCost + totalMintCost + txFees
}