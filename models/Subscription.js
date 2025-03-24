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
    enum: ['monthly', 'annual'],
    default: 'monthly'
  },
  startDate: {
    type: Date,
    default: Date.now,
    required: true
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
  }],
  features: {
    customDomains: {
      type: Boolean,
      default: true
    },
    customSlugs: {
      type: Boolean,
      default: true
    },
    unlimitedUrls: {
      type: Boolean,
      default: true
    },
    prioritySupport: {
      type: Boolean,
      default: false
    }
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// プランタイプに基づいて機能を設定
subscriptionSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('planType')) {
    if (this.planType === 'annual') {
      this.features.prioritySupport = true;
    }
  }
  this.updatedAt = new Date();
  next();
});

// インデックスを追加して検索を最適化
subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ paypalSubscriptionId: 1 }, { unique: true });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ nextPaymentDate: 1 });

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = Subscription;