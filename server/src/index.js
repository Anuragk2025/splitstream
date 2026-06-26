import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

// Route imports
import authRoutes from './routes/auth.js';
import groupRoutes from './routes/groups.js';
import expenseRoutes from './routes/expenses.js';
import settlementRoutes from './routes/settlements.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET || 'splitstream-jwt-secret-key-12345';

// Configure CORS
app.use(cors({
  origin: (origin, callback) => {
    // Allow any origin dynamically to support local and hosted clients
    callback(null, true);
  },
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to the SplitStream API!',
    status: 'healthy',
    documentation: 'https://github.com/Anuragk2025/splitstream'
  });
});

// Base health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Register REST API routes
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/settlements', settlementRoutes);

// Socket.io Setup
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
});

// Socket auth middleware
io.use((socket, next) => {
  try {
    // 1. Try to extract token from cookies or auth headers
    const cookieHeader = socket.handshake.headers.cookie;
    let token = null;

    if (cookieHeader) {
      const parsedCookies = Object.fromEntries(
        cookieHeader.split(';').map(c => {
          const parts = c.trim().split('=');
          return [parts[0], parts.slice(1).join('=')];
        })
      );
      token = parsedCookies.token;
    }

    if (!token && socket.handshake.auth) {
      token = socket.handshake.auth.token;
    }

    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }

    // 2. Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    console.error('Socket authentication failed:', err.message);
    next(new Error('Authentication error: Invalid token'));
  }
});

// Share io instance with Express routers
app.set('io', io);

// Socket connections
io.on('connection', (socket) => {
  const userId = socket.user.id;
  const username = socket.user.name;
  console.log(`User connected: ${username} (${userId}) - Socket: ${socket.id}`);

  // Join user's personal room for direct notification alerts
  socket.join(`user_${userId}`);

  // Join a group room
  socket.on('join_group', (groupId) => {
    socket.join(`group_${groupId}`);
    console.log(`User ${username} joined room: group_${groupId}`);
  });

  // Leave a group room
  socket.on('leave_group', (groupId) => {
    socket.leave(`group_${groupId}`);
    console.log(`User ${username} left room: group_${groupId}`);
  });

  // Disconnection handler
  socket.on('disconnect', (reason) => {
    console.log(`User disconnected: ${username} (${userId}) - Reason: ${reason}`);
  });
});

// Start HTTP Server
httpServer.listen(PORT, () => {
  console.log(`SplitStream Server running on port ${PORT}`);
});
