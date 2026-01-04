
const net = require('net');

// Create a TCP proxy
const server = net.createServer((socket) => {
    const client = net.createConnection({ port: 5001, host: 'localhost' });

    socket.pipe(client);
    client.pipe(socket);

    socket.on('error', (err) => console.error('Socket error:', err.message));
    client.on('error', (err) => console.error('Client error:', err.message));
});

server.listen(5000, () => {
    console.log('TCP Proxy running: :5000 -> localhost:5001');
});
