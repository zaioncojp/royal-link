// app.js - ROYAL LINKのメインアプリケーション
const express = require('express');
const mongoose = require('mongoose');
const shortid = require('shortid');
const validUrl = require('valid-url');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();

// 環境変数の設定
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DOMAIN = process.env.DOMAIN || 'king-rule.site';

// ミドルウェア設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
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

// セッション設定
app.use(session({
  secret: 'royal-link-secret-key',
  resave: true,
  saveUninitialized: true,
  cookie: { 
    maxAge: 1000 * 60 * 60 * 24, // 24時間
    secure: false // 開発中はfalse、本番環境ではtrueにする
  }
}));

// MongoDB接続
const MONGO_URI = 'mongodb+srv://royaluser:sausu2108@cluster0.7oi5f.mongodb.net/royallink?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDBに接続しました'))
  .catch(err => console.error('MongoDB接続エラー:', err));

// ユーザーモデル
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// ドメインモデル
const domainSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  domainName: { type: String, required: true },
  verified: { type: Boolean, default: false },
  verificationCode: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// URLモデル
const urlSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  originalUrl: { type: String, required: true },
  shortCode: { type: String, required: true },
  domainId: { type: mongoose.Schema.Types.ObjectId, ref: 'Domain', default: null },
  customSlug: { type: String, default: null },
  clicks: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Domain = mongoose.model('Domain', domainSchema);
const Url = mongoose.model('Url', urlSchema);

// 認証チェックミドルウェア
const isAuthenticated = (req, res, next) => {
  console.log('認証チェック、セッション:', req.session);
  
  if (req.session && req.session.userId) {
    console.log('認証成功:', req.session.userId);
    return next();
  }
  
  console.log('認証失敗、ログインへリダイレクト');
  res.redirect('/login');
};

// カスタムスラグによるリダイレクト - ルートパスで直接アクセス (他のルートよりも先に配置)
app.get('/:slug', async (req, res, next) => {
  const slug = req.params.slug;
  
  // システムページ用のパスはスキップ
  if (['login', 'register', 'dashboard', 'domains', 'logout', 's'].includes(slug)) {
    return next();
  }
  
  try {
    // king-rule.site上のカスタムURLを検索
    const customUrl = await Url.findOne({ customSlug: slug });
    
    if (customUrl) {
      // クリック数を増やす
      customUrl.clicks++;
      await customUrl.save();
      
      // 元のURLにリダイレクト
      return res.redirect(customUrl.originalUrl);
    }
    
    // 短縮コードとしても検索
    const codeUrl = await Url.findOne({ shortCode: slug });
    
    if (codeUrl) {
      // クリック数を増やす
      codeUrl.clicks++;
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

// ホームページ
app.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('home');
});

// ログインページ
app.get('/login', (req, res) => {
  res.render('login', { error: null });
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
    
    // 明示的にダッシュボードへリダイレクト
    console.log('ダッシュボードへリダイレクト');
    return res.redirect('/dashboard');
  } catch (err) {
    console.error('ログインエラー:', err);
    return res.render('login', { error: 'ログイン処理中にエラーが発生しました: ' + err.message });
  }
});

// 新規登録ページ
app.get('/register', (req, res) => {
  res.render('register', { error: null });
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
      password: hashedPassword
    });
    
    console.log('ユーザーをデータベースに保存');
    await newUser.save();
    
    console.log('セッション設定');
    req.session.userId = newUser._id;
    
    console.log('ダッシュボードへリダイレクト');
    res.redirect('/dashboard');
  } catch (err) {
    console.error('登録エラー詳細:', err);
    res.render('register', { error: '登録中にエラーが発生しました: ' + err.message });
  }
});

// ログアウト処理
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ダッシュボード
app.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    console.log('ダッシュボード表示リクエスト、ユーザーID:', req.session.userId);
    
    const user = await User.findById(req.session.userId);
    if (!user) {
      console.log('ユーザーが見つかりません');
      req.session.destroy();
      return res.redirect('/login');
    }
    
    const urls = await Url.find({ userId: req.session.userId }).sort({ createdAt: -1 });
    const domains = await Domain.find({ userId: req.session.userId });
    
    console.log('ダッシュボード描画');
    return res.render('dashboard', {
      urls,
      domains,
      user,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('ダッシュボード表示エラー:', err);
    return res.render('dashboard', {
      urls: [],
      domains: [],
      user: null,
      error: 'データの取得中にエラーが発生しました',
      success: null
    });
  }
});

// URL短縮処理
app.post('/shorten', isAuthenticated, async (req, res) => {
  const { originalUrl, domainId, customSlug } = req.body;
  
  if (!originalUrl) {
    return res.redirect('/dashboard?error=URLを入力してください');
  }
  
  if (!validUrl.isUri(originalUrl)) {
    return res.redirect('/dashboard?error=有効なURLを入力してください');
  }
  
  try {
    let url = null;
    
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
      } else {
        const randomSlug = shortid.generate();
        url = new Url({
          userId: req.session.userId,
          originalUrl,
          shortCode: shortid.generate(),
          domainId: domain._id,
          customSlug: randomSlug
        });
      }
    } else {
      // デフォルトドメイン(king-rule.site)を使用
      url = new Url({
        userId: req.session.userId,
        originalUrl,
        shortCode: shortid.generate()
      });
    }
    
    await url.save();
    res.redirect('/dashboard?success=短縮URLが作成されました');
    
  } catch (err) {
    console.error(err);
    res.redirect('/dashboard?error=URL短縮中にエラーが発生しました');
  }
});

// ドメイン追加ページ
app.get('/domains/add', isAuthenticated, (req, res) => {
  res.render('add-domain', { error: null });
});

// ドメイン追加処理
app.post('/domains/add', isAuthenticated, async (req, res) => {
  const { domainName } = req.body;
  
  if (!domainName) {
    return res.render('add-domain', { error: 'ドメイン名を入力してください' });
  }
  
  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
  if (!domainRegex.test(domainName)) {
    return res.render('add-domain', { error: '有効なドメイン名を入力してください' });
  }
  
  try {
    const existingDomain = await Domain.findOne({ domainName });
    
    if (existingDomain) {
      return res.render('add-domain', { error: 'そのドメインは既に登録されています' });
    }
    
    const verificationCode = 'verify-' + shortid.generate();
    
    const newDomain = new Domain({
      userId: req.session.userId,
      domainName,
      verificationCode
    });
    
    await newDomain.save();
    
    res.redirect(`/domains/verify/${newDomain._id}`);
  } catch (err) {
    console.error(err);
    res.render('add-domain', { error: 'ドメイン追加中にエラーが発生しました' });
  }
});

// ドメイン検証ページ
app.get('/domains/verify/:id', isAuthenticated, async (req, res) => {
  try {
    const domain = await Domain.findOne({ 
      _id: req.params.id, 
      userId: req.session.userId 
    });
    
    if (!domain) {
      return res.redirect('/dashboard?error=ドメインが見つかりません');
    }
    
    res.render('verify-domain', { domain });
  } catch (err) {
    console.error(err);
    res.redirect('/dashboard?error=ドメイン検証ページの読み込み中にエラーが発生しました');
  }
});

// ドメイン検証処理
app.post('/domains/verify/:id', isAuthenticated, async (req, res) => {
  try {
    const domain = await Domain.findOne({ 
      _id: req.params.id, 
      userId: req.session.userId 
    });
    
    if (!domain) {
      return res.redirect('/dashboard?error=ドメインが見つかりません');
    }
    
    // 簡易版のため、実際の検証はスキップして検証済みにする
    domain.verified = true;
    await domain.save();
    
    res.redirect('/dashboard?success=ドメインが検証されました');
  } catch (err) {
    console.error(err);
    res.redirect('/dashboard?error=ドメイン検証中にエラーが発生しました');
  }
});

// ドメイン削除処理
app.get('/domains/delete/:id', isAuthenticated, async (req, res) => {
  try {
    await Domain.findOneAndDelete({
      _id: req.params.id,
      userId: req.session.userId
    });
    
    res.redirect('/dashboard?success=ドメインが削除されました');
  } catch (err) {
    console.error(err);
    res.redirect('/dashboard?error=ドメイン削除中にエラーが発生しました');
  }
});

// URL削除処理
app.get('/urls/delete/:id', isAuthenticated, async (req, res) => {
  try {
    await Url.findOneAndDelete({
      _id: req.params.id,
      userId: req.session.userId
    });
    
    res.redirect('/dashboard?success=URLが削除されました');
  } catch (err) {
    console.error(err);
    res.redirect('/dashboard?error=URL削除中にエラーが発生しました');
  }
});

// リダイレクト処理 - 従来の/s/:code形式もサポート
app.get('/s/:code', async (req, res) => {
  try {
    const url = await Url.findOne({ shortCode: req.params.code });
    
    if (url) {
      // クリック数を増やす
      url.clicks++;
      await url.save();
      
      // 元のURLにリダイレクト
      return res.redirect(url.originalUrl);
    } else {
      return res.render('404', { message: 'URLが見つかりません' });
    }
  } catch (err) {
    console.error(err);
    res.render('404', { message: 'リダイレクト中にエラーが発生しました' });
  }
});

// 404ページ
app.use((req, res) => {
  res.status(404).render('404', { message: 'ページが見つかりません' });
});

// サーバー起動
app.listen(PORT, HOST, () => {
  console.log(`サーバーが起動しました:`);
  console.log(`- ローカルアクセス: http://localhost:${PORT}`);
  console.log(`- 本番環境: https://${DOMAIN}`);
});