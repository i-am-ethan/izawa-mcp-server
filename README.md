# Izawa MCP Server

TypeScriptとExpressで構築されたModel Context Protocol (MCP) サーバーです。プロフィール情報とブログ記事を提供します。

## 機能

- プロフィール情報の提供
- ブログ記事リストの提供
- 特定のブログ記事本文の提供

## 必要条件

- Node.js v20.18.0以上
- npm または yarn

## インストール

```bash
# リポジトリをクローン
git clone https://github.com/yourusername/izawa-mcp-server.git
cd izawa-mcp-server

# 依存関係のインストール
npm install
```

## 使用方法

### 開発サーバーの起動

```bash
npm run dev
```

サーバーは http://localhost:3000 で実行されます。

### 本番用ビルドと実行

```bash
# TypeScriptからJavaScriptへのコンパイル
npm run build

# ビルドされたサーバーを起動
npm start
```

## MCPエンドポイント

### 1. MCP メタデータエンドポイント

```
GET /.well-known/model-context-protocol.json
```

このエンドポイントは、サーバーのメタデータと利用可能なコンテキストのリストを返します。

### 2. コンテキストデータエンドポイント

```
POST /mcp
Content-Type: application/json

{
  "context_id": "profile" 
}
```

あるいは

```
POST /mcp
Content-Type: application/json

{
  "context_id": "blog_post_content",
  "params": {
    "post_id": "post-1"
  }
}
```

## カスタマイズ

- プロフィール情報: `src/server.ts` ファイル内の `userProfile` オブジェクトを編集します。
- ブログ記事: `getBlogPosts` と `getBlogPostContent` 関数を実際のデータソースを使用するように実装します。

## ライセンス

MIT 