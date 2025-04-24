const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const Url = require('./models/Url');
const shortid = require('shortid');
const app = express();
require('dotenv').config();

// MongoDB connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/url_shortener', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connection successful'))
.catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Home page
app.get('/', (req, res) => {
  res.render('home');
});

// Dashboard - Display all shortened URLs
app.get('/dashboard', async (req, res) => {
  try {
    const urls = await Url.find().sort({ createdAt: -1 });
    
    // Default domain name from environment variables or fallback
    const appDomain = process.env.DOMAIN || 'king-rule.site';
    
    res.render('dashboard', { 
      urls, 
      error: req.query.error || null,
      success: req.query.success || null,
      appDomain
    });
  } catch (err) {
    console.error('Error retrieving URL list:', err);
    res.render('dashboard', { 
      urls: [], 
      error: 'Error retrieving URL list',
      success: null,
      appDomain: process.env.DOMAIN || 'king-rule.site'
    });
  }
});

// Shorten a URL
app.post('/shorten', async (req, res) => {
  try {
    const { originalUrl } = req.body;
    
    if (!originalUrl) {
      return res.redirect('/dashboard?error=Please enter a URL');
    }
    
    // Validate URL format
    if (!originalUrl.startsWith('http://') && !originalUrl.startsWith('https://')) {
      return res.redirect('/dashboard?error=Please enter a valid URL with http:// or https://');
    }
    
    // Generate a short code
    const shortCode = shortid.generate();
    
    // Create a new URL document
    const newUrl = new Url({
      originalUrl,
      shortCode,
      userId: 'anonymous', // Replace with actual user ID when auth is implemented
      clicks: 0
    });
    
    // Save to database
    await newUrl.save();
    
    res.redirect('/dashboard?success=URL shortened successfully');
  } catch (err) {
    console.error('Error shortening URL:', err);
    res.redirect('/dashboard?error=Error shortening URL: ' + err.message);
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
    
    // Optional: Add access log entry
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

// Delete a URL
app.get('/urls/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await Url.findByIdAndDelete(id);
    
    res.redirect('/dashboard?success=URL deleted successfully');
  } catch (err) {
    console.error('Error deleting URL:', err);
    res.redirect('/dashboard?error=Error deleting URL');
  }
});

// URL details page
app.get('/urls/detail/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const url = await Url.findById(id);
    
    if (!url) {
      return res.redirect('/dashboard?error=URL not found');
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
      success: null
    });
  } catch (err) {
    console.error('Error retrieving URL details:', err);
    res.redirect('/dashboard?error=Error retrieving URL details');
  }
});

// 404 page
app.use((req, res) => {
  res.status(404).render('404', { message: 'Page not found' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});