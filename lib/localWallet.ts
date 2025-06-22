import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { keypairIdentity, generateSigner, createSignerFromKeypair } from '@metaplex-foundation/umi'
import { mplBubblegum, createTree, mintToCollectionV1 } from '@metaplex-foundation/mpl-bubblegum'
import { createNft, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { percentAmount, KeypairSigner, Umi } from '@metaplex-foundation/umi'
import { Connection, Keypair } from '@solana/web3.js'

const FIXED_IMAGE_URI = 'https://raw.githubusercontent.com/metaplex-foundation/js-examples/main/getting-started-vite/src/example.png'

// Solana CLIキーペアファイルから作成
export function createKeypairFromSecretKey(secretKeyArray: number[]): Keypair {
  return Keypair.fromSecretKey(new Uint8Array(secretKeyArray))
}

// API経由でSolana CLIキーペアを読み込み
export async function loadSolanaCliKeypair(): Promise<{ keypair: number[]; config?: any } | null> {
  try {
    const response = await fetch('/api/solana-keypair', {
      method: 'POST',
    })
    
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
    
    return {
      keypair: data.keypair,
      config: data.config
    }
  } catch (error) {
    console.error('Error calling Solana CLI keypair API:', error)
    return null
  }
}

// Solana CLIキーペア を読み込んでセットアップ
export async function setupSolanaCliWallet(connection: Connection): Promise<{ umi: Umi; localKeypair: KeypairSigner; address: string; solanaKeypair: Keypair } | null> {
  try {
    const result = await loadSolanaCliKeypair()
    
    if (!result) {
      return null
    }
    
    const { keypair: secretKeyArray } = result
    const solanaKeypair = createKeypairFromSecretKey(secretKeyArray)
    
    // Umiインスタンスを作成
    const umi = createUmi(connection.rpcEndpoint)
      .use(mplBubblegum())
      .use(mplTokenMetadata())

    // UmiキーペアSigner を作成
    const umiKeypair = createSignerFromKeypair(umi, {
      publicKey: solanaKeypair.publicKey.toBytes(),
      secretKey: solanaKeypair.secretKey
    })
    
    // 署名者として設定
    umi.use(keypairIdentity(umiKeypair))
    
    const address = solanaKeypair.publicKey.toBase58()
    console.log(`✅ Loaded Solana CLI keypair: ${address}`)
    console.log(`🔑 Umi identity set to: ${umi.identity.publicKey}`)
    console.log(`🔑 Keypair matches identity: ${umi.identity.publicKey === umiKeypair.publicKey}`)
    
    return { umi, localKeypair: umiKeypair, address, solanaKeypair }
  } catch (error) {
    console.error('Error setting up Solana CLI wallet:', error)
    return null
  }
}

export async function setupLocalWallet(connection: Connection, secretKey?: number[]) {
  const umi = createUmi(connection.rpcEndpoint)
    .use(mplBubblegum())
    .use(mplTokenMetadata())

  let keypair: KeypairSigner
  
  if (secretKey) {
    // ユーザー提供のシークレットキーを使用
    const solanaKeypair = createKeypairFromSecretKey(secretKey)
    keypair = createSignerFromKeypair(umi, {
      publicKey: solanaKeypair.publicKey.toBytes(),
      secretKey: solanaKeypair.secretKey
    })
    console.log(`✅ Using provided keypair: ${solanaKeypair.publicKey.toBase58()}`)
  } else {
    // 新しいキーペアを生成
    keypair = generateSigner(umi)
    console.log(`✅ Generated new keypair: ${keypair.publicKey}`)
  }
  
  umi.use(keypairIdentity(keypair))
  return { umi, localKeypair: keypair }
}

export async function createMerkleTreeLocal(
  umi: Umi,
  maxDepth: number = 14,
  maxBufferSize: number = 64
): Promise<KeypairSigner> {
  const merkleTree = generateSigner(umi)
  
  console.log(`🌳 Creating Merkle Tree with identity: ${umi.identity.publicKey}`)
  console.log(`🌳 Merkle Tree signer: ${merkleTree.publicKey}`)
  
  const builder = await createTree(umi, {
    merkleTree,
    maxDepth,
    maxBufferSize,
  })

  console.log(`🌳 Sending Merkle Tree creation transaction...`)
  await builder.sendAndConfirm(umi)
  console.log(`✅ Merkle Tree created successfully: ${merkleTree.publicKey}`)
  return merkleTree
}

export async function createCollectionNftLocal(
  umi: Umi,
  name: string,
  symbol: string = 'CNFT'
): Promise<KeypairSigner> {
  const collectionMint = generateSigner(umi)
  
  console.log(`🎨 Creating Collection NFT with identity: ${umi.identity.publicKey}`)
  console.log(`🎨 Collection mint signer: ${collectionMint.publicKey}`)
  
  console.log(`🎨 Sending Collection NFT creation transaction...`)
  await createNft(umi, {
    mint: collectionMint,
    name,
    symbol,
    uri: FIXED_IMAGE_URI,
    sellerFeeBasisPoints: percentAmount(0),
    isCollection: true,
  }).sendAndConfirm(umi)

  console.log(`✅ Collection NFT created successfully: ${collectionMint.publicKey}`)
  return collectionMint
}

export async function mintCompressedNftsLocal(
  umi: Umi,
  merkleTree: KeypairSigner,
  collectionMint: KeypairSigner,
  namePrefix: string,
  quantity: number,
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  let mintedCount = 0
  
  console.log(`🚀 Starting local wallet mint of ${quantity} Compressed NFTs...`)
  
  // シーケンシャル処理で確実に実行（バッチ処理は複雑なため）
  for (let i = 0; i < quantity; i++) {
    const index = i + 1
    const paddedIndex = index.toString().padStart(6, '0')
    const name = `${namePrefix}${paddedIndex}`

    try {
      console.log(`📦 Minting NFT ${index}/${quantity} (${name})...`)
      
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
      }).send(umi)  // send()を使って確認なし送信

      mintedCount++
      console.log(`✅ NFT ${index} sent successfully`)

      if (onProgress) {
        onProgress(mintedCount, quantity)
      }

      // 短い間隔で次のミント（レート制限回避）
      if (i < quantity - 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }

    } catch (error) {
      console.error(`❌ Error minting NFT ${index}:`, error)
      
      // エラー時は確認ありで再試行
      try {
        console.log(`🔄 Retrying NFT ${index} with confirmation...`)
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

  console.log(`🎉 Local wallet minting completed! ${mintedCount}/${quantity} NFTs minted`)
  return mintedCount
}

export async function fundLocalWallet(
  connection: Connection,
  localWalletPubkey: string,
  amountSol: number = 1
): Promise<void> {
  try {
    // Devnet用のエアドロップ
    const response = await fetch(connection.rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'requestAirdrop',
        params: [localWalletPubkey, amountSol * 1000000000] // SOLをlamportsに変換
      })
    })
    
    const data = await response.json()
    console.log(`💰 Airdropped ${amountSol} SOL to local wallet:`, data.result)
  } catch (error) {
    console.error('Airdrop failed:', error)
  }
}