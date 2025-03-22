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
const APP_DOMAIN = process.env.APP_DOMAIN || 'king-rule.site';

// ミドルウェア設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 独自ドメイン対応のためのミドルウェア
app.use((req, res, next) => {
  // 実際のホスト名がking-rule.siteまたはwww.king-rule.siteの場合
  if (req.hostname === 'king-rule.site' || req.hostname === 'www.king-rule.site') {
    req.appDomain = APP_DOMAIN;
  } else {
    // ローカル開発や他の環境用
    req.appDomain = req.hostname;
  }
  next();
});

// テンプレートでドメイン情報を使用できるようにする
app.use((req, res, next) => {
  res.locals.domain = req.appDomain;
  next();
});

// セッション設定
app.use(session({
  secret: 'royal-link-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24時間
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

// 認証チェック
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    return next();
  }
  res.redirect('/login');
};

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
  const { username, password } = req.body;
  
  try {
    const user = await User.findOne({ username });
    
    if (!user) {
      return res.render('login', { error: 'ユーザー名またはパスワードが間違っています' });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.render('login', { error: 'ユーザー名またはパスワードが間違っています' });
    }
    
    req.session.userId = user._id;
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.render('login', { error: 'ログイン中にエラーが発生しました' });
  }
});

// 新規登録ページ
app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

// 新規登録処理
app.post('/register', async (req, res) => {
  console.log('登録リクエスト受信:', req.body); // リクエストデータを出力
  
  const { username, email, password, confirmPassword } = req.body;
  
  if (password !== confirmPassword) {
    return res.render('register', { error: 'パスワードが一致しません' });
  }
  
  try {
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    
    if (existingUser) {
      return res.render('register', { error: 'ユーザー名またはメールアドレスが既に使用されています' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const newUser = new User({
      username,
      email,
      password: hashedPassword
    });
    
    await newUser.save();
    
    req.session.userId = newUser._id;
    res.redirect('/dashboard');
  } catch (err) {
    console.error('登録エラー:', err);
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
    const urls = await Url.find({ userId: req.session.userId }).sort({ createdAt: -1 });
    const domains = await Domain.find({ userId: req.session.userId });
    const user = await User.findById(req.session.userId);
    
    res.render('dashboard', { 
      urls, 
      domains, 
      user, 
      error: req.query.error || null, 
      success: req.query.success || null 
    });
  } catch (err) {
    console.error(err);
    res.render('dashboard', { 
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
        url = new Url({
          userId: req.session.userId,
          originalUrl,
          shortCode: shortid.generate(),
          domainId: domain._id,
          customSlug: shortid.generate()
        });
      }
    } else {
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
    
    // 実際のDNS検証は省略し、常に成功とする
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

// リダイレクト処理
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
  console.log(`サーバーが起動しました: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});