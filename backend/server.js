const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client } = require('ssh2');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

const frontendPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendPath));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

io.on('connection', (socket) => {
    console.log('Klien terhubung ke dashboard');
    let sshConn = new Client();
    let logStream = null;

    socket.on('start-ssh', (config) => {
        if (logStream) logStream.destroy();
        
        sshConn.on('ready', () => {
            socket.emit('log', '--- Sistem: Berhasil Masuk ke Server ---');
            
            // Kita gunakan --raw agar PM2 tidak menambah warna, 
            // dan kita akan bersihkan prefix secara manual di backend
            const pm2Cmd = `pm2 logs ${config.processName || ''} --lines 20 --raw`;
            const finalCmd = config.useSudo ? `sudo -S ${pm2Cmd}` : pm2Cmd;

            sshConn.exec(finalCmd, { pty: true }, (err, stream) => {
                if (err) return socket.emit('log', 'ERROR: ' + err.message);
                logStream = stream;

                if (config.useSudo && config.sudoPassword) {
                    stream.write(config.sudoPassword + '\n');
                }

                stream.on('data', (data) => {
                    let text = data.toString();
                    
                    // 1. Bersihkan ANSI Color Codes
                    text = text.replace(/\x1B\[[0-9;]*[mK]/g, '');

                    // 2. Bersihkan PM2 Prefix (misal: "0|wa-bot  | ")
                    // Regex ini mencari pola angka|nama| spasi di awal baris
                    text = text.replace(/^\s*\d+\|[^|]+\|\s*/gm, '');

                    socket.emit('log', text);
                }).stderr.on('data', (data) => {
                    socket.emit('log', 'ERR: ' + data.toString());
                });

                stream.on('close', () => {
                    socket.emit('log', '--- Sistem: Stream Log Tertutup ---');
                });
            });
        }).on('error', (err) => {
            socket.emit('log', 'SSH ERROR: ' + err.message);
        }).connect({
            host: config.host,
            port: 22,
            username: config.username,
            password: config.password,
            readyTimeout: 20000,
            keepaliveInterval: 10000, 
            keepaliveCountMax: 3
        });
    });

    socket.on('stop-ssh', () => {
        if (logStream) logStream.end();
        sshConn.end();
    });

    socket.on('disconnect', () => {
        if (logStream) logStream.end();
        sshConn.end();
    });

    socket.on('pm2-action', (config) => {
        if (!sshConn) return;

        // Susun perintah aksi: pm2 restart [nama]
        const actionCmd = `pm2 ${config.action} ${config.processName || 'all'}`;
        const finalActionCmd = config.useSudo ? `sudo -S ${actionCmd}` : actionCmd;

        sshConn.exec(finalActionCmd, { pty: true }, (err, stream) => {
            if (err) return socket.emit('log', '>>> ERROR AKSI: ' + err.message);

            if (config.useSudo && config.sudoPassword) {
                stream.write(config.sudoPassword + '\n');
            }

            stream.on('data', (data) => {
                const cleanData = data.toString().replace(/\x1B\[[0-9;]*[mK]/g, '');
                socket.emit('log', `[PM2 SYSTEM]: ${cleanData}`);
            });
        });
    });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`SSH Bridge berjalan di http://localhost:${PORT}`);
});