// models/index.js - モデルの一括エクスポート
const User = require('./User');
const Url = require('./Url');
const Domain = require('./Domain');
const Subscription = require('./Subscription');

// モデル間の関係設定やインデックス作成などの追加設定があればここに記述

module.exports = {
  User,
  Url,
  Domain,
  Subscription
};

// models/index.js - 修正版: モデルの一括エクスポート
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const shortid = require('shortid');

// ユーザーモデル
const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'メールアドレスの形式が正しくありません']
  },
  password: { 
    type: String, 
    required: true,
    minlength: 6
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  hasPremium: { 
    type: Boolean, 
    default: false 
  },
  lastLogin: {
    type: Date
  }
});

// パスワードのハッシュ化
userSchema.pre('save', async function(next) {
  const user = this;
  
  // パスワードが変更されていない場合はスキップ
  if (!user.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// パスワード比較メソッド
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ドメインモデル
const domainSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  domainName: { 
    type: String, 
    required: true,
    trim: true,
    lowercase: true,
    match: [/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i, '有効なドメイン名を入力してください']
  },
  verified: { 
    type: Boolean, 
    default: false 
  },
  verificationCode: { 
    type: String, 
    required: true,
    default: function() { return 'verify-' + shortid.generate(); }
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  verifiedAt: {
    type: Date
  },
  lastCheckedAt: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // DNSレコード設定手順の保存
  dnsSettings: {
    txtRecord: {
      host: { type: String, default: '@' },
      value: { type: String }
    },
    aRecord: {
      host: { type: String, default: '@' },
      value: { type: String }
    }
  }
});

// URLモデル
const urlSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  originalUrl: { 
    type: String, 
    required: true,
    trim: true
  },
  shortCode: { 
    type: String, 
    required: true,
    default: function() { return shortid.generate(); }
  },
  domainId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Domain', 
    default: null 
  },
  customSlug: { 
    type: String, 
    default: null,
    trim: true,
    match: [/^[a-zA-Z0-9-_]+$/, 'カスタムスラグには英数字、ハイフン、アンダースコアのみ使用できます']
  },
  clicks: { 
    type: Number, 
    default: 0 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  // アクセスログ
  accessLogs: [{
    timestamp: { type: Date, default: Date.now },
    ipAddress: { type: String },
    userAgent: { type: String },
    referer: { type: String },
    country: { type: String },
    city: { type: String },
    device: { type: String },
    browser: { type: String }
  }],
  // タグ機能（整理用）
  tags: [{ type: String }],
  // メモ（ユーザーがURLに付けるメモ）
  memo: { type: String },
  // 有効期限（オプション）
  expiresAt: { type: Date },
  // アクティブ状態
  isActive: { type: Boolean, default: true }
});

// サブスクリプションモデル
const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  paypalSubscriptionId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'cancelled', 'expired'],
    default: 'active'
  },
  plan: {
    type: String,
    default: 'premium'
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date
  },
  lastPaymentDate: {
    type: Date,
    default: Date.now
  },
  nextPaymentDate: {
    type: Date,
    required: true
  },
  paymentHistory: [{
    paymentId: String,
    amount: Number,
    currency: String,
    status: String,
    date: {
      type: Date,
      default: Date.now
    }
  }]
});

// インデックスの追加
urlSchema.index({ shortCode: 1 });
urlSchema.index({ customSlug: 1 }, { sparse: true });
domainSchema.index({ domainName: 1 });

// 各モデルを一度だけコンパイル
//const User = mongoose.model('User', userSchema);
//const Domain = mongoose.model('Domain', domainSchema);
//const Url = mongoose.model('Url', urlSchema);
//const Subscription = mongoose.model('Subscription', subscriptionSchema);

// モデルをエクスポート
module.exports = {
  User,
  Domain,
  Url,
  Subscription
};