# Bubblegum NFT App

Solana Compressed NFTs (cNFTs) を使用したNFT作成ツールです。初心者でも簡単にテストネットでNFTを作成できます。

## 🚀 デプロイ

### Vercelでの自動デプロイ

1. [Vercel](https://vercel.com/) にアクセスし、GitHubアカウントでログイン
2. 「New Project」をクリック
3. このリポジトリ `ytakahashi2020/bubblegum_app` を選択
4. 「Import」をクリック

### 環境変数の設定

Vercelプロジェクトの設定で以下の環境変数を設定してください：

1. プロジェクトダッシュボードで「Settings」→「Environment Variables」へ
2. 以下の変数を追加：

```
NEXT_PUBLIC_HELIUS_RPC_URL=https://devnet.helius-rpc.com
NEXT_PUBLIC_HELIUS_API_KEY=あなたのHeliusAPIキー
```

### Helius API Keyの取得

1. [Helius Dashboard](https://dashboard.helius.xyz/) にアクセス
2. アカウントを作成/ログイン
3. 新しいプロジェクトを作成
4. Devnet用のAPI Keyをコピー

## 🔧 ローカル開発

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## ⚠️ 重要な注意事項

- **テスト用アカウントでのみ使用してください**
- 価値のある資産が入ったウォレットでは使用しないでください
- このツールはDevnet（テストネット）用です

## 📚 使い方

詳細な使い方はアプリ内の「初心者向け操作ガイド」をご覧ください。

## 🛠️ 技術スタック

- Next.js 14
- Tailwind CSS
- Solana Web3.js
- @solana/wallet-adapter
- @metaplex-foundation/mpl-bubblegum

## 🎯 機能

- Compressed NFTs (cNFTs) の作成
- 外部ウォレット接続 (Phantom, Solflare等)
- 日本語・英語対応
- ダークモード対応
- 初心者向けガイド付き
