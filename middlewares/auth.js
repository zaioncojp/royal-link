// middlewares/auth.js - 認証関連のミドルウェア
const User = require('../models/User');
const Subscription = require('../models/Subscription');

/**
 * ユーザーがログインしているか確認するミドルウェア
 */
exports.isAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  
  // リファラーを保存してログイン後にリダイレクト
  const returnTo = req.originalUrl;
  if (returnTo && returnTo !== '/login' && returnTo !== '/logout') {
    req.session.returnTo = returnTo;
  }
  
  res.redirect('/login');
};

/**
 * ユーザーがプレミアムユーザーかどうかを確認するミドルウェア
 * すべての機能はプレミアムユーザーのみ利用可能
 */
exports.isPremiumUser = async (req, res, next) => {
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

/**
 * サブスクリプション情報を取得するミドルウェア
 */
exports.getSubscriptionInfo = async (req, res, next) => {
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

/**
 * セッション復旧ミドルウェア
 * クエリパラメータでユーザーIDが渡された場合にセッションを再構築する
 * 一時的な対策として使用（セッション問題の解決策）
 */
exports.recoverSession = async (req, res, next) => {
  const userId = req.query.userId;
  
  if (userId && !req.session.userId) {
    try {
      const user = await User.findById(userId);
      if (user) {
        req.session.userId = userId;
        req.session.save((err) => {
          if (err) {
            console.error('セッション回復エラー:', err);
          }
          next();
        });
      } else {
        next();
      }
    } catch (err) {
      console.error('セッション回復エラー:', err);
      next();
    }
  } else {
    next();
  }
};