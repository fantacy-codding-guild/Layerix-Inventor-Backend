import app from './app';

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
    console.log(`✅ Server listening on port ${PORT}`);
});

server.on('error', (err: any) => {
    console.error('❌ Server error:', err);
});

server.on('close', () => {
    console.log('⚠️ Server closed');
});
