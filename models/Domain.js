// models/Domain.js - カスタムドメインモデル
const mongoose = require('mongoose');
const shortid = require('shortid');

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
    index: true,
    match: [/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i, '有効なドメイン名を入力してください']
  },
  verified: { 
    type: Boolean, 
    default: false 
  },
  verificationCode: { 
    type: String, 
    required: true,
    default: () => 'verify-' + shortid.generate()
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

// ドメイン検証前に実行
domainSchema.pre('save', function(next) {
  if (this.isNew) {
    // 新規作成時にDNS設定情報を生成
    this.dnsSettings = {
      txtRecord: {
        host: '@',
        value: this.verificationCode
      },
      aRecord: {
        host: '@',
        value: process.env.SERVER_IP || '123.456.789.012'
      }
    };
  }
  
  // 検証済みに変更された場合
  if (this.isModified('verified') && this.verified) {
    this.verifiedAt = new Date();
  }
  
  next();
});

// ドメインのフルURLを生成するメソッド
domainSchema.methods.getFullUrl = function(path = '') {
  // pathの先頭に/があれば削除
  if (path.startsWith('/')) {
    path = path.substring(1);
  }
  
  return `https://${this.domainName}/${path}`;
};

const Domain = mongoose.model('Domain', domainSchema);

module.exports = Domain;