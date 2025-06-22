// Solana CLI設定を読み込むためのユーティリティ（ブラウザ環境対応）

export interface SolanaConfig {
  rpcUrl: string
  keypairPath: string
  commitment: string
}

// ユーザーにファイル選択を求めてSolana CLI設定を読み込む
export async function loadSolanaConfig(): Promise<SolanaConfig | null> {
  return new Promise((resolve) => {
    // config.ymlファイルを選択するためのinput要素を作成
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.yml,.yaml'
    input.style.display = 'none'
    
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      
      try {
        const content = await file.text()
        const config = parseConfigYml(content)
        resolve(config)
      } catch (error) {
        console.error('Error reading config file:', error)
        resolve(null)
      }
    }
    
    input.oncancel = () => resolve(null)
    
    document.body.appendChild(input)
    input.click()
    document.body.removeChild(input)
  })
}

// ユーザーにファイル選択を求めてキーペアファイルを読み込む
export async function loadKeypairFile(): Promise<number[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.style.display = 'none'
    
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      
      try {
        const content = await file.text()
        const keypair = JSON.parse(content)
        
        if (Array.isArray(keypair) && keypair.length === 64) {
          resolve(keypair)
        } else {
          throw new Error('Invalid keypair format')
        }
      } catch (error) {
        console.error('Error reading keypair file:', error)
        alert('無効なキーペアファイルです。Solanaのキーペアファイル（.json）を選択してください。')
        resolve(null)
      }
    }
    
    input.oncancel = () => resolve(null)
    
    document.body.appendChild(input)
    input.click()
    document.body.removeChild(input)
  })
}

function parseConfigYml(content: string): SolanaConfig {
  const lines = content.split('\n')
  const config: Partial<SolanaConfig> = {}
  
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('json_rpc_url:')) {
      config.rpcUrl = trimmed.split(':', 2)[1].trim()
    } else if (trimmed.startsWith('keypair_path:')) {
      config.keypairPath = trimmed.split(':', 2)[1].trim()
    } else if (trimmed.startsWith('commitment:')) {
      config.commitment = trimmed.split(':', 2)[1].trim()
    }
  }
  
  if (!config.rpcUrl || !config.keypairPath) {
    throw new Error('Invalid config file format')
  }
  
  return config as SolanaConfig
}

// デフォルト設定を提供
export function getDefaultSolanaConfig(): SolanaConfig {
  return {
    rpcUrl: 'https://api.devnet.solana.com',
    keypairPath: '~/.config/solana/id.json',
    commitment: 'confirmed'
  }
}