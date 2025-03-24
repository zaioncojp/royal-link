const mongoose = require('mongoose');

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

// 期限切れかどうかを確認するためのメソッド
subscriptionSchema.methods.isExpired = function() {
  return this.status === 'expired' || 
         (this.status === 'cancelled' && new Date() > this.nextPaymentDate);
};

// 有効期限内かどうか確認するためのメソッド
subscriptionSchema.methods.isActive = function() {
  if (this.status === 'active') return true;
  if (this.status === 'cancelled' && new Date() <= this.nextPaymentDate) return true;
  return false;
};

// 残り日数を計算するメソッド
subscriptionSchema.methods.getRemainingDays = function() {
  if (this.status === 'expired') return 0;
  
  const now = new Date();
  const nextPayment = new Date(this.nextPaymentDate);
  
  if (now > nextPayment) return 0;
  
  const diffTime = Math.abs(nextPayment - now);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
};

// 支払い履歴にエントリを追加するメソッド
subscriptionSchema.methods.addPayment = function(paymentData) {
  this.paymentHistory.push(paymentData);
  this.lastPaymentDate = new Date();
  
  // 次回支払い日を更新
  const nextPaymentDate = new Date(this.nextPaymentDate);
  nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
  this.nextPaymentDate = nextPaymentDate;
  
  return this.save();
};

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = Subscription;