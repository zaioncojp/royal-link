// routes/auth.js - 認証関連のルート
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { isAuthenticated, recoverSession } = require('../middlewares/auth');

// ホームページ
router.get('/', (req, res) => {
  try {
    if (req.session.userId) {
      return res.redirect('/dashboard');
    }
    return res.render('home');
  } catch (err) {
    console.error('ホームページエラー:', err);
    res.status(500).send('ROYAL LINK - 内部サーバーエラーが発生しました');
  }
});

// ログインページ表示
router.get('/login', (req, res) => {
  try {
    // すでにログインしている場合はダッシュボードへリダイレクト
    if (req.session.userId) {
      return res.redirect('/dashboard');
    }
    res.render('login', { error: null });
  } catch (err) {
    console.error('ログインページエラー:', err);
    res.status(500).send('ROYAL LINK - 内部サーバーエラーが発生しました');
  }
});

// ログイン処理
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // 入力チェック
    if (!username || !password) {
      return res.render('login', { error: 'ユーザー名とパスワードを入力してください' });
    }
    
    // ユーザー検索
    const user = await User.findOne({ 
      $or: [
        { username: username },
        { email: username } // メールアドレスでもログイン可能
      ]
    });
    
    if (!user) {
      return res.render('login', { error: 'ユーザー名またはパスワードが正しくありません' });
    }
    
    // パスワード検証
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render('login', { error: 'ユーザー名またはパスワードが正しくありません' });
    }
    
    // セッション作成
    req.session.userId = user._id;
    
    // 最終ログイン日時を更新
    user.lastLogin = new Date();
    await user.save();
    
    // リダイレクト先があれば、そこにリダイレクト
    const redirectTo = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    
    res.redirect(redirectTo);
  } catch (err) {
    console.error('ログインエラー:', err);
    res.render('login', { error: '予期せぬエラーが発生しました。時間をおいて再度お試しください。' });
  }
});

// 登録ページ表示
router.get('/register', (req, res) => {
  try {
    // すでにログインしている場合はダッシュボードへリダイレクト
    if (req.session.userId) {
      return res.redirect('/dashboard');
    }
    res.render('register', { error: null });
  } catch (err) {
    console.error('登録ページエラー:', err);
    res.status(500).send('ROYAL LINK - 内部サーバーエラーが発生しました');
  }
});

// 登録処理
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;
    
    // 入力チェック
    if (!username || !email || !password || !confirmPassword) {
      return res.render('register', { error: '全ての項目を入力してください' });
    }
    
    // パスワード一致チェック
    if (password !== confirmPassword) {
      return res.render('register', { error: 'パスワードが一致しません' });
    }
    
    // パスワード長チェック
    if (password.length < 6) {
      return res.render('register', { error: 'パスワードは6文字以上で設定してください' });
    }
    
    // ユーザー名の長さチェック
    if (username.length < 3 || username.length > 30) {
      return res.render('register', { error: 'ユーザー名は3〜30文字で設定してください' });
    }
    
    // メールアドレスの形式チェック
    const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.render('register', { error: '有効なメールアドレスを入力してください' });
    }
    
    // ユーザー名の重複チェック
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.render('register', { error: 'このユーザー名はすでに使用されています' });
    }
    
    // メールアドレスの重複チェック
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.render('register', { error: 'このメールアドレスはすでに使用されています' });
    }
    
    // 新規ユーザー作成
    const newUser = new User({
      username,
      email,
      password,
      createdAt: new Date(),
      hasPremium: false
    });
    
    // パスワードのハッシュ化とユーザー保存はUserモデルのpre('save')フックで自動的に行われる
    await newUser.save();
    
    // 自動ログイン
    req.session.userId = newUser._id;
    
    res.redirect('/dashboard');
  } catch (err) {
    console.error('登録エラー:', err);
    res.render('register', { error: '予期せぬエラーが発生しました。時間をおいて再度お試しください。' });
  }
});

// ログアウト処理
router.get('/logout', (req, res) => {
  try {
    req.session.destroy(err => {
      if (err) {
        console.error('ログアウトエラー:', err);
        return res.status(500).send('ROYAL LINK - 内部サーバーエラーが発生しました');
      }
      res.redirect('/login');
    });
  } catch (err) {
    console.error('ログアウトエラー:', err);
    res.status(500).send('ROYAL LINK - 内部サーバーエラーが発生しました');
  }
});

module.exports = router;