const express = require('express');
const mongoose = require('mongoose');
const Url = require('./models/Url'); // モデルのインポート
const shortid = require('shortid');
const app = express();

// MongoDB接続
mongoose.connect('mongodb://127.0.0.1:27017/url_shortener', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB接続成功'))
  .catch(err => console.error('MongoDB接続エラー:', err));

// ミドルウェア
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

// ダッシュボードを表示
app.get('/dashboard', async (req, res) => {
  try {
    const urls = await Url.find().sort({ createdAt: -1 }); // 全ての短縮URLを取得
    res.render('dashboard', { urls });
  } catch (err) {
    console.error('URL一覧取得エラー:', err);
    res.render('dashboard', { urls: [], error: 'URL一覧の取得中にエラーが発生しました。' });
  }
});

// URLを短縮する
app.post('/shorten', async (req, res) => {
  try {
    const { originalUrl } = req.body;

    if (!originalUrl) {
      return res.redirect('/dashboard?error=URLを入力してください');
    }

    const shortCode = shortid.generate();
    const newUrl = new Url({ originalUrl, shortCode });
    await newUrl.save();

    res.redirect('/dashboard?success=URLが短縮されました');
  } catch (err) {
    console.error('URL短縮エラー:', err);
    res.redirect('/dashboard?error=URL短縮中にエラーが発生しました');
  }
});

// サーバー起動
app.listen(3000, () => console.log('サーバーがポート3000で起動中'));