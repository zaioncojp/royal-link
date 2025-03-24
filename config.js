// config.js
require('dotenv').config();

module.exports = {
  // サーバー設定
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
    domain: process.env.DOMAIN || 'king-rule.site',
    nodeEnv: process.env.NODE_ENV || 'development'
  },
  
  // MongoDB設定
  mongodb: {
    uri: process.env.MONGO_URI || 'mongodb+srv://royaluser:sausu2108@cluster0.7oi5f.mongodb.net/royallink?retryWrites=true&w=majority&appName=Cluster0',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  },
  
  // セッション設定
  session: {
    secret: process.env.SESSION_SECRET || 'royal-link-secret-key',
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 24時間
      secure: process.env.NODE_ENV === 'production'
    }
  },
  
  // PayPal設定
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID || 'AR-v6denWr1Ip-CY0KVr_MWh6JBEFoXp_ZQhhEGRNjpUDgjedN4kcOzPb0i1tLfrM3MYcVqExkNyyoMc',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || 'YOUR_PAYPAL_CLIENT_SECRET',
    webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
    planId: process.env.PAYPAL_PLAN_ID || 'P-5GM64833J5530234JM7QPGWI',
    mode: process.env.NODE_ENV === 'production' ? 'live' : 'sandbox'
  },
  
  // プレミアムプラン設定
  premium: {
    monthlyPrice: 980,
    planId: process.env.PAYPAL_PLAN_ID || 'P-5GM64833J5530234JM7QPGWI'
  },
  
  // サーバーIP（ドメイン検証用）
  serverIp: process.env.SERVER_IP || '123.456.789.012'
};