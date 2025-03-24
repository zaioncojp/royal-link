// routes/auth.js - 認証関連のルート
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { isAuthenticated } = require('../middlewares/auth');

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
    // すでにログインしている