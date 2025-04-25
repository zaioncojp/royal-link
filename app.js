const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const compression = require('compression');
const shortid = require('shortid');
const app = express();
require('dotenv').config();

// Import models
const Url = require('./models/Url');
const User = require('./models/User');
const Domain = require('./models/Domain');
const Subscription = require('./models/Subscription');

// Import middlewares
const { isAuthenticated, getSubscriptionInfo, recoverSession, attachUserData, isPremiumUser } = require('./middlewares/auth');
const { addFreePlanInfo, checkFreePlanLimits, checkAccessStatsPermission, checkCustomDomainPermission } = require('./middlewares/freePlan');

// Fix for Mongoose strictQuery deprecation warning
mongoose.set('strictQuery', false);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/url_shortener', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connection successful'))
.catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(compression()); // Compress responses
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'royal-link-secret-key',
  resave: false,
  saveUninitialized: true,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/url_shortener',
    ttl: 24 * 60 * 60 // Session TTL (1 day)
  }),
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // Cookie lifetime (1 day)
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Custom middleware
app.use(recoverSession); // Session recovery
app.use(getSubscriptionInfo); // Get subscription info
app.use(attachUserData); // Attach user data
app.use(addFreePlanInfo); // Add free plan info

// Home page
app.get('/', (req, res) => {
  try {
    if (req.session.userId) {
      return res.redirect('/dashboard');
    }
    return res.render('home');
  } catch (err) {
    console.error('Homepage error:', err);
    res.status(500).send('ROYAL LINK - Internal server error');
  }
});

// Login page
app.get('/login', (req, res) => {
  try {
    // Redirect to dashboard if already logged in
    if (req.session.userId) {
      return res.redirect('/dashboard');
    }
    res.render('login', { error: req.query.error || null });
  } catch (err) {
    console.error('Login page error:', err);
    res.status(500).send('ROYAL LINK - Internal server error');
  }
});

// Login processing
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Input validation
    if (!username || !password) {
      return res.render('login', { error: 'ユーザー名とパスワードを入力してください' });
    }
    
    // Find user by username or email
    const user = await User.findOne({ 
      $or: [
        { username: username },
        { email: username } // Allow login with email as well
      ]
    });
    
    if (!user) {
      return res.render('login', { error: 'ユーザー名またはパスワードが正しくありません' });
    }
    
    // Validate password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.render('login', { error: 'ユーザー名またはパスワードが正しくありません' });
    }
    
    // Create session
    req.session.userId = user._id;
    
    // Update last login timestamp
    user.lastLogin = new Date();
    await user.save();
    
    // Redirect to destination or dashboard
    const redirectTo = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    
    res.redirect(redirectTo);
  } catch (err) {
    console.error('Login error:', err);
    res.render('login', { error: '予期せぬエラーが発生しました。時間をおいて再度お試しください。' });
  }
});

// Registration page
app.get('/register', (req, res) => {
  try {
    // Redirect to dashboard if already logged in
    if (req.session.userId) {
      return res.redirect('/dashboard');
    }
    res.render('register', { error: req.query.error || null });
  } catch (err) {
    console.error('Registration page error:', err);
    res.status(500).send('ROYAL LINK - Internal server error');
  }
});

// Registration processing
app.post('/register', async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;
    
    // Input validation
    if (!username || !email || !password || !confirmPassword) {
      return res.render('register', { error: '全ての項目を入力してください' });
    }
    
    // Password match check
    if (password !== confirmPassword) {
      return res.render('register', { error: 'パスワードが一致しません' });
    }
    
    // Password length check
    if (password.length < 6) {
      return res.render('register', { error: 'パスワードは6文字以上で設定してください' });
    }
    
    // Username length check
    if (username.length < 3 || username.length > 30) {
      return res.render('register', { error: 'ユーザー名は3〜30文字で設定してください' });
    }
    
    // Email format check
    const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.render('register', { error: '有効なメールアドレスを入力してください' });
    }
    
    // Check for existing username
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.render('register', { error: 'このユーザー名はすでに使用されています' });
    }
    
    // Check for existing email
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.render('register', { error: 'このメールアドレスはすでに使用されています' });
    }
    
    // Create new user
    const newUser = new User({
      username,
      email,
      password,
      createdAt: new Date(),
      hasPremium: false
    });
    
    // Password hashing is handled by User model's pre-save hook
    await newUser.save();
    
    // Auto-login after registration
    req.session.userId = newUser._id;
    
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Registration error:', err);
    res.render('register', { error: '予期せぬエラーが発生しました。時間をおいて再度お試しください。' });
  }
});

// Logout
app.get('/logout', (req, res) => {
  try {
    req.session.destroy(err => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).send('ROYAL LINK - Internal server error');
      }
      res.redirect('/login');
    });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).send('ROYAL LINK - Internal server error');
  }
});

// Dashboard page - Main authenticated user interface
app.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    // Get user's URLs
    const urls = await Url.find({ userId: req.session.userId }).sort({ createdAt: -1 });
    
    // Get user's domains for URL form
    const domains = await Domain.find({ 
      userId: req.session.userId,
      verified: true,
      isActive: true
    });
    
    // Configure hourly stats for analytics
    const hourlyStats = Array(24).fill().map((_, hour) => ({ hour, count: 0 }));
    
    // Process hourly data for charts
    if (urls && urls.length > 0) {
      urls.forEach(url => {
        if (url.accessLogs && url.accessLogs.length > 0) {
          url.accessLogs.forEach(log => {
            const hour = new Date(log.timestamp).getHours();
            hourlyStats[hour].count++;
          });
        }
      });
    }
    
    // Default domain name from environment variables or fallback
    const appDomain = process.env.DOMAIN || 'king-rule.site';
    
    res.render('dashboard', { 
      urls, 
      domains,
      hourlyStats,
      error: req.query.error || null,
      success: req.query.success || null,
      appDomain,
      user: req.user
    });
  } catch (err) {
    console.error('Error retrieving dashboard data:', err);
    res.render('dashboard', { 
      urls: [], 
      domains: [],
      hourlyStats: [],
      error: 'Error retrieving data',
      success: null,
      appDomain: process.env.DOMAIN || 'king-rule.site',
      user: req.user
    });
  }
});

// Shorten a URL
app.post('/shorten', isAuthenticated, checkFreePlanLimits, async (req, res) => {
  try {
    const { originalUrl, customSlug, domainId } = req.body;
    
    // Input validation
    if (!originalUrl) {
      return res.redirect('/dashboard?error=Please enter a URL');
    }
    
    // Validate URL format
    if (!originalUrl.startsWith('http://') && !originalUrl.startsWith('https://')) {
      return res.redirect('/dashboard?error=Please enter a valid URL with http:// or https://');
    }
    
    // Check if custom slug already exists
    if (customSlug) {
      const existingSlug = await Url.findOne({ customSlug });
      if (existingSlug) {
        return res.redirect('/dashboard?error=This custom slug is already in use');
      }
    }
    
    // Generate a short code
    const shortCode = shortid.generate();
    
    // Create URL data object
    let urlData = {
      originalUrl,
      shortCode,
      userId: req.session.userId,
      customSlug: customSlug || null,
      domainId: domainId !== 'default' ? domainId : null,
      clicks: 0
    };
    
    // Apply free plan restrictions if not premium
    if (req.user && !req.user.hasPremium) {
      const { applyFreePlanRestrictions } = require('./middlewares/freePlan');
      if (typeof applyFreePlanRestrictions === 'function') {
        urlData = applyFreePlanRestrictions(urlData, req.user);
      } else {
        // If function is not available, manually apply restrictions
        urlData.customSlug = null;
        urlData.domainId = null;
      }
    }
    
    // Create a new URL document
    const newUrl = new Url(urlData);
    
    // Save to database
    await newUrl.save();
    
    res.redirect('/dashboard?success=URL shortened successfully');
  } catch (err) {
    console.error('Error shortening URL:', err);
    res.redirect('/dashboard?error=Error shortening URL: ' + err.message);
  }
});

// URL details page
app.get('/urls/detail/:id', isAuthenticated, checkAccessStatsPermission, async (req, res) => {
  try {
    const { id } = req.params;
    const url = await Url.findById(id);
    
    // Verify URL exists and belongs to user
    if (!url || url.userId.toString() !== req.session.userId.toString()) {
      return res.redirect('/dashboard?error=URL not found or unauthorized');
    }
    
    // Default domain name
    const appDomain = process.env.DOMAIN || 'king-rule.site';
    
    // Process hourly data for charts
    const hourlyData = [];
    for (let i = 0; i < 24; i++) {
      hourlyData.push({ hour: i, count: 0 });
    }
    
    if (url.accessLogs && url.accessLogs.length > 0) {
      url.accessLogs.forEach(log => {
        const hour = new Date(log.timestamp).getHours();
        hourlyData[hour].count++;
      });
    }
    
    // Create daily data for charts
    const dailyMap = new Map();
    if (url.accessLogs && url.accessLogs.length > 0) {
      url.accessLogs.forEach(log => {
        const date = new Date(log.timestamp);
        const dateStr = date.toISOString().split('T')[0];
        
        if (dailyMap.has(dateStr)) {
          dailyMap.set(dateStr, dailyMap.get(dateStr) + 1);
        } else {
          dailyMap.set(dateStr, 1);
        }
      });
    }
    
    const dailyChartData = Array.from(dailyMap).map(([date, count]) => {
      return { date, count };
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
    
    res.render('url-detail', {
      url,
      appDomain,
      hourlyData,
      dailyChartData,
      error: null,
      success: null,
      user: req.user
    });
  } catch (err) {
    console.error('Error retrieving URL details:', err);
    res.redirect('/dashboard?error=Error retrieving URL details');
  }
});

// Delete a URL
app.get('/urls/delete/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find URL and check if it belongs to the user
    const url = await Url.findById(id);
    if (!url || url.userId.toString() !== req.session.userId.toString()) {
      return res.redirect('/dashboard?error=URL not found or unauthorized');
    }
    
    await Url.findByIdAndDelete(id);
    
    res.redirect('/dashboard?success=URL deleted successfully');
  } catch (err) {
    console.error('Error deleting URL:', err);
    res.redirect('/dashboard?error=Error deleting URL');
  }
});

// Domain routes
// Display domain add page
app.get('/domains/add', isAuthenticated, isPremiumUser, async (req, res) => {
  try {
    res.render('add-domain', {
      error: req.query.error || null,
      user: req.user
    });
  } catch (err) {
    console.error('Error displaying add domain page:', err);
    res.redirect('/dashboard?error=Error loading domain page');
  }
});

// Add new domain
app.post('/domains/add', isAuthenticated, isPremiumUser, async (req, res) => {
  try {
    const { domainName } = req.body;
    
    // Input validation
    if (!domainName) {
      return res.redirect('/domains/add?error=Please enter a domain name');
    }
    
    // Domain format validation
    const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
    if (!domainRegex.test(domainName)) {
      return res.redirect('/domains/add?error=Please enter a valid domain name');
    }
    
    // Check if domain already exists for this user
    const existingDomain = await Domain.findOne({ 
      userId: req.session.userId,
      domainName: domainName.toLowerCase() 
    });
    
    if (existingDomain) {
      return res.redirect('/domains/add?error=You have already added this domain');
    }
    
    // Create new domain
    const newDomain = new Domain({
      userId: req.session.userId,
      domainName: domainName.toLowerCase(),
      verified: false,
      verificationCode: 'verify-' + shortid.generate(),
      createdAt: new Date()
    });
    
    await newDomain.save();
    
    // Redirect to verification page
    res.redirect(`/domains/verify/${newDomain._id}`);
  } catch (err) {
    console.error('Error adding domain:', err);
    res.redirect('/domains/add?error=Error adding domain: ' + err.message);
  }
});

// Domain verification page
app.get('/domains/verify/:id', isAuthenticated, isPremiumUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find domain and check if it belongs to the user
    const domain = await Domain.findById(id);
    if (!domain || domain.userId.toString() !== req.session.userId.toString()) {
      return res.redirect('/dashboard?error=Domain not found or unauthorized');
    }
    
    res.render('verify-domain', {
      domain,
      error: req.query.error || null,
      success: req.query.success || null,
      user: req.user
    });
  } catch (err) {
    console.error('Error displaying verification page:', err);
    res.redirect('/dashboard?error=Error loading verification page');
  }
});

// Process domain verification
app.post('/domains/verify/:id', isAuthenticated, isPremiumUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find domain and check if it belongs to the user
    const domain = await Domain.findById(id);
    if (!domain || domain.userId.toString() !== req.session.userId.toString()) {
      return res.redirect('/dashboard?error=Domain not found or unauthorized');
    }
    
    // Skip verification if already verified
    if (domain.verified) {
      return res.redirect('/dashboard?success=Domain already verified');
    }
    
    // Domain verification logic would go here
    // For simplicity, we're just marking it as verified
    domain.verified = true;
    domain.verifiedAt = new Date();
    await domain.save();
    
    res.redirect('/dashboard?success=Domain verified successfully');
  } catch (err) {
    console.error('Error verifying domain:', err);
    res.redirect(`/domains/verify/${id}?error=Error verifying domain: ${err.message}`);
  }
});

// Redirect to original URL
app.get('/s/:shortCode', async (req, res) => {
  try {
    const { shortCode } = req.params;
    const url = await Url.findOne({ shortCode });
    
    if (!url) {
      return res.status(404).render('404', { message: 'URL not found' });
    }
    
    // Increment click count
    url.clicks = (url.clicks || 0) + 1;
    
    // Add access log entry
    url.accessLogs = url.accessLogs || [];
    url.accessLogs.push({
      timestamp: new Date(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      referer: req.headers.referer || 'direct'
    });
    
    await url.save();
    
    // Redirect to the original URL
    res.redirect(url.originalUrl);
  } catch (err) {
    console.error('Error redirecting to URL:', err);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// Custom slug redirect
app.get('/:customSlug', async (req, res, next) => {
  try {
    const { customSlug } = req.params;
    
    // Skip routing if it's a system route
    if (['login', 'register', 'logout', 'dashboard', 'subscription', 'domains', 'urls', 's', 'public', 'css', 'js', 'img', 'favicon.ico'].includes(customSlug)) {
      return next();
    }
    
    const url = await Url.findOne({ customSlug });
    
    if (!url) {
      return next(); // Pass to next handler if not found
    }
    
    // Increment click count
    url.clicks = (url.clicks || 0) + 1;
    
    // Add access log entry
    url.accessLogs = url.accessLogs || [];
    url.accessLogs.push({
      timestamp: new Date(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      referer: req.headers.referer || 'direct'
    });
    
    await url.save();
    
    // Redirect to the original URL
    res.redirect(url.originalUrl);
  } catch (err) {
    console.error('Error redirecting to custom URL:', err);
    next();
  }
});

// Special page - 特定商取引法に基づく表記
app.get('/tokushoho', (req, res) => {
  res.render('tokushoho');
});

// 404 page
app.use((req, res) => {
  res.status(404).render('404', { message: 'Page not found' });
});

// Start server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});

module.exports = app;