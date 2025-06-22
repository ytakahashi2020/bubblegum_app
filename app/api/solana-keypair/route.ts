import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export async function GET() {
  try {
    // 本番環境では環境変数からキーペアを取得
    const envKeypair = process.env.SOLANA_KEYPAIR
    if (envKeypair) {
      try {
        const walletData = JSON.parse(envKeypair)
        if (Array.isArray(walletData) && walletData.length === 64) {
          return NextResponse.json({
            success: true,
            keypair: walletData,
            source: 'environment'
          })
        }
      } catch (e) {
        console.error('Failed to parse SOLANA_KEYPAIR environment variable:', e)
      }
    }

    // ローカル開発環境でのみファイルシステムにアクセス
    if (process.env.NODE_ENV === 'development') {
      const walletPath = path.join(os.homedir(), '.config', 'solana', 'id.json')
      
      if (!fs.existsSync(walletPath)) {
        return NextResponse.json(
          { error: 'Solana CLI keypair not found', path: walletPath, suggestion: 'Set SOLANA_KEYPAIR environment variable for production' },
          { status: 404 }
        )
      }

      // キーペアファイルを読み込み
      const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'))
      
      if (!Array.isArray(walletData) || walletData.length !== 64) {
        return NextResponse.json(
          { error: 'Invalid keypair format' },
          { status: 400 }
        )
      }

      return NextResponse.json({
        success: true,
        keypair: walletData,
        path: walletPath,
        source: 'file'
      })
    }

    // 本番環境でキーペアが見つからない場合
    return NextResponse.json(
      { 
        error: 'No keypair available in production environment',
        suggestion: 'Set SOLANA_KEYPAIR environment variable with your keypair JSON array'
      },
      { status: 404 }
    )

  } catch (error) {
    console.error('Error loading Solana keypair:', error)
    return NextResponse.json(
      { error: 'Failed to load Solana keypair', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

// Solana CLI設定も取得できるエンドポイント
export async function POST() {
  try {
    // 本番環境では環境変数のみ使用
    if (process.env.NODE_ENV === 'production') {
      const envKeypair = process.env.SOLANA_KEYPAIR
      if (envKeypair) {
        try {
          const keypair = JSON.parse(envKeypair)
          return NextResponse.json({
            success: true,
            config: { rpc_url: 'https://api.devnet.solana.com' },
            keypair,
            source: 'environment'
          })
        } catch (e) {
          return NextResponse.json(
            { error: 'Invalid SOLANA_KEYPAIR environment variable' },
            { status: 400 }
          )
        }
      }
      return NextResponse.json(
        { error: 'SOLANA_KEYPAIR environment variable not set' },
        { status: 404 }
      )
    }

    // ローカル開発環境のみ
    const configPath = path.join(os.homedir(), '.config', 'solana', 'cli', 'config.yml')
    
    if (!fs.existsSync(configPath)) {
      return NextResponse.json(
        { error: 'Solana CLI config not found' },
        { status: 404 }
      )
    }

    const configContent = fs.readFileSync(configPath, 'utf8')
    
    // config.ymlをパース
    const config: Record<string, string> = {}
    const lines = configContent.split('\n')
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':')
        const value = valueParts.join(':').trim()
        config[key.trim()] = value
      }
    }

    // キーペアパスからキーペアを読み込み
    let keypair = null
    const keypairPath = config.keypair_path
    
    if (keypairPath) {
      let resolvedPath = keypairPath
      if (keypairPath.startsWith('~')) {
        resolvedPath = path.join(os.homedir(), keypairPath.slice(1))
      }
      
      if (fs.existsSync(resolvedPath)) {
        const walletData = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'))
        if (Array.isArray(walletData) && walletData.length === 64) {
          keypair = walletData
        }
      }
    }

    return NextResponse.json({
      success: true,
      config,
      keypair,
      configPath
    })

  } catch (error) {
    console.error('Error loading Solana config:', error)
    return NextResponse.json(
      { error: 'Failed to load Solana config', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}