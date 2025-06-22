import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters'
import { mplBubblegum, createTree, mintToCollectionV1 } from '@metaplex-foundation/mpl-bubblegum'
import { generateSigner, KeypairSigner, Umi, percentAmount } from '@metaplex-foundation/umi'
import { createNft, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { Connection, PublicKey } from '@solana/web3.js'

const FIXED_IMAGE_URI = 'https://raw.githubusercontent.com/metaplex-foundation/js-examples/main/getting-started-vite/src/example.png'

export interface MintResult {
  totalCost: number
  merkleTree: string
  collectionMint: string
  mintedCount: number
}

export async function createMerkleTree(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wallet: any, // ウォレットアダプターの型を柔軟に
  connection: Connection,
  maxDepth: number = 14,
  maxBufferSize: number = 64
): Promise<{ umi: Umi; merkleTree: KeypairSigner }> {
  const umi = createUmi(connection.rpcEndpoint)
    .use(walletAdapterIdentity(wallet))
    .use(mplBubblegum())
    .use(mplTokenMetadata())

  const merkleTree = generateSigner(umi)
  
  const builder = await createTree(umi, {
    merkleTree,
    maxDepth,
    maxBufferSize,
  })

  await builder.sendAndConfirm(umi)

  return { umi, merkleTree }
}

export async function createCollectionNft(
  umi: Umi,
  name: string,
  symbol: string = 'CNFT'
): Promise<KeypairSigner> {
  const collectionMint = generateSigner(umi)
  
  await createNft(umi, {
    mint: collectionMint,
    name,
    symbol,
    uri: FIXED_IMAGE_URI,
    sellerFeeBasisPoints: percentAmount(0),
    isCollection: true,
  }).sendAndConfirm(umi)

  return collectionMint
}

export async function mintCompressedNfts(
  umi: Umi,
  merkleTree: KeypairSigner,
  collectionMint: KeypairSigner,
  namePrefix: string,
  quantity: number,
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  let mintedCount = 0
  
  console.log(`🚀 Starting to mint ${quantity} Compressed NFTs...`)
  
  // シーケンシャル処理で高速ミント（ウォレット確認を最小化）
  for (let i = 0; i < quantity; i++) {
    const index = i + 1
    const paddedIndex = index.toString().padStart(6, '0')
    const name = `${namePrefix}${paddedIndex}`

    try {
      // send()を使って確認なしで送信し、最後にまとめて確認
      const transaction = mintToCollectionV1(umi, {
        leafOwner: umi.identity.publicKey,
        merkleTree: merkleTree.publicKey,
        collectionMint: collectionMint.publicKey,
        metadata: {
          name,
          symbol: 'CNFT',
          uri: FIXED_IMAGE_URI,
          sellerFeeBasisPoints: 0,
          collection: { key: collectionMint.publicKey, verified: false },
          creators: [
            {
              address: umi.identity.publicKey,
              verified: false,
              share: 100,
            },
          ],
        },
      })

      // 確認なしで送信（高速）
      await transaction.send(umi)
      mintedCount++

      console.log(`📦 Sent NFT ${index}/${quantity} (${name})`)

      if (onProgress) {
        onProgress(mintedCount, quantity)
      }

      // 短い間隔で次のトランザクション（レート制限回避）
      if (i < quantity - 1) {
        await new Promise(resolve => setTimeout(resolve, 50)) // 50ms間隔
      }

    } catch (error) {
      console.error(`❌ Error minting NFT ${index}:`, error)
      
      // エラーの場合は確認ありで再試行
      try {
        await mintToCollectionV1(umi, {
          leafOwner: umi.identity.publicKey,
          merkleTree: merkleTree.publicKey,
          collectionMint: collectionMint.publicKey,
          metadata: {
            name,
            symbol: 'CNFT',
            uri: FIXED_IMAGE_URI,
            sellerFeeBasisPoints: 0,
            collection: { key: collectionMint.publicKey, verified: false },
            creators: [
              {
                address: umi.identity.publicKey,
                verified: false,
                share: 100,
              },
            ],
          },
        }).sendAndConfirm(umi)
        
        mintedCount++
        console.log(`✅ Retry successful for NFT ${index}`)
        
        if (onProgress) {
          onProgress(mintedCount, quantity)
        }
      } catch (retryError) {
        console.error(`❌ Retry failed for NFT ${index}:`, retryError)
      }
    }
  }

  console.log(`🎉 Minting completed! Successfully minted ${mintedCount}/${quantity} NFTs`)
  return mintedCount
}

export async function calculateTotalCost(
  connection: Connection,
  quantity: number,
  merkleTreePubkey?: string
): Promise<number> {
  // Merkle Tree作成コスト（すでに作成済みの場合は0）
  let treeCost = 0
  if (!merkleTreePubkey) {
    // 14 depth, 64 buffer sizeの場合の概算
    treeCost = 0.35 // SOL
  }

  // Collection NFT作成コスト
  const collectionCost = 0.01 // SOL

  // Compressed NFTミントコスト（1個あたり約0.00001 SOL）
  const mintCostPerNft = 0.00001
  const totalMintCost = mintCostPerNft * quantity

  // トランザクション手数料
  const txFees = Math.ceil(quantity / 5) * 0.000005 // 5個ずつバッチ処理

  return treeCost + collectionCost + totalMintCost + txFees
}

export async function verifyCompressedNft(
  connection: Connection,
  assetId: string
): Promise<{id: string; content: {metadata: {name: string}}}> {
  const dasEndpoint = connection.rpcEndpoint
  
  try {
    const response = await fetch(dasEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'compressed-nft-verify',
        method: 'getAsset',
        params: {
          id: assetId,
        },
      }),
    })

    const data = await response.json()
    return data.result
  } catch (error) {
    console.error('Error verifying compressed NFT:', error)
    throw error
  }
}

export async function getCompressedNftsByOwner(
  connection: Connection,
  owner: PublicKey,
  collection?: PublicKey
): Promise<Array<{id?: string; content?: {metadata?: {name?: string}}}>> {
  const dasEndpoint = connection.rpcEndpoint
  
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = {
      ownerAddress: owner.toBase58(),
      limit: 1000,
      page: 1,
      sortBy: {
        sortBy: 'created',
        sortDirection: 'desc'
      }
    }

    if (collection) {
      params.grouping = {
        groupKey: 'collection',
        groupValue: collection.toBase58(),
      }
    }

    console.log('Fetching assets with params:', params)

    const response = await fetch(dasEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'compressed-nfts-by-owner',
        method: 'getAssetsByOwner',
        params,
      }),
    })

    const data = await response.json()
    console.log('DAS API Response:', data)
    
    if (data.error) {
      console.error('DAS API Error:', data.error)
      // エラーでも続行して、結果を返す
    }
    
    return data.result?.items || []
  } catch (error) {
    console.error('Error fetching compressed NFTs:', error)
    // エラーが発生しても空の配列を返す
    return []
  }
}