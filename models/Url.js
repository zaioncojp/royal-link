const mongoose = require('mongoose');

const urlSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  originalUrl: { type: String, required: true },
  shortCode: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// 完全なURLを生成するメソッド
urlSchema.methods.getFullUrl = function(appDomain = 'example.com') {
  return `https://${appDomain}/${this.shortCode}`;
};

module.exports = mongoose.model('Url', urlSchema);