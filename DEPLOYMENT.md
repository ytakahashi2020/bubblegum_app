# Vercelデプロイ手順

## 🚀 自動デプロイの実行手順

### 1. Vercelプロジェクトの作成

1. **Vercelにアクセス**: https://vercel.com/
2. **GitHubでログイン**をクリック
3. **"New Project"** をクリック
4. **リポジトリを検索**: `ytakahashi2020/bubblegum_app`
5. **"Import"** をクリック
6. **"Deploy"** をクリック（初回はそのままデプロイ）

### 2. 環境変数の設定（重要！）

デプロイ完了後、以下の手順で環境変数を設定してください：

1. **プロジェクトダッシュボードで "Settings" タブをクリック**
2. **左メニューから "Environment Variables" を選択**
3. **以下の変数を追加**:

#### 必要な環境変数
```
Name: NEXT_PUBLIC_HELIUS_RPC_URL
Value: https://devnet.helius-rpc.com
Environment: Production, Preview, Development（すべて選択）
```

```
Name: NEXT_PUBLIC_HELIUS_API_KEY  
Value: [あなたのHelius APIキー]
Environment: Production, Preview, Development（すべて選択）
```

### 3. Helius API Keyの取得方法

1. **Helius Dashboardにアクセス**: https://dashboard.helius.xyz/
2. **アカウント作成またはログイン**
3. **"Create Project"** をクリック
4. **プロジェクト名を入力**（例: "BubblegumNFT"）
5. **"Devnet"** を選択
6. **API Keyをコピー**

### 4. 再デプロイの実行

環境変数設定後：
1. **"Deployments" タブに移動**
2. **最新のデプロイメントの "..." メニューをクリック**
3. **"Redeploy" を選択**
4. **"Redeploy" ボタンをクリック**

### 5. 動作確認

デプロイ完了後：
- **アプリにアクセス**（VercelのURLが表示されます）
- **"ローカルウォレットを使用" をON**
- **Solana Faucetでテストトークンを取得**: https://faucet.solana.com/
- **NFT作成をテスト**

## 🔗 便利なリンク

- **Vercel Dashboard**: https://vercel.com/dashboard
- **Helius Dashboard**: https://dashboard.helius.xyz/
- **Solana Faucet**: https://faucet.solana.com/
- **GitHub Repository**: https://github.com/ytakahashi2020/bubblegum_app

## ⚠️ トラブルシューティング

### ビルドエラーが発生した場合
1. 環境変数が正しく設定されているか確認
2. GitHubリポジトリが最新になっているか確認
3. Vercelのログを確認

### NFT作成時にエラーが発生した場合
1. Helius API Keyが正しく設定されているか確認
2. テストネット用のSOLが十分にあるか確認
3. ブラウザの開発者ツールでエラーログを確認