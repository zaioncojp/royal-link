const mongoose = require('mongoose');
const shortid = require('shortid');

const urlSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true 
  },
  originalUrl: { 
    type: String, 
    required: true 
  },
  shortCode: { 
    type: String, 
    required: true,
    default: shortid.generate
  },
  customSlug: { 
    type: String, 
    default: null 
  },
  domainId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Domain', 
    default: null 
  },
  clicks: { 
    type: Number, 
    default: 0 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  // Access logs
  accessLogs: [{
    timestamp: { type: Date, default: Date.now },
    ipAddress: { type: String },
    userAgent: { type: String },
    referer: { type: String }
  }]
});

// Method to generate the full URL
urlSchema.methods.getFullUrl = function(appDomain = 'king-rule.site') {
  if (this.customSlug) {
    return `https://${appDomain}/${this.customSlug}`;
  }
  return `https://${appDomain}/s/${this.shortCode}`;
};

module.exports = mongoose.model('Url', urlSchema);