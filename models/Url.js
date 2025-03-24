// models/Url.js - URL短縮モデル
const mongoose = require('mongoose');
const shortid = require('shortid');

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
    default: shortid.generate,
    index: true
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
    sparse: true,
    match: [/^[a-zA-Z0-9-_]+$/, 'カスタムスラグには英数字、ハイフン、アンダースコアのみ使用できます'],
    index: true
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

// メソッド: 完全なURL（ドメイン込み）を生成
urlSchema.methods.getFullUrl = function(appDomain = 'king-rule.site') {
  if (this.domainId && this.populated('domainId')) {
    // domainIdが参照解決されている場合
    const domain = this.domainId;
    if (domain && domain.domainName && domain.verified) {
      if (this.customSlug) {
        return `https://${domain.domainName}/${this.customSlug}`;
      }
      return `https://${domain.domainName}/${this.shortCode}`;
    }
  }
  
  // デフォルトドメインを使用
  if (this.customSlug) {
    return `https://${appDomain}/${this.customSlug}`;
  }
  return `https://${appDomain}/s/${this.shortCode}`;
};

// メソッド: 最近のアクセスを取得
urlSchema.methods.getRecentClicks = function(days = 30) {
  const now = new Date();
  const pastDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  
  return this.accessLogs.filter(log => new Date(log.timestamp) >= pastDate);
};

// メソッド: 時間帯別のアクセス統計を取得
urlSchema.methods.getHourlyStats = function() {
  const hourlyStats = Array(24).fill(0);
  
  this.accessLogs.forEach(log => {
    const hour = new Date(log.timestamp).getHours();
    hourlyStats[hour]++;
  });
  
  return hourlyStats.map((count, hour) => ({ hour, count }));
};

// メソッド: 日別のアクセス統計を取得
urlSchema.methods.getDailyStats = function(days = 30) {
  const now = new Date();
  const pastDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const dailyStats = {};
  
  // 直近30日間の各日付に0を初期化
  for (let i = 0; i < days; i++) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    dailyStats[dateStr] = 0;
  }
  
  // アクセスログを集計
  this.accessLogs.forEach(log => {
    const date = new Date(log.timestamp);
    if (date >= pastDate) {
      const dateStr = date.toISOString().split('T')[0];
      dailyStats[dateStr] = (dailyStats[dateStr] || 0) + 1;
    }
  });
  
  // 配列形式に変換
  return Object.entries(dailyStats)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

const Url = mongoose.model('Url', urlSchema);

module.exports = Url;