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