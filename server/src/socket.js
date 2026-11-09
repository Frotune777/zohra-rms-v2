const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('./config/db');

let io;

const init = (server) => {
    io = socketIo(server, {
        cors: {
            origin: process.env.CLIENT_URL || 'http://localhost:3002',
            methods: ["GET", "POST"]
        }
    });

    io.use(async (socket, next) => {
        try {
            const claims = jwt.verify(socket.handshake.auth?.token || '', process.env.JWT_SECRET);
            const user = (await db.query('SELECT id,role,status FROM users WHERE id=$1', [claims.id])).rows[0];
            if (!user || user.status !== 'active') return next(new Error('Unauthorized'));
            socket.user = user;
            next();
        } catch { next(new Error('Unauthorized')); }
    });
    io.on('connection', (socket) => {
        console.log('New client connected: ' + socket.id);

        socket.on('join_kitchen', () => {
            socket.join('kitchen');
            console.log(`Socket ${socket.id} joined kitchen room`);
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected: ' + socket.id);
        });
    });

    return io;
};

const getIo = () => {
    if (!io) {
        throw new Error("Socket.io not initialized!");
    }
    return io;
};

module.exports = { init, getIo };
