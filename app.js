// app.js - ROYAL LINKのメインアプリケーション - モデル定義を修正
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

// モデルのインポート
// ここでモデルを一度だけインポートすることで重複定義を防ぐ
const { User, Domain, Url, Subscription } = require('./models');
// PayPalヘルパーの読み込み
const paypalHelper = require('./utils/paypalHelper');

// 無料プラン制限ミドルウェアの読み込み
const freePlanMiddleware = require('./middlewares/freePlan');

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

// 無料プラン情報をレスポンスに追加
app.use(freePlanMiddleware.addFreePlanInfo);

// カスタムスラグによるリダイレクト - ルートパスで直接アクセス (他のルートよりも先に配置)
app.get('/:slug', async (req, res, next) => {
  const slug = req.params.slug;
  
  // システムページ用のパスはスキップ
  if (['login', 'register', 'dashboard', 'domains', 'logout', 's', 'dashboard-temp', 'test-urls', 'status', 'error', 'urls', 'subscription', 'tokushoho'].includes(slug)) {
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

// 特定商取引法に基づく表記ページ
app.get('/tokushoho', (req, res) => {
  try {
    res.render('tokushoho');
  } catch (err) {
    console.error('特定商取引法ページエラー:', err);
    res.status(500).send('内部サーバーエラーが発生しました');
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

// ダッシュボード - サブスクリプション状態を確認
app.get('/dashboard', isAuthenticated, checkSubscriptionStatus, getSubscriptionInfo, async (req, res) => {
  try {
    console.log('ダッシュボード表示リクエスト開始:', new Date().toISOString());
    const userId = req.session.userId;
    
    // 並行してクエリを実行
    const startTime = Date.now();
    let user, urls, domains;
    
    try {
      [user, urls, domains] = await Promise.all([
        User.findById(userId).lean(),
        Url.find({ userId }).sort({ createdAt: -1 }).lean(),
        Domain.find({ userId }).lean()
      ]);
    } catch (dbErr) {
      console.error('データベース取得エラー:', dbErr);
      // エラー発生時は空の配列を設定
      urls = [];
      domains = [];
    }
    
    console.log(`データ取得完了: ${Date.now() - startTime}ms`);
    
    if (!user) {
      req.session.destroy();
      return res.redirect('/login');
    }
    
    console.log(`取得したURL数: ${urls ? urls.length : 0}`);
    console.log(`取得したドメイン数: ${domains ? domains.length : 0}`);
    
    // nullチェックを追加
    urls = urls || [];
    domains = domains || [];
    
    // 時間帯別統計を計算
    const timeStats = {};
    for (const url of urls) {
      if (url.accessLogs && url.accessLogs.length > 0) {
        url.accessLogs.forEach(log => {
          const hour = new Date(log.timestamp).getHours();
          if (!timeStats[hour]) {
            timeStats[hour] = 0;
          }
          timeStats[hour]++;
        });
      }
    }
    
    // 時間帯順にソート
    const hourlyStats = Array.from({length: 24}, (_, i) => ({
      hour: i,
      count: timeStats[i] || 0
    }));
    
    // プレミアム状態をビューに渡す
    const isPremium = user.hasPremium;
    
    // 無料プランのURL制限情報を取得
    const freePlanUrlLimitInfo = await freePlanMiddleware.checkFreePlanUrlLimit(userId);
    
    res.render('dashboard', {
      urls,
      domains,
      user,
      hourlyStats,
      isPremium, // プレミアムステータスをビューに渡す
      error: req.query.error || null,
      success: req.query.success || null,
      appDomain: req.appDomain || 'king-rule.site',
      subscription: res.locals.subscription,
      freePlanUrlLimitInfo // 無料プランのURL制限情報を追加
    });
  } catch (err) {
    console.error('ダッシュボード表示エラー:', err);
    return res.render('dashboard', {
      urls: [],
      domains: [],
      user: { username: '不明なユーザー' },
      hourlyStats: Array.from({length: 24}, (_, i) => ({ hour: i, count: 0 })),
      isPremium: false,
      error: 'データの取得中にエラーが発生しました: ' + err.message,
      success: null,
      appDomain: req.appDomain || 'king-rule.site',
      subscription: null,
      freePlanUrlLimitInfo: {
        currentCount: 0,
        maxCount: 3,
        hasReachedLimit: false,
        remainingCount: 3
      }
    });
  }
});


// URL短縮エンドポイント - 無料プランのユーザーも制限付きで利用可能
app.post('/shorten', isAuthenticated, freePlanMiddleware.checkFreePlanLimits, async (req, res) => {
  try {
    const { originalUrl, customSlug, domainId } = req.body;
    
    // URLが有効かチェック
    if (!validUrl.isUri(originalUrl)) {
      return res.redirect('/dashboard?error=有効なURLを入力してください');
    }
    
    // プレミアムユーザーのみカスタムスラグとカスタムドメインを利用可能
    let urlData = {
      userId: req.session.userId,
      originalUrl,
      shortCode: shortid.generate(),
      customSlug: null,
      domainId: null
    };

    // プレミアムユーザーの場合、追加機能を有効化
    if (req.user && req.user.hasPremium) {
      // カスタムスラグが指定されている場合、形式チェック
      if (customSlug && !/^[a-zA-Z0-9-_]+$/.test(customSlug)) {
        return res.redirect('/dashboard?error=カスタムスラグには英数字、ハイフン、アンダースコアのみ使用できます');
      }
      
      // カスタムスラグが既に使用されていないかチェック
      if (customSlug) {
        const existingUrl = await Url.findOne({ customSlug });
        if (existingUrl) {
          return res.redirect('/dashboard?error=このカスタムスラグは既に使用されています');
        }
      }
      
      // ドメインIDチェック
      let domainToUse = null;
      if (domainId && domainId !== 'default') {
        // 指定されたドメインが存在し、かつ検証済みかチェック
        const domain = await Domain.findOne({ _id: domainId, userId: req.session.userId });
        if (!domain) {
          return res.redirect('/dashboard?error=指定されたドメインが見つかりません');
        }
        
        if (!domain.verified) {
          return res.redirect('/dashboard?error=ドメインが検証されていません');
        }
        
        domainToUse = domain._id;
      }
      
      // プレミアムユーザーの場合、カスタム設定を適用
      urlData.customSlug = customSlug || null;
      urlData.domainId = domainToUse;
    }
    
    // 新しいURL作成
    const newUrl = new Url(urlData);
    await newUrl.save();
    
    res.redirect('/dashboard?success=URLを短縮しました');
  } catch (err) {
    console.error('URL短縮エラー:', err);
    res.redirect('/dashboard?error=URLの短縮中にエラーが発生しました');
  }
});

// 短縮URLリダイレクト - sパス
app.get('/s/:code', async (req, res) => {
  try {
    const shortCode = req.params.code;
    
    const url = await Url.findOne({ shortCode });
    
    if (!url) {
      return res.status(404).render('404', { message: '短縮URLが見つかりません' });
    }
    
    // クリック数を増やす
    url.clicks++;
    
    // アクセスログを追加
    url.accessLogs.push({
      timestamp: new Date(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      referer: req.headers.referer || 'direct'
    });
    
    await url.save();
    
    // 元のURLにリダイレクト
    res.redirect(url.originalUrl);
  } catch (err) {
    console.error('短縮URLリダイレクトエラー:', err);
    res.status(500).render('404', { message: 'エラーが発生しました' });
  }
});

// URL詳細ページ、ドメイン追加、認証関連、サブスクリプション関連のルート定義...
// (長いため、省略しています。これらは元のapp.jsファイルと同じ内容です)

// 404ページ（最後に配置）
app.use((req, res) => {
  res.status(404).render('404', { message: 'ページが見つかりません' });
});

// サーバー起動
const server = app.listen(PORT, HOST, () => {
  console.log(`サーバーが http://${HOST}:${PORT} で起動しました`);
});

module.exports = server;