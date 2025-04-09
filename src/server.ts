import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs/promises'; // 非同期ファイルシステム操作
import path from 'path';

const app = express();
// PORT環境変数があればそれを使う (デプロイ先で設定されることが多い)
const port = process.env.PORT || 3000;

app.use(express.json()); // POSTリクエストのJSONボディをパースする

// CORSヘッダーの設定
app.use(function(req: Request, res: Response, next: NextFunction) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    
    // OPTIONSリクエストに対する応答
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    next();
});

// 静的ファイル配信の設定（アイコン画像など）
app.use(express.static('public'));

// --- データ読み込みのヘルパー関数 ---
// プロフィール情報を読み込む関数
async function getUserProfile() {
    try {
        const filePath = path.join(__dirname, 'data', 'profile.json');
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('[Error] Failed to read profile data:', error);
        // エラー時のフォールバック
        return {
            name: '泉澤 直樹',
            bio: 'TypeScript と MCP に興味があるエンジニアです。',
            website: 'https://example.com'
        };
    }
}

// ブログ記事リストを読み込む関数
async function getBlogPosts() {
    try {
        const filePath = path.join(__dirname, 'data', 'posts', 'index.json');
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('[Error] Failed to read blog posts list:', error);
        // エラー時のフォールバック
        return [
            { id: 'post-1', title: 'MCPサーバー構築記', date: '2023-04-09', summary: 'TypeScriptでMCPサーバーを作った話...' },
            { id: 'post-2', title: 'TypeScriptの便利な機能', date: '2023-04-01', summary: '型安全な開発...' }
        ];
    }
}

// 特定のブログ記事の内容を読み込む関数
async function getBlogPostContent(postId: string) {
    try {
        const filePath = path.join(__dirname, 'data', 'posts', `${postId}.md`);
        return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
        console.error(`[Error] Failed to read blog post content for ID '${postId}':`, error);
        return null; // ファイルが見つからない場合はnullを返す
    }
}

// --- MCPエンドポイントの実装 ---

// SSEのセットアップヘルパー関数
function setupSSE(req: Request, res: Response): boolean {
    const acceptHeader = req.get('Accept') || '';
    const isSseRequest = acceptHeader.includes('text/event-stream');
    
    if (isSseRequest) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        // SSEのヘッダーとして必要
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders(); // フラッシュしてクライアントに送信
    }
    
    return isSseRequest;
}

// 1. /.well-known/model-context-protocol.json
// サーバーのメタデータと提供コンテキストを定義
app.get('/.well-known/model-context-protocol.json', (req: Request, res: Response) => {
    const isSseRequest = setupSSE(req, res);
    const data = getMcpMetadata(req);
    
    if (isSseRequest) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        res.end();
    } else {
        res.json(data);
    }
});

// MCPメタデータを生成する関数（コード重複を避けるため）
function getMcpMetadata(req: Request) {
    // デプロイ先のホスト名を動的に取得する方が望ましい
    const host = req.get('host') || `localhost:${port}`;
    const protocol = req.protocol === 'http' && host.startsWith('localhost') ? 'http' : 'https'; // localhost以外はhttpsを想定
    const rootUrl = `${protocol}://${host}`;

    return {
        name: 'Izawa MCP Server',
        description: 'プロフィールとブログ記事を提供します。',
        root_url: rootUrl,
        icon_url: `${rootUrl}/icon.png`, // アイコン画像のURL (別途用意が必要)
        contexts: [
            {
                id: 'profile', // コンテキストの一意なID
                name: 'プロフィール情報',
                description: '運営者の基本的なプロフィール',
                mcp_endpoint: '/mcp', // データ取得エンドポイント
                // params_schema: {} // パラメータが必要な場合は定義
            },
            {
                id: 'blog_posts_list',
                name: 'ブログ記事リスト',
                description: '投稿されたブログ記事のタイトルと概要',
                mcp_endpoint: '/mcp',
            },
            {
                id: 'blog_post_content',
                name: 'ブログ記事本文',
                description: '指定されたIDのブログ記事の本文（Markdown形式）',
                mcp_endpoint: '/mcp',
                // このコンテキストをリクエストする際に必要なパラメータを定義
                params_schema: {
                    type: 'object',
                    properties: {
                        post_id: {
                            type: 'string',
                            description: '取得したいブログ記事のID',
                        },
                    },
                    required: ['post_id'],
                },
            }
        ],
    };
}

// 2. /mcp エンドポイント
// 実際のコンテキストデータを返す
app.route('/mcp')
    .options((req: Request, res: Response) => {
        res.status(200).end();
    })
    .post(async (req: Request, res: Response) => {
        const { context_id, params } = req.body;
        const isSseRequest = setupSSE(req, res);

        try {
            if (!context_id) {
                if (isSseRequest) {
                    res.write(`data: ${JSON.stringify({ error: "context_id is required" })}\n\n`);
                    res.end();
                } else {
                    res.status(400).json({ error: "context_id is required" });
                }
                return;
            }

            console.log(`[MCP Request] context_id: ${context_id}, params: ${JSON.stringify(params)}`); // ログ出力

            let content: any = null;
            let format: string = 'text/plain'; // デフォルト

            switch (context_id) {
                case 'profile':
                    // プロフィール情報を取得
                    const userProfile = await getUserProfile();
                    
                    // JSON形式で返す場合
                    content = JSON.stringify(userProfile);
                    format = 'application/json';
                    
                    // テキスト形式で返す場合
                    // const profileText = `Name: ${userProfile.name}\nBio: ${userProfile.bio}\nWebsite: ${userProfile.website}`;
                    // content = profileText;
                    // format = 'text/plain';
                    break;

                case 'blog_posts_list':
                    const posts = await getBlogPosts();
                    // 記事リストをJSON形式で返す
                    content = JSON.stringify(posts);
                    format = 'application/json';
                    break;

                case 'blog_post_content':
                    // paramsに必要なパラメータがあるかチェック
                    if (!params || !params.post_id) {
                        res.status(400).json({ error: `Missing required parameter 'post_id' for context 'blog_post_content'` });
                        return;
                    }
                    const postId = params.post_id;
                    content = await getBlogPostContent(postId);
                    if (content) {
                        format = 'text/markdown'; // Markdown形式で返す
                    } else {
                        // contentがnullの場合 (記事が見つからない)
                        console.warn(`[MCP Warning] Blog post not found for id: ${postId}`);
                        // MCPではエラーでなく空の内容を返すのが一般的かもしれないが、ここでは404を返す例
                        res.status(404).json({ error: `Blog post with id '${postId}' not found` });
                        return;
                    }
                    break;

                default:
                    // 不明な context_id
                    console.warn(`[MCP Warning] Unknown context_id requested: ${context_id}`);
                    res.status(404).json({ error: `Context with id '${context_id}' not found` });
                    return;
            }

            // MCPレスポンス形式で返す
            const responseData = {
                context: {
                    content: content,
                    format: format,
                },
            };

            if (isSseRequest) {
                console.log(`[MCP Response] Sending SSE response for ${context_id}`);
                res.write(`data: ${JSON.stringify(responseData)}\n\n`);
                res.end();
            } else {
                res.json(responseData);
            }

        } catch (error) {
            console.error("Error processing /mcp request:", error);
            if (isSseRequest) {
                res.write(`data: ${JSON.stringify({ error: "Internal server error" })}\n\n`);
                res.end();
            } else {
                res.status(500).json({ error: "Internal server error" });
            }
        }
    });

// ルートパスなど他のパスも必要に応じて設定
app.get('/', (req: Request, res: Response) => {
    res.send('Izawa MCP Server is running!');
});

// サーバー起動
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
}); 