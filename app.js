// app.js - ROYAL LINKのメインアプリケーション
const express = require('express');
const mongoose = require('mongoose');
const shortid = require('shortid');
const validUrl = require('valid-url');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const compression = require('compression');

// Mongoose strictQueryの設定
mongoose.set('strictQuery', true);

const app = express();

// プロキシ設定（Renderなどの環境用）
app.set('trust proxy', 1);

// Gzip圧縮を有効化
app.use(compression());

// 環境変数の設定
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DOMAIN = process.env.DOMAIN || 'king-rule.site';

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
  // ドメイン情報をリクエストとレスポンスに追加
  req.appDomain = DOMAIN;
  res.locals.appDomain = DOMAIN;
  res.locals.baseUrl = `https://${DOMAIN}`;
  next();
});

// MongoDB接続
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://royaluser:sausu2108@cluster0.7oi5f.mongodb.net/royallink?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDBに接続しました'))
  .catch(err => console.error('MongoDB接続エラー:', err));

// MongoDBセッションストア接続確認
const sessionStore = MongoStore.create({
  mongoUrl: MONGO_URI,
  ttl: 60 * 60 * 24, // 1日
  autoRemove: 'native',
  touchAfter: 24 * 3600 // 24時間ごとに更新
});

sessionStore.on('error', function(error) {
  console.error('セッションストアエラー:', error);
});

// セッション設定
app.use(session({
  secret: process.env.SESSION_SECRET || 'royal-link-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 1000 * 60 * 60 * 24, // 24時間
    secure: process.env.NODE_ENV === 'production', // 本番環境ではHTTPSを強制
    sameSite: 'lax'
  },
  store: sessionStore
}));

// ユーザーモデル
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  hasPremium: { type: Boolean, default: false } // プレミアムプランかどうかのフラグ
});

// ドメインモデル
const domainSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  domainName: { type: String, required: true },
  verified: { type: Boolean, default: false },
  verificationCode: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// URLモデル - アクセスログフィールドを追加
const urlSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  originalUrl: { type: String, required: true },
  shortCode: { type: String, required: true },
  domainId: { type: mongoose.Schema.Types.ObjectId, ref: 'Domain', default: null },
  customSlug: { type: String, default: null },
  clicks: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  // アクセスログを追加
  accessLogs: [{
    timestamp: { type: Date, default: Date.now },
    ipAddress: { type: String },
    userAgent: { type: String },
    referer: { type: String }
  }]
});

// サブスクリプションモデル
const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  paypalSubscriptionId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'cancelled', 'expired'],
    default: 'active'
  },
  plan: {
    type: String,
    default: 'premium'
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date
  },
  lastPaymentDate: {
    type: Date,
    default: Date.now
  },
  nextPaymentDate: {
    type: Date,
    required: true
  },
  paymentHistory: [{
    paymentId: String,
    amount: Number,
    currency: String,
    status: String,
    date: {
      type: Date,
      default: Date.now
    }
  }]
});
// モデルのインデックス設定
urlSchema.index({ shortCode: 1 });
urlSchema.index({ customSlug: 1 });
domainSchema.index({ domainName: 1 });

const User = mongoose.model('User', userSchema);
const Domain = mongoose.model('Domain', domainSchema);
const Url = mongoose.model('Url', urlSchema);
const Subscription = mongoose.model('Subscription', subscriptionSchema);

// PayPalヘルパーの読み込み
const paypalHelper = require('./utils/paypalHelper');

// 認証チェックミドルウェア
const isAuthenticated = (req, res, next) => {
  console.log('認証チェック、セッション:', JSON.stringify(req.session));
  
  if (req.session && req.session.userId) {
    console.log('認証成功:', req.session.userId);
    return next();
  }
  
  console.log('認証失敗、ログインへリダイレクト');
  res.redirect('/login');
};

// プレミアムユーザーチェックミドルウェア
const isPremiumUser = async (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login');
  }
  
  try {
    // ユーザー情報を取得
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/login');
    }
    
    // プレミアム状態を確認
    if (user.hasPremium) {
      return next();
    }
    
    // アクティブなサブスクリプションがあるか確認
    const activeSubscription = await Subscription.findOne({
      userId: req.session.userId,
      status: 'active'
    });
    
    if (activeSubscription) {
      // ユーザーのプレミアムステータスを更新
      user.hasPremium = true;
      await user.save();
      return next();
    }
    
    // プレミアムユーザーでない場合はプラン選択ページへリダイレクト
    res.redirect('/subscription/plans?error=この機能を利用するにはプレミアムプランへの登録が必要です');
  } catch (err) {
    console.error('プレミアムユーザーチェックエラー:', err);
    res.redirect('/dashboard?error=ユーザー情報の確認中にエラーが発生しました');
  }
};

// サブスクリプション情報を取得するミドルウェア
const getSubscriptionInfo = async (req, res, next) => {
  if (!req.session || !req.session.userId) {
    res.locals.subscription = null;
    return next();
  }
  
  try {
    const subscription = await Subscription.findOne({
      userId: req.session.userId,
      status: 'active'
    });
    
    res.locals.subscription = subscription;
    next();
  } catch (err) {
    console.error('サブスクリプション情報取得エラー:', err);
    res.locals.subscription = null;
    next();
  }
};

// サブスクリプションの状態を確認し、プレミアム特典へのアクセスを制御するミドルウェア
const checkSubscriptionStatus = async (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login');
  }
  
  try {
    // ユーザーをチェック
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/login');
    }
    
    // すでにプレミアムフラグが立っている場合は確認
    if (user.hasPremium) {
      // アクティブなサブスクリプションがあるか確認
      const activeSubscription = await Subscription.findOne({
        userId: user._id,
        status: 'active'
      });
      
      // サブスクリプションが終了している場合はフラグを下げる
      if (!activeSubscription) {
        const expiredSubscription = await Subscription.findOne({
          userId: user._id,
          $or: [
            { status: 'cancelled' },
            { status: 'expired' }
          ]
        });
        
        if (expiredSubscription) {
          // 支払い期間が終了しているかチェック
          const now = new Date();
          const nextPayment = new Date(expiredSubscription.nextPaymentDate);
          
          if (now > nextPayment) {
            // 支払い期間終了後はプレミアム特典を無効化
            user.hasPremium = false;
            await user.save();
          }
        } else {
          // サブスクリプションが見つからない場合もプレミアム特典を無効化
          user.hasPremium = false;
          await user.save();
        }
      }
    }
    
    // ユーザー情報をリクエストに追加
    req.user = user;
    next();
  } catch (err) {
    console.error('サブスクリプション状態確認エラー:', err);
    next();
  }
};

// カスタムスラグによるリダイレクト - ルートパスで直接アクセス (他のルートよりも先に配置)
app.get('/:slug', async (req, res, next) => {
  const slug = req.params.slug;
  
  // システムページ用のパスはスキップ
  if (['login', 'register', 'dashboard', 'domains', 'logout', 's', 'dashboard-temp', 'test-urls', 'status', 'error', 'urls', 'subscription'].includes(slug)) {
    return next();
  }
  
  try {
    // king-rule.site上のカスタムURLを検索
    const customUrl = await Url.findOne({ customSlug: slug });
    
    if (customUrl) {
      // クリック数を増やす
      customUrl.clicks++;
      
      // アクセスログを追加
      customUrl.accessLogs.push({
        timestamp: new Date(),
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        referer: req.headers.referer || 'direct'
      });
      
      await customUrl.save();
      
      // 元のURLにリダイレクト
      return res.redirect(customUrl.originalUrl);
    }
    
    // 短縮コードとしても検索
    const codeUrl = await Url.findOne({ shortCode: slug });
    
    if (codeUrl) {
      // クリック数を増やす
      codeUrl.clicks++;
      
      // アクセスログを追加
      codeUrl.accessLogs.push({
        timestamp: new Date(),
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        referer: req.headers.referer || 'direct'
      });
      
      await codeUrl.save();
      
      // 元のURLにリダイレクト
      return res.redirect(codeUrl.originalUrl);
    }
    
    // 見つからない場合は次のミドルウェアへ
    next();
  } catch (err) {
    console.error(err);
    next();
  }
});

// ホームページ - シンプル化
app.get('/', (req, res) => {
  try {
    console.log('ホームページアクセス');
    if (req.session.userId) {
      console.log('ログイン済みユーザー、ダッシュボードへリダイレクト');
      return res.redirect('/dashboard');
    }
    console.log('ホームページレンダリング');
    return res.render('home');
  } catch (err) {
    console.error('ホームページエラー:', err);
    res.status(500).send('ROYAL LINK - 内部サーバーエラーが発生しました');
  }
});
// ログインページ
app.get('/login', (req, res) => {
  try {
    res.render('login', { error: null });
  } catch (err) {
    console.error('ログインページエラー:', err);
    res.status(500).send('内部サーバーエラーが発生しました');
  }
});

// ログイン処理
app.post('/login', async (req, res) => {
  console.log('ログインリクエスト受信:', req.body);
  
  // リクエストボディが空の場合の対応
  if (!req.body || !req.body.username || !req.body.password) {
    console.log('ログインデータが不足しています');
    return res.render('login', { error: 'ユーザー名とパスワードを入力してください' });
  }
  
  const { username, password } = req.body;
  
  try {
    console.log('ユーザー検索:', username);
    const user = await User.findOne({ username });
    
    if (!user) {
      console.log('ユーザーが見つかりません');
      return res.render('login', { error: 'ユーザー名またはパスワードが間違っています' });
    }
    
    console.log('パスワード照合');
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      console.log('パスワードが一致しません');
      return res.render('login', { error: 'ユーザー名またはパスワードが間違っています' });
    }
    
    console.log('ログイン成功、セッション設定:', user._id);
    req.session.userId = user._id;
    
    // セッションの保存を確認
    req.session.save((err) => {
      if (err) {
        console.error('セッション保存エラー:', err);
        // 一時的な対策としてクエリパラメータでIDを渡す
        return res.redirect(`/dashboard-temp?userId=${user._id}`);
      }
      
      console.log('セッション保存成功:', req.session);
      console.log('ダッシュボードへリダイレクト');
      return res.redirect('/dashboard');
    });
  } catch (err) {
    console.error('ログインエラー:', err);
    return res.render('login', { error: 'ログイン処理中にエラーが発生しました: ' + err.message });
  }
});

// 新規登録ページ
app.get('/register', (req, res) => {
  try {
    res.render('register', { error: null });
  } catch (err) {
    console.error('登録ページエラー:', err);
    res.status(500).send('内部サーバーエラーが発生しました');
  }
});

// 新規登録処理
app.post('/register', async (req, res) => {
  console.log('登録リクエスト受信:', req.body);
  
  // 入力データが空でないか確認
  if (!req.body.username || !req.body.email || !req.body.password || !req.body.confirmPassword) {
    console.log('入力データが不足しています');
    return res.render('register', { error: '全ての項目を入力してください' });
  }
  
  const { username, email, password, confirmPassword } = req.body;
  
  if (password !== confirmPassword) {
    console.log('パスワードが一致しません');
    return res.render('register', { error: 'パスワードが一致しません' });
  }
  
  try {
    console.log('ユーザー検索開始');
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    
    if (existingUser) {
      console.log('既存ユーザー検出:', existingUser.username);
      return res.render('register', { error: 'ユーザー名またはメールアドレスが既に使用されています' });
    }
    
    console.log('パスワードハッシュ化開始');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    console.log('新規ユーザー作成開始');
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      hasPremium: false // デフォルトは無料ユーザー
    });
    
    console.log('ユーザーをデータベースに保存');
    await newUser.save();
    
    console.log('セッション設定');
    req.session.userId = newUser._id;
    
    // セッションの保存を確認
    req.session.save((err) => {
      if (err) {
        console.error('セッション保存エラー:', err);
        // 一時的な対策としてクエリパラメータでIDを渡す
        return res.redirect(`/dashboard-temp?userId=${newUser._id}`);
      }
      
      console.log('セッション保存成功:', req.session);
      console.log('ダッシュボードへリダイレクト');
      return res.redirect('/dashboard');
    });
  } catch (err) {
    console.error('登録エラー詳細:', err);
    res.render('register', { error: '登録中にエラーが発生しました: ' + err.message });
  }
});

// URL短縮処理 - プレミアムユーザー限定
app.post('/shorten', isAuthenticated, async (req, res) => {
  const { originalUrl, domainId, customSlug } = req.body;
  
  if (!originalUrl) {
    return res.redirect('/dashboard?error=URLを入力してください');
  }
  
  if (!validUrl.isUri(originalUrl)) {
    return res.redirect('/dashboard?error=有効なURLを入力してください');
  }
  
  try {
    // ユーザーの種類を確認（プレミアムかどうか）
    const user = await User.findById(req.session.userId);
    
    // プレミアムでないなら、サブスクリプションページにリダイレクト
    if (!user.hasPremium) {
      return res.redirect('/subscription/plans?error=URLを短縮するにはプレミアムプランへの登録が必要です');
    }
    
    let url = null;
    let shortUrl = '';
    
    if (domainId && domainId !== 'default') {
      const domain = await Domain.findOne({ 
        _id: domainId, 
        userId: req.session.userId,
        verified: true
      });
      
      if (!domain) {
        return res.redirect('/dashboard?error=無効なドメインが選択されました');
      }
      
      if (customSlug) {
        const existingUrl = await Url.findOne({ 
          domainId: domain._id, 
          customSlug 
        });
        
        if (existingUrl) {
          return res.redirect('/dashboard?error=そのカスタムスラグは既に使用されています');
        }
        
        url = new Url({
          userId: req.session.userId,
          originalUrl,
          shortCode: shortid.generate(),
          domainId: domain._id,
          customSlug
        });
        
        shortUrl = `https://${domain.domainName}/${customSlug}`;
      } else {
        const randomSlug = shortid.generate();
        url = new Url({
          userId: req.session.userId,
          originalUrl,
          shortCode: shortid.generate(),
          domainId: domain._id,
          customSlug: randomSlug
        });
        
        shortUrl = `https://${domain.domainName}/${randomSlug}`;
      }
    } else {
      // デフォルトドメイン(king-rule.site)を使用
      const shortCode = shortid.generate();
      url = new Url({
        userId: req.session.userId,
        originalUrl,
        shortCode
      });
      
      shortUrl = `https://${DOMAIN}/s/${shortCode}`;
    }
    
    console.log('新しいURL作成:', url);
    await url.save();
    console.log('短縮URL:', shortUrl);
    
    // 成功メッセージに短縮URLを含める
    return res.redirect(`/dashboard?success=短縮URLが作成されました: ${shortUrl}`);
    
  } catch (err) {
    console.error(err);
    return res.redirect('/dashboard?error=URL短縮中にエラーが発生しました: ' + err.message);
  }
});

// ログアウト処理
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// サーバーを起動
const server = app.listen(PORT, HOST, () => {
  console.log(`ROYAL LINK サーバーが起動しました - ポート: ${PORT}, ホスト: ${HOST}`);
  console.log(`環境: ${process.env.NODE_ENV || 'development'}`);
});

// エラーハンドリング
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`ポート ${PORT} は既に使用されています`);
  } else {
    console.error('サーバー起動エラー:', err);
  }
});

// グレースフルシャットダウン
process.on('SIGTERM', () => {
  console.log('SIGTERM シグナルを受信しました。サーバーをシャットダウンします。');
  server.close(() => {
    console.log('サーバーが正常にシャットダウンされました。');
    mongoose.connection.close(false, () => {
      console.log('MongoDB接続を閉じました。');
      process.exit(0);
    });
  });
});