const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const Url = require('./models/Url'); // 短縮URLモデルのインポート
const app = express();

// セッション設定
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: false
}));

// ミドルウェア
app.use(express.urlencoded({ extended: true }));

// ダッシュボード表示
app.get('/dashboard', async (req, res) => {
  try {
    const userId = req.session.userId; // セッションからユーザーIDを取得
    if (!userId) {
      return res.redirect('/login'); // 未ログインの場合はログインページにリダイレクト
    }

    const urls = await Url.find({ userId }).sort({ createdAt: -1 }); // ユーザーの短縮URLを取得
    res.render('dashboard', { urls }); // 短縮URLをテンプレートに渡す
  } catch (err) {
    console.error('短縮URL取得エラー:', err);
    res.render('dashboard', { urls: [], error: '短縮URL一覧を取得できませんでした。' });
  }
});

// 短縮URLの作成処理
app.post('/shorten', async (req, res) => {
  try {
    const { originalUrl } = req.body;
    const userId = req.session.userId;

    if (!userId) {
      return res.redirect('/login'); // 未ログインの場合はログインページにリダイレクト
    }

    if (!originalUrl) {
      return res.redirect('/dashboard?error=URLを入力してください');
    }

    const shortCode = Math.random().toString(36).substring(2, 8); // 短縮コードを生成
    const newUrl = new Url({ userId, originalUrl, shortCode });
    await newUrl.save();

    res.redirect('/dashboard?success=URLが短縮されました');
  } catch (err) {
    console.error('URL短縮エラー:', err);
    res.redirect('/dashboard?error=URLの短縮中にエラーが発生しました');
  }
});

// MongoDB接続
mongoose.connect('mongodb://localhost:27017/url_shortener', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB接続成功'))
  .catch(err => console.error('MongoDB接続エラー:', err));

// サーバー起動
app.listen(3000, () => console.log('サーバーがポート3000で起動中'));