// models/Subscription.js
const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  paypalSubscriptionId: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'cancelled', 'expired'],
    default: 'active'
  },
  planType: {
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
    type: Date
  },
  nextPaymentDate: {
    type: Date
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
  }],
  // 失敗した支払いの回数
  failedPayments: {
    type: Number,
    default: 0
  },
  // メタデータ（追加情報）
  metadata: {
    type: Map,
    of: String
  }
});

// メソッド: 有効期限が切れているか確認
subscriptionSchema.methods.isExpired = function() {
  if (this.status === 'expired') return true;
  if (this.status === 'cancelled' && this.endDate && new Date() > this.endDate) return true;
  return false;
};

// メソッド: アクティブか確認
subscriptionSchema.methods.isActive = function() {
  return this.status === 'active';
};

// メソッド: キャンセルされたか確認
subscriptionSchema.methods.isCancelled = function() {
  return this.status === 'cancelled';
};

// 静的メソッド: ユーザーのアクティブなサブスクリプションを取得
subscriptionSchema.statics.findActiveByUserId = function(userId) {
  return this.findOne({
    userId: userId,
    status: 'active'
  });
};

// Webhookから支払い情報を更新
subscriptionSchema.methods.updateFromPayment = function(paymentData) {
  if (!this.paymentHistory) {
    this.paymentHistory = [];
  }
  
  this.paymentHistory.push({
    paymentId: paymentData.id,
    amount: parseFloat(paymentData.amount.value),
    currency: paymentData.amount.currency_code,
    status: paymentData.status,
    date: new Date(paymentData.time)
  });
  
  this.lastPaymentDate = new Date();
  
  // 失敗した場合
  if (paymentData.status === 'failed') {
    this.failedPayments += 1;
  } else {
    // 成功した場合はリセット
    this.failedPayments = 0;
  }
  
  // 次回支払日を更新
  if (paymentData.next_payment_date) {
    this.nextPaymentDate = new Date(paymentData.next_payment_date);
  }
  
  return this;
};

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = Subscription;