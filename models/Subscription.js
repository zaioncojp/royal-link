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
    type: Date,
    required: true
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

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = Subscription;