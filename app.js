// app.js - ROYAL LINKのメインアプリケーション
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const compression = require('compression');
const config = require('./config');

// Expressアプリケーションの初期化
const app = express();

// プロキシ設定（Renderなどの環境用）
app.set('trust proxy', 1);

// Gzip圧縮を有効化
app.use(compression());

// ミドルウェア設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public', {
  maxAge: '1d', // クライアント側で1日間キャッシュ
  etag: true,   // ETagsを有効化
}));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 独自ドメイン対応のためのミドルウェア
app.use((req, res, next) => {
  req.appDomain = config.server.domain;
  res.locals.appDomain = config.server.domain;
  res.locals.baseUrl = `https://${config.server.domain}`;
  next();
});

// MongoDB接続設定
mongoose.set('strictQuery', true);
mongoose.connect(config.mongodb.uri)
  .then(() => console.log('MongoDBに接続しました'))
  .catch(err => console.error('MongoDB接続エラー:', err));

// MongoDBセッションストア
const sessionStore = MongoStore.create({
  mongoUrl: config.mongodb.uri,
  ttl: 60 * 60 * 24, // 1日
  autoRemove: 'native',
  touchAfter: 24 * 3600 // 24時間ごとに更新
});

sessionStore.on('error', function(error) {
  console.error('セッションストアエラー:', error);
});

// セッション設定
app.use(session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: config.session.cookie,
  store: sessionStore
}));

// モデルのロード
require('./models');

// ルーターのロード
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const urlRoutes = require('./routes/urls');
const domainRoutes = require('./routes/domains');
const subscriptionRoutes = require('./routes/subscription');
const webhookRoutes = require('./routes/webhook');
const redirectRoutes = require('./routes/redirect');

// ルート登録
app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/urls', urlRoutes);
app.use('/domains', domainRoutes);
app.use('/subscription', subscriptionRoutes);
app.use('/webhook', webhookRoutes);

// リダイレクトルートは最後に登録（他のルートよりも先に処理される必要がある）
app.use('/', redirectRoutes);

// エラーハンドリングミドルウェア
app.use((err, req, res, next) => {
  console.error('アプリケーションエラー:', err);
  res.status(500).render('error', { 
    message: '内部サーバーエラーが発生しました',
    error: config.server.nodeEnv === 'development' ? err : {}
  });
});

// 404ページ
app.use((req, res) => {
  res.status(404).render('404', { message: 'ページが見つかりません' });
});

// メモリ使用量の監視とログ
function logMemoryUsage() {
  const memoryUsage = process.memoryUsage();
  console.log(`メモリ使用状況: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`);
}

// 定期的にメモリ使用量をログに記録
setInterval(logMemoryUsage, 60000); // 1分ごとに記録
logMemoryUsage(); // 起動時に記録

// サーバー起動
const PORT = config.server.port;
const HOST = config.server.host;

app.listen(PORT, HOST, () => {
  console.log(`サーバーが起動しました:`);
  console.log(`- ローカルアクセス: http://localhost:${PORT}`);
  console.log(`- 本番環境: https://${config.server.domain}`);
});

module.exports = app; // テスト用にエクスポート