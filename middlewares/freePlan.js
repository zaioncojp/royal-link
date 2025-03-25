// middlewares/freePlan.js - 無料プランの制限を実装するミドルウェア
const User = require('../models/User');
const Url = require('../models/Url');
const Subscription = require('../models/Subscription');

/**
 * 無料プランの設定
 */
const freePlanConfig = {
  // 基本ドメイン
  baseDomain: 'king-rule.site',
  
  // 最大URL数
  maxLinks: 3,
  
  // 利用可能な機能
  features: {
    shortening: true,     // 短縮URL作成機能（制限あり）
    customDomain: false,  // カスタムドメイン機能（無効）
    accessStats: false,   // アクセス統計機能（無効）
    customSlug: false     // カスタムスラグ機能（無効）
  }
};

/**
 * 無料プランのユーザーに対する制限を実装するミドルウェア
 * - king-rule.siteドメインのみ使用可能
 * - 最大3つの短縮URLのみ作成可能
 * - カスタムドメイン・アクセス統計は利用不可
 * - カスタムスラグは設定不可
 */
exports.checkFreePlanLimits = async (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login');
  }
  
  try {
    // ユーザー情報を取得
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/login');
    }
    
    // プレミアムユーザーの場合は制限を適用しない
    if (user.hasPremium) {
      return next();
    }
    
    // アクティブなサブスクリプションを確認
    const subscription = await Subscription.findOne({
      userId: req.session.userId,
      status: 'active'
    });
    
    if (subscription) {
      // ユーザーのプレミアムステータスを更新
      user.hasPremium = true;
      await user.save();
      return next();
    }
    
    // 無料プランの場合、URL数の制限をチェック
    const urlCount = await Url.countDocuments({ userId: req.session.userId });
    
    if (urlCount >= freePlanConfig.maxLinks) {
      return res.redirect('/dashboard?error=無料プランでは最大3個までの短縮リンクしか作成できません。プレミアムプランへのアップグレードをご検討ください。');
    }
    
    // カスタムドメインを使用しようとしていないか確認
    if (req.body.domainId && req.body.domainId !== 'default') {
      return res.redirect('/dashboard?error=無料プランではカスタムドメインを使用できません。プレミアムプランへのアップグレードをご検討ください。');
    }
    
    // カスタムスラグが設定されているかチェック
    if (req.body.customSlug) {
      return res.redirect('/dashboard?error=無料プランではカスタムスラグを設定できません。プレミアムプランへのアップグレードをご検討ください。');
    }
    
    // すべての制限をクリアしたらリクエストを続行
    next();
  } catch (err) {
    console.error('無料プラン制限チェックエラー:', err);
    res.redirect('/dashboard?error=リクエスト処理中にエラーが発生しました');
  }
};

/**
 * URL短縮時に無料プランの制限を適用する関数
 * プレミアムでないユーザーのURLデータからカスタムスラグとカスタムドメインを削除
 */
exports.applyFreePlanRestrictions = (urlData, user) => {
  // ユーザーがプレミアムでない場合、無料プランの制限を適用
  if (!user || !user.hasPremium) {
    // カスタムスラグとカスタムドメインを無効化
    urlData.customSlug = null;
    urlData.domainId = null;
  }
  
  return urlData;
};

/**
 * アクセス統計へのアクセス権をチェックするミドルウェア
 * 無料プランユーザーがアクセス統計ページを表示しようとするとダッシュボードにリダイレクト
 */
exports.checkAccessStatsPermission = async (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login');
  }
  
  try {
    // ユーザー情報を取得
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/login');
    }
    
    // 無料プランでアクセス統計を表示しようとしている場合
    if (!user.hasPremium && req.originalUrl.includes('/urls/detail/')) {
      // アクセス統計ではなく基本情報ページにリダイレクト
      return res.redirect('/dashboard?error=アクセス統計はプレミアムプラン限定の機能です。');
    }
    
    // ユーザー情報をリクエストに追加
    req.user = user;
    next();
  } catch (err) {
    console.error('アクセス権チェックエラー:', err);
    res.redirect('/dashboard?error=リクエスト処理中にエラーが発生しました');
  }
};

/**
 * カスタムドメイン機能へのアクセス権をチェックするミドルウェア
 * 無料プランユーザーがカスタムドメイン関連のページを表示しようとするとダッシュボードにリダイレクト
 */
exports.checkCustomDomainPermission = async (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login');
  }
  
  try {
    // ユーザー情報を取得
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/login');
    }
    
    // 無料プランでカスタムドメイン関連ページを表示しようとしている場合
    if (!user.hasPremium) {
      return res.redirect('/subscription/plans?error=カスタムドメイン機能はプレミアムプラン限定の機能です。');
    }
    
    // ユーザー情報をリクエストに追加
    req.user = user;
    next();
  } catch (err) {
    console.error('カスタムドメインアクセス権チェックエラー:', err);
    res.redirect('/dashboard?error=リクエスト処理中にエラーが発生しました');
  }
};

/**
 * テンプレート用の無料プラン情報をレスポンスに追加するミドルウェア
 */
exports.addFreePlanInfo = async (req, res, next) => {
  // レスポンスに無料プラン設定情報を追加
  res.locals.freePlanConfig = freePlanConfig;
  
  // ユーザーが認証済みの場合は、プラン情報も追加
  if (req.session && req.session.userId) {
    try {
      const user = await User.findById(req.session.userId);
      if (user) {
        // ユーザー情報をリクエストに追加
        req.user = user;
        
        // プラン制限情報を追加
        res.locals.planLimits = {
          isFreePlan: !user.hasPremium,
          maxLinks: freePlanConfig.maxLinks,
          canUseCustomDomain: user.hasPremium,
          canUseCustomSlug: user.hasPremium,
          canViewStats: user.hasPremium
        };
      }
    } catch (err) {
      console.error('プラン情報取得エラー:', err);
    }
  }
  
  next();
};

/**
 * 無料プランのURL数制限をチェックして、現在の使用状況を返す
 */
exports.checkFreePlanUrlLimit = async (userId) => {
  try {
    // URLの数をカウント
    const urlCount = await Url.countDocuments({ userId });
    const hasReachedLimit = urlCount >= freePlanConfig.maxLinks;
    
    return {
      currentCount: urlCount,
      maxCount: freePlanConfig.maxLinks,
      hasReachedLimit,
      remainingCount: Math.max(0, freePlanConfig.maxLinks - urlCount)
    };
  } catch (err) {
    console.error('URL数チェックエラー:', err);
    return {
      currentCount: 0,
      maxCount: freePlanConfig.maxLinks,
      hasReachedLimit: false,
      remainingCount: freePlanConfig.maxLinks,
      error: err.message
    };
  }
};

// 無料プラン設定をエクスポート
exports.freePlanConfig = freePlanConfig;