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
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  // mongoose 6.x系ではreconnectTriesとreconnectIntervalは不要になりました
  // 代わりに自動再接続が標準で有効になっています
})
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
    sameSite: 'lax',
    httpOnly: true, // HTTPOnlyクッキーを設定してXSS攻撃を防止
    path: '/' // パスを明示的に設定
  },
  store: sessionStore
}));

// セッションミドルウェアのデバッグ
app.use((req, res, next) => {
  // セッションIDをログに出力（デバッグ用）
  console.log('Session ID:', req.sessionID);
  console.log('Session:', req.session);
  next();
});

// モデルのインポート
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

// URL詳細ページ - プレミアムユーザーのみアクセス可能
app.get('/urls/detail/:id', isAuthenticated, freePlanMiddleware.checkAccessStatsPermission, async (req, res) => {
  try {
    const urlId = req.params.id;
    
    // URLを取得し、そのURLが現在のユーザーに属しているか確認
    const url = await Url.findOne({ _id: urlId, userId: req.session.userId });
    
    if (!url) {
      return res.status(404).render('404', { message: 'URLが見つかりません' });
    }
    
    // ドメイン情報を取得（もしある場合）
    let domain = null;
    if (url.domainId) {
      domain = await Domain.findById(url.domainId);
    }

    // 時間帯別アクセス統計を計算
    const hourlyData = [];
    for (let i = 0; i < 24; i++) {
      hourlyData.push({ hour: i, count: 0 });
    }
    
    // アクセスログを分析
    if (url.accessLogs && url.accessLogs.length > 0) {
      url.accessLogs.forEach(log => {
        const hour = new Date(log.timestamp).getHours();
        hourlyData[hour].count++;
      });
    }
    
    // 日別アクセス統計（過去30日間）
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // 日付ごとのアクセス数を集計
    const dailyStats = {};
    for (let i = 0; i < 30; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dailyStats[dateStr] = 0;
    }
    
    if (url.accessLogs && url.accessLogs.length > 0) {
      url.accessLogs.forEach(log => {
        const date = new Date(log.timestamp);
        if (date >= thirtyDaysAgo) {
          const dateStr = date.toISOString().split('T')[0];
          if (dailyStats[dateStr] !== undefined) {
            dailyStats[dateStr]++;
          }
        }
      });
    }
    
    // 日付でソートした配列に変換
    const dailyChartData = Object.entries(dailyStats)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    res.render('url-detail', {
      url,
      domain,
      hourlyData,
      dailyChartData,
      appDomain: req.appDomain || 'king-rule.site',
      error: req.query.error || null,
      success: req.query.success || null,
      user: req.user || await User.findById(req.session.userId)
    });
  } catch (err) {
    console.error('URL詳細ページエラー:', err);
    res.redirect('/dashboard?error=URL詳細の取得中にエラーが発生しました');
  }
});

// URL削除
app.get('/urls/delete/:id', isAuthenticated, async (req, res) => {
  try {
    const urlId = req.params.id;
    
    // URLを削除し、そのURLが現在のユーザーに属しているか確認
    const result = await Url.deleteOne({ _id: urlId, userId: req.session.userId });
    
    if (result.deletedCount === 0) {
      return res.redirect('/dashboard?error=URLが見つからないか、削除する権限がありません');
    }
    
    res.redirect('/dashboard?success=URLを削除しました');
  } catch (err) {
    console.error('URL削除エラー:', err);
    res.redirect('/dashboard?error=URLの削除中にエラーが発生しました');
  }
});

// ドメイン追加ページ - プレミアムユーザーのみアクセス可能
app.get('/domains/add', isAuthenticated, freePlanMiddleware.checkCustomDomainPermission, (req, res) => {
  res.render('add-domain', {
    error: req.query.error || null,
    success: req.query.success || null
  });
});

// ドメイン追加処理 - プレミアムユーザーのみ
app.post('/domains/add', isAuthenticated, freePlanMiddleware.checkCustomDomainPermission, async (req, res) => {
  try {
    const { domainName } = req.body;
    
    // ドメイン名の形式チェック
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i.test(domainName)) {
      return res.redirect('/domains/add?error=有効なドメイン名を入力してください');
    }
    
    // ドメインが既に登録されていないかチェック
    const existingDomain = await Domain.findOne({ domainName: domainName.toLowerCase() });
    if (existingDomain) {
      return res.redirect('/domains/add?error=このドメインは既に登録されています');
    }
    
    // 検証コードを生成
    const verificationCode = `verify-${shortid.generate()}`;
    
    // 新しいドメインを作成
    const newDomain = new Domain({
      userId: req.session.userId,
      domainName: domainName.toLowerCase(),
      verificationCode
    });
    
    await newDomain.save();
    
    // 検証ページにリダイレクト
    res.redirect(`/domains/verify/${newDomain._id}`);
  } catch (err) {
    console.error('ドメイン追加エラー:', err);
    res.redirect('/domains/add?error=ドメインの追加中にエラーが発生しました');
  }
});
// ドメイン検証ページ - プレミアムユーザーのみ
app.get('/domains/verify/:id', isAuthenticated, freePlanMiddleware.checkCustomDomainPermission, async (req, res) => {
  try {
    const domainId = req.params.id;
    
    // ドメインを取得し、そのドメインが現在のユーザーに属しているか確認
    const domain = await Domain.findOne({ _id: domainId, userId: req.session.userId });
    
    if (!domain) {
      return res.status(404).render('404', { message: 'ドメインが見つかりません' });
    }
    
    res.render('verify-domain', { domain });
  } catch (err) {
    console.error('ドメイン検証ページエラー:', err);
    res.redirect('/dashboard?error=ドメイン検証ページの表示中にエラーが発生しました');
  }
});

// ドメイン検証処理 - プレミアムユーザーのみ
app.post('/domains/verify/:id', isAuthenticated, freePlanMiddleware.checkCustomDomainPermission, async (req, res) => {
  try {
    const domainId = req.params.id;
    
    // ドメインを取得し、そのドメインが現在のユーザーに属しているか確認
    const domain = await Domain.findOne({ _id: domainId, userId: req.session.userId });
    
    if (!domain) {
      return res.status(404).render('404', { message: 'ドメインが見つかりません' });
    }
    
    // TODO: DNSレコードを実際に確認する処理
    // この例では単純に検証成功としているが、実際にはDNSレコードを確認する必要がある
    
    // 検証済みにする
    domain.verified = true;
    domain.verifiedAt = new Date();
    await domain.save();
    
    res.redirect('/dashboard?success=ドメインの検証が完了しました');
  } catch (err) {
    console.error('ドメイン検証エラー:', err);
    res.redirect(`/domains/verify/${req.params.id}?error=ドメインの検証中にエラーが発生しました`);
  }
});

// ドメイン削除
app.get('/domains/delete/:id', isAuthenticated, async (req, res) => {
  try {
    const domainId = req.params.id;
    
    // ドメインを削除し、そのドメインが現在のユーザーに属しているか確認
    const result = await Domain.deleteOne({ _id: domainId, userId: req.session.userId });
    
    if (result.deletedCount === 0) {
      return res.redirect('/dashboard?error=ドメインが見つからないか、削除する権限がありません');
    }
    
    // そのドメインを使用しているURLを更新
    await Url.updateMany({ domainId }, { domainId: null });
    
    res.redirect('/dashboard?success=ドメインを削除しました');
  } catch (err) {
    console.error('ドメイン削除エラー:', err);
    res.redirect('/dashboard?error=ドメインの削除中にエラーが発生しました');
  }
});

// 新規登録ページ表示
app.get('/register', (req, res) => {
  try {
    // すでにログインしている場合はダッシュボードへリダイレクト
    if (req.session.userId) {
      return res.redirect('/dashboard');
    }
    res.render('register', { error: null });
  } catch (err) {
    console.error('登録ページエラー:', err);
    res.status(500).send('内部サーバーエラーが発生しました');
  }
});

// 新規登録処理
app.post('/register', async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;
    
    // 入力チェック
    if (!username || !email || !password) {
      return res.render('register', { error: '全ての項目を入力してください' });
    }
    
    // パスワード一致チェック
    if (password !== confirmPassword) {
      return res.render('register', { error: 'パスワードが一致しません' });
    }
    
    // ユーザー名かメールアドレスが既に使用されているかチェック
    const existingUser = await User.findOne({
      $or: [{ username }, { email }]
    });
    
    if (existingUser) {
      return res.render('register', { error: 'このユーザー名またはメールアドレスは既に使用されています' });
    }
    
    // 新しいユーザーを作成（パスワードは自動的にハッシュ化される）
    const newUser = new User({
      username,
      email,
      password
    });
    
    await newUser.save();
    
    // 自動的にログイン
    req.session.userId = newUser._id;
    
    res.redirect('/dashboard');
  } catch (err) {
    console.error('登録エラー:', err);
    res.render('register', { error: '登録中にエラーが発生しました' });
  }
});


// ログアウト - 完全な修正版
app.get('/logout', (req, res) => {
  // セッションを破棄
  if (req.session) {
    // セッションを無効化
    req.session.userId = null;
    req.session.destroy((err) => {
      // エラーがあってもクッキーを削除してリダイレクト
      if (err) {
        console.error('ログアウトエラー:', err);
      }
      
      // クッキーを確実に削除
      res.clearCookie('connect.sid', { 
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
      
      // 直接HTMLを返す（リダイレクトが機能しない場合のバックアップ）
      res.send(`
        <html>
        <head>
          <title>ログアウト - ROYAL LINK</title>
          <script>
            // クッキーを削除
            document.cookie = "connect.sid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            // リダイレクト
            window.location.href = "/";
          </script>
        </head>
        <body>
          <p>ログアウトしています...</p>
        </body>
        </html>
      `);
    });
  } else {
    // セッションがない場合はクッキーを削除して直接HTMLを返す
    res.clearCookie('connect.sid', { path: '/' });
    res.send(`
      <html>
      <head>
        <title>ログアウト - ROYAL LINK</title>
        <script>
          // クッキーを削除
          document.cookie = "connect.sid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
          // リダイレクト
          window.location.href = "/";
        </script>
      </head>
      <body>
        <p>ログアウトしています...</p>
      </body>
      </html>
    `);
  }
});

// サブスクリプションプラン一覧ページ
app.get('/subscription/plans', isAuthenticated, async (req, res) => {
  try {
    // ユーザー情報を取得
    const user = await User.findById(req.session.userId);
    
    if (!user) {
      return res.redirect('/login');
    }
    
    // アクティブなサブスクリプションを確認
    const subscription = await Subscription.findOne({ 
      userId: req.session.userId,
      status: 'active'
    });
    
    // PayPalのクライアントIDを渡す
    const paypalClientId = process.env.PAYPAL_CLIENT_ID;
    
    res.render('subscription/plans', {
      user,
      subscription,
      paypalClientId,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('サブスクリプションプランページエラー:', err);
    res.redirect('/dashboard?error=サブスクリプション情報の取得中にエラーが発生しました');
  }
});

// サブスクリプション成功処理
app.get('/subscription/success', isAuthenticated, async (req, res) => {
  try {
    const { subscription_id } = req.query;
    
    if (!subscription_id) {
      return res.redirect('/subscription/plans?error=サブスクリプションIDが見つかりません');
    }
    
    console.log('サブスクリプションID:', subscription_id);
    
    // PayPalからサブスクリプション詳細を取得
    const subscriptionDetails = await paypalHelper.getSubscriptionDetails(subscription_id);
    
    if (!subscriptionDetails.success) {
      console.error('サブスクリプション詳細取得失敗:', subscriptionDetails.error, subscriptionDetails.details);
      return res.redirect('/subscription/plans?error=サブスクリプション情報の取得に失敗しました');
    }
    
    console.log('サブスクリプション詳細:', JSON.stringify(subscriptionDetails.subscription, null, 2));
    
    // 次回支払い日を設定
    let nextPaymentDate;
    if (subscriptionDetails.subscription.billing_info && 
        subscriptionDetails.subscription.billing_info.next_billing_time) {
      nextPaymentDate = new Date(subscriptionDetails.subscription.billing_info.next_billing_time);
    } else {
      // バックアップ: 現在から1か月後
      nextPaymentDate = new Date();
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
    }
    
    // 既存のサブスクリプションを確認
    const existingSubscription = await Subscription.findOne({
      userId: req.session.userId,
      paypalSubscriptionId: subscription_id
    });
    
    if (existingSubscription) {
      // 既存のサブスクリプションを更新
      existingSubscription.status = 'active';
      existingSubscription.nextPaymentDate = nextPaymentDate;
      await existingSubscription.save();
      console.log('既存のサブスクリプションを更新しました:', existingSubscription._id);
    } else {
      // 新しいサブスクリプションを作成
      const subscriptionPlan = subscriptionDetails.subscription.plan_id === process.env.PAYPAL_ANNUAL_PLAN_ID ? 'annual' : 'monthly';
      const amount = subscriptionPlan === 'annual' ? 9800 : 980;
      
      const newSubscription = new Subscription({
        userId: req.session.userId,
        paypalSubscriptionId: subscription_id,
        status: 'active',
        plan: subscriptionPlan,
        startDate: new Date(),
        nextPaymentDate: nextPaymentDate,
        paymentHistory: [{
          paymentId: `initial-${subscription_id}`,
          amount: amount,
          currency: 'JPY',
          status: 'completed'
        }]
      });
      
      await newSubscription.save();
      console.log('新しいサブスクリプションを作成しました:', newSubscription._id);
    }
    
    // ユーザーのプレミアム状態を更新
    await User.findByIdAndUpdate(req.session.userId, { hasPremium: true });
    console.log('ユーザーのプレミアム状態を更新しました:', req.session.userId);
    
    res.redirect('/dashboard?success=サブスクリプションが正常に開始されました');
  } catch (err) {
    console.error('サブスクリプション処理エラー:', err);
    res.redirect('/subscription/plans?error=サブスクリプションの処理中にエラーが発生しました: ' + err.message);
  }
});

// サブスクリプション管理ページ
app.get('/subscription/manage', isAuthenticated, async (req, res) => {
  try {
    // ユーザー情報を取得
    const user = await User.findById(req.session.userId);
    
    if (!user) {
      return res.redirect('/login');
    }
    
    // サブスクリプション情報を取得
    const subscription = await Subscription.findOne({ 
      userId: req.session.userId
    }).sort({ createdAt: -1 });
    
    res.render('subscription/manage', {
      user,
      subscription,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('サブスクリプション管理ページエラー:', err);
    res.redirect('/dashboard?error=サブスクリプション情報の取得中にエラーが発生しました: ' + err.message);
  }
});

// サブスクリプションキャンセル処理
app.post('/subscription/cancel', isAuthenticated, async (req, res) => {
  try {
    // アクティブなサブスクリプションを取得
    const subscription = await Subscription.findOne({ 
      userId: req.session.userId,
      status: 'active'
    });
    
    if (!subscription) {
      return res.redirect('/subscription/manage?error=アクティブなサブスクリプションが見つかりません');
    }
    
    console.log('キャンセル対象のサブスクリプション:', subscription.paypalSubscriptionId);
    
    // PayPalでサブスクリプションをキャンセル
    const cancelResult = await paypalHelper.cancelSubscription(
      subscription.paypalSubscriptionId,
      'ユーザーによる解約リクエスト'
    );
    
    if (!cancelResult.success) {
      console.error('キャンセル失敗:', cancelResult.error, cancelResult.details);
      return res.redirect('/subscription/manage?error=サブスクリプションのキャンセルに失敗しました: ' + cancelResult.error);
    }
    
    // サブスクリプションのステータスを更新
    subscription.status = 'cancelled';
    subscription.endDate = subscription.nextPaymentDate;
    await subscription.save();
    console.log('サブスクリプションをキャンセルしました:', subscription._id);
    
    res.redirect('/subscription/manage?success=サブスクリプションが正常にキャンセルされました。次回更新日まではサービスをご利用いただけます。');
  } catch (err) {
    console.error('サブスクリプションキャンセルエラー:', err);
    res.redirect('/subscription/manage?error=サブスクリプションのキャンセル中にエラーが発生しました: ' + err.message);
  }
});

// PayPalのWebhookエンドポイント
app.post('/paypal-webhook', express.raw({type: 'application/json'}), async (req, res) => {
  try {
    // リクエストボディをパース
    const requestBody = JSON.parse(req.body.toString());
    
    console.log('PayPal Webhookリクエスト受信:', requestBody.event_type);
    
    // Webhookシグネチャを検証
    const verified = await paypalHelper.verifyWebhookSignature(requestBody, req.headers);
    
    if (!verified.success) {
      console.error('PayPal Webhook検証失敗:', verified.error);
      return res.status(400).send('Invalid signature');
    }
    
    const eventType = requestBody.event_type;
    const resourceId = requestBody.resource.id;
    
    console.log('PayPal Webhookイベント検証成功:', eventType, resourceId);
    
    switch (eventType) {
      case 'BILLING.SUBSCRIPTION.CREATED':
        // サブスクリプション作成時の処理
        console.log('サブスクリプション作成イベント:', resourceId);
        break;
        
      case 'BILLING.SUBSCRIPTION.CANCELLED':
        // サブスクリプションがキャンセルされた時の処理
        console.log('サブスクリプションキャンセルイベント:', resourceId);
        await handleSubscriptionCancelled(resourceId);
        break;
        
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        // サブスクリプションが一時停止された時の処理
        console.log('サブスクリプション一時停止イベント:', resourceId);
        await handleSubscriptionSuspended(resourceId);
        break;
        
      case 'BILLING.SUBSCRIPTION.PAYMENT.SUCCEEDED':
        // 支払い成功時の処理
        console.log('支払い成功イベント:', resourceId);
        await handlePaymentSucceeded(requestBody.resource);
        break;
        
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        // 支払い失敗時の処理
        console.log('支払い失敗イベント:', resourceId);
        await handlePaymentFailed(resourceId);
        break;
    }
    
    res.status(200).send('Webhook processed');
  } catch (err) {
    console.error('PayPal Webhookエラー:', err);
    res.status(500).send('Error processing webhook');
  }
});

// サブスクリプションがキャンセルされた時の処理
async function handleSubscriptionCancelled(subscriptionId) {
  try {
    // サブスクリプションのステータスを更新
    const subscription = await Subscription.findOne({ paypalSubscriptionId: subscriptionId });
    
    if (subscription) {
      console.log('サブスクリプションキャンセル処理:', subscription._id);
      subscription.status = 'cancelled';
      await subscription.save();
      
      // 次回更新日が過ぎたらユーザーのプレミアム状態を更新
      const now = new Date();
      const nextPayment = new Date(subscription.nextPaymentDate);
      
      if (now > nextPayment) {
        await User.findByIdAndUpdate(subscription.userId, { hasPremium: false });
        console.log('ユーザーのプレミアム状態を更新しました(false):', subscription.userId);
      }
    }
  } catch (err) {
    console.error('サブスクリプションキャンセル処理エラー:', err);
  }
}

// サブスクリプションが一時停止された時の処理
async function handleSubscriptionSuspended(subscriptionId) {
  try {
    // サブスクリプションのステータスを更新
    const subscription = await Subscription.findOne({ paypalSubscriptionId: subscriptionId });
    
    if (subscription) {
      console.log('サブスクリプション一時停止処理:', subscription._id);
      subscription.status = 'suspended';
      await subscription.save();
      
      // ユーザーのプレミアム状態を更新
      await User.findByIdAndUpdate(subscription.userId, { hasPremium: false });
      console.log('ユーザーのプレミアム状態を更新しました(false):', subscription.userId);
    }
  } catch (err) {
    console.error('サブスクリプション一時停止処理エラー:', err);
  }
}

// 支払い成功時の処理
async function handlePaymentSucceeded(resource) {
  try {
    const subscriptionId = resource.billing_agreement_id;
    const paymentId = resource.id;
    
    // サブスクリプションを検索
    const subscription = await Subscription.findOne({ paypalSubscriptionId: subscriptionId });
    
    if (subscription) {
      console.log('支払い成功処理:', subscription._id, paymentId);
      
      // 次回支払い日を更新
      let nextPaymentDate;
      if (resource.billing_info && resource.billing_info.next_billing_time) {
        nextPaymentDate = new Date(resource.billing_info.next_billing_time);
      } else {
        // バックアップ: 現在から1か月後
        nextPaymentDate = new Date();
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
      }
      subscription.nextPaymentDate = nextPaymentDate;
      
      // 支払い履歴に追加
      subscription.paymentHistory.push({
        paymentId,
        amount: resource.amount && resource.amount.value ? resource.amount.value : subscription.plan === 'annual' ? 9800 : 980,
        currency: resource.amount && resource.amount.currency_code ? resource.amount.currency_code : 'JPY',
        status: 'completed',
        date: new Date()
      });
      
      // ステータスを更新
      subscription.status = 'active';
      
      await subscription.save();
      console.log('サブスクリプションを更新しました:', subscription._id);
      
      // ユーザーのプレミアム状態を更新
      await User.findByIdAndUpdate(subscription.userId, { hasPremium: true });
      console.log('ユーザーのプレミアム状態を更新しました(true):', subscription.userId);
    }
  } catch (err) {
    console.error('支払い成功処理エラー:', err);
  }
}

// 支払い失敗時の処理
async function handlePaymentFailed(subscriptionId) {
  try {
    // サブスクリプションのステータスを更新
    const subscription = await Subscription.findOne({ paypalSubscriptionId: subscriptionId });
    
    if (subscription) {
      console.log('支払い失敗イベント:', subscription._id);
      
      // 支払い履歴に失敗記録を追加
      subscription.paymentHistory.push({
        paymentId: `failed-${Date.now()}`,
        amount: subscription.plan === 'annual' ? 9800 : 980,
        currency: 'JPY',
        status: 'failed',
        date: new Date()
      });
      
      await subscription.save();
      console.log('支払い失敗を記録しました:', subscription._id);
    }
  } catch (err) {
    console.error('支払い失敗処理エラー:', err);
  }
}

// 404ページ（最後に配置）
app.use((req, res) => {
  res.status(404).render('404', { message: 'ページが見つかりません' });
});

// サーバー起動
const server = app.listen(PORT, HOST, () => {
  console.log(`サーバーが http://${HOST}:${PORT} で起動しました`);
});

module.exports = server;