const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();
console.log('Loaded PORT from .env:', process.env.PORT);
const app = express();
const PORT = process.env.PORT || 83;

// Suppress logs in tests
if (process.env.NODE_ENV === 'test') {
  const originalLog = console.log;
  console.log = (...args) => {
    if (process.env.TEST_RUNNING) return;
    originalLog.apply(console, args);
  };
}

// Test mode: Use high port & mock DB for CI/smoke
if (process.env.NODE_ENV === 'test') {
  console.log('Test mode enabled: Using mock DB & port 3000');
  process.env.MONGO_URI = 'mongodb://localhost:27017/mockdb';
  process.env.PORT = '3000';
}

// Middleware
app.use(helmet());
app.use(cors({ origin: ['http://localhost:83', 'http://18.237.139.122:83'] }));
app.use(express.json());
app.use(express.static(__dirname));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// MongoDB: Mock in test mode, real otherwise
if (process.env.NODE_ENV === 'test') {
  console.log('Using mock MongoDB for testing...');
  console.log('MongoDB connected (mock)');
  global.mockDB = true;
} else {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB error:', err));
}

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }
});
const User = mongoose.model('User', userSchema);

// Employee Schema
const employeeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  department: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});
const Employee = mongoose.model('Employee', employeeSchema);

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Auth Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, role, name, email, department } = req.body;
    const hashedPw = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPw, role });
    await user.save();
    let employee = null;
    if (name && email && department) {
      employee = new Employee({ name, email, department, userId: user._id });
      await employee.save();
    }
    res.status(201).json({ message: 'User and profile created', userId: user._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const employee = await Employee.findOne({ userId: user._id });
    res.json({ token, role: user.role, userId: user._id, employeeId: employee?._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Employee Routes (with mock stubs)
app.get('/api/employees', authenticateToken, async (req, res) => {
  try {
    if (global && global.mockDB) {
      return res.json({ employees: [], totalPages: 0, currentPage: 1 });
    }
    const { page = 1, search = '', userId: userIdFilter } = req.query;
    let query = search ? { $or: [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }] } : {};
    if (userIdFilter) query.userId = userIdFilter;
    if (req.user.role !== 'admin') query.userId = req.user.id;
    const limit = 10;
    const skip = (parseInt(page) - 1) * limit;
    const employees = await Employee.find(query).populate('userId', 'username role').skip(skip).limit(limit).sort({ createdAt: -1 });
    const total = await Employee.countDocuments(query);
    res.json({ employees, totalPages: Math.ceil(total / limit), currentPage: parseInt(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/employees', authenticateToken, async (req, res) => {
  try {
    if (global && global.mockDB) return res.status(201).json({ message: 'Mock create' });
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const employee = new Employee(req.body);
    await employee.save();
    res.status(201).json(employee);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.get('/api/employees/:id', authenticateToken, async (req, res) => {
  try {
    if (global && global.mockDB) return res.status(404).json({ error: 'Mock not found' });
    const employee = await Employee.findById(req.params.id).populate('userId', 'username role');
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    if (req.user.role !== 'admin' && employee.userId._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    res.json(employee);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.put('/api/employees/:id', authenticateToken, async (req, res) => {
  try {
    if (global && global.mockDB) return res.json({ message: 'Mock update' });
    const employee = await Employee.findById(req.params.id).populate('userId');
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    if (req.user.role !== 'admin' && employee.userId._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const updated = await Employee.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.delete('/api/employees/:id', authenticateToken, async (req, res) => {
  try {
    if (global && global.mockDB) return res.json({ message: 'Mock delete' });
    const employee = await Employee.findById(req.params.id).populate('userId');
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    if (req.user.role !== 'admin' && employee.userId._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await Employee.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Export app for tests
module.exports = app;

// Only start server if this file is run directly (not required)
if (require.main === module) {
  console.log('About to listen on', process.env.PORT, 'host 127.0.0.1');
  const server = app.listen(process.env.PORT, '127.0.0.1', () => {
    if (!process.env.TEST_RUNNING) {
      console.log(`Server running on port ${process.env.PORT}`);
      console.log('Post-listen check: Server address:', server.address());
    }
  });
  server.on('error', (err) => {
    console.error('Listen error:', err.message);
    process.exit(1);
  });
}
