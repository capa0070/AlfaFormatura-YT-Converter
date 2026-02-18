const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const contentDisposition = require('content-disposition');
const ffmpegPath = require('ffmpeg-static');
const ytpl = require('ytpl');

const app = express();

app.use(cors());
app.use(express.json());

// Aumentar o timeout se necessário (embora streaming responda rápido)
// app.timeout = 300000; 

process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, p) => {
    console.error('UNHANDLED REJECTION:', reason);
});

// Caminho do yt-dlp executável (no Docker usa variável, no Windows usa local)
// OBS: Em deploy Linux (Render), o yt-dlp deve ser instalado no container.
const ytDlpPath = process.env.YT_DLP_PATH || path.join(__dirname, 'yt-dlp.exe');

// Função auxiliar para formatar bytes
const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

// Wrapper para executar yt-dlp e obter JSON com informações do vídeo
const getYtInfo = (url) => {
    return new Promise((resolve, reject) => {
        // --dump-single-json é melhor para garantir um único JSON
        const args = ['--dump-single-json', '--no-warnings', '--no-playlist', url];

        console.log(`Getting info for: ${url}`);
        const child = spawn(ytDlpPath, args);

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            if (code !== 0) {
                console.error(`yt-dlp info error: ${stderr}`);
                return reject(new Error(stderr || 'Erro ao obter informações do vídeo'));
            }
            try {
                const info = JSON.parse(stdout);
                resolve(info);
            } catch (e) {
                console.error('JSON Parse error:', e);
                reject(e);
            }
        });
    });
};

app.get('/info', async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) return res.status(400).send('URL é obrigatória');

        const info = await getYtInfo(url);

        // Tentar estimar tamanho do arquivo
        // yt-dlp geralmente retorna 'filesize_approx' no obj raiz se for stream, ou 'filesize'
        let size = info.filesize || info.filesize_approx || 0;

        res.json({
            title: info.title,
            author: info.uploader || info.channel || 'Desconhecido',
            thumbnail: info.thumbnail,
            resolution: info.resolution || (info.width && info.height ? `${info.width}x${info.height}` : 'HD'),
            size: formatBytes(size)
        });

    } catch (e) {
        console.error('Info Error:', e);
        res.status(500).send(e.message);
    }
});

app.get('/playlist', async (req, res) => {
    try {
        const url = req.query.url;
        console.log(`[Playlist] Fetching: ${url}`);

        // Usando yt-dlp para obter informações da playlist (suporta Mixes e é mais robusto)
        // --flat-playlist: não extrai info detalhada de cada vídeo, apenas lista (muito rápido)
        // --dump-single-json: retorna tudo em um JSON
        const args = ['--flat-playlist', '--dump-single-json', '--no-warnings', url];

        const child = spawn(ytDlpPath, args);

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            if (code !== 0) {
                console.error(`yt-dlp playlist error: ${stderr}`);
                return res.status(500).send(stderr || 'Erro ao obter playlist');
            }

            try {
                const playlistData = JSON.parse(stdout);
                
                // yt-dlp retorna 'entries' para os itens da playlist
                const entries = playlistData.entries || [];
                
                const videos = entries.map(item => ({
                    title: item.title,
                    url: item.url || `https://www.youtube.com/watch?v=${item.id}`,
                    thumbnail: null, // flat-playlist as vezes não traz thumb, mas ok por enquanto
                    author: item.uploader || 'Desconhecido'
                }));

                console.log(`[Playlist] Found ${videos.length} videos.`);
                res.json({
                    title: playlistData.title || 'Playlist',
                    total: videos.length,
                    videos: videos
                });

            } catch (e) {
                console.error('Playlist JSON Parse error:', e);
                res.status(500).send('Erro ao processar dados da playlist');
            }
        });

    } catch (e) {
        console.error('Playlist Error:', e);
        res.status(500).send(e.message);
    }
});

app.get('/download', async (req, res) => {
    const { url, format, quality } = req.query;
    console.log(`[Download] Format: ${format}, Quality: ${quality}, URL: ${url}`);

    if (!url) return res.status(400).send('URL missing');

    let ytDlpProcess = null;

    try {
        // Primeiro, obter informações para limpar o título e configurar headers
        const info = await getYtInfo(url);
        const cleanTitle = (info.title || 'video').replace(/[^\x20-\x7E]/g, "").replace(/["'\/\\:*?"<>|]/g, "_");

        const args = [url, '--ffmpeg-location', ffmpegPath, '--no-warnings', '--no-playlist'];

        if (format === 'mp3') {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Disposition', contentDisposition(`${cleanTitle}.mp3`));

            // Extrair áudio, converter para mp3, pipe para stdout
            args.push(
                '-x',
                '--audio-format', 'mp3',
                '--audio-quality', '0',
                '-o', '-'
            );

        } else {
            // MP4 - COMPATIBILIDADE TOTAL (H.264 + AAC)
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Content-Disposition', contentDisposition(`${cleanTitle}.mp4`));

            args.push('--merge-output-format', 'mp4');

            let heightLimit = 360;
            // 'max' agora também respeita o limite de 1080p pois o usuário pediu remoção de 4k
            if (quality === 'max' || quality === '1080p') heightLimit = 1080;
            else if (quality === '720p') heightLimit = 720;

            // Format Selector Strategy para Compatibilidade de Player:
            // 1. Prioriza Vídeo H.264 (avc1) + Áudio AAC (m4a) até o a altura limite
            // 2. Se não tiver H.264 específico, pega o melhor MP4 até o limite
            // 3. Fallback genérico

            // Nota: bv* é bestvideo, ba é bestaudio. 
            // [vcodec^=avc1] força H.264 que roda em tudo.

            const formatSelector = [
                `bv*[height<=${heightLimit}][vcodec^=avc1]+ba[ext=m4a]`,
                `bv*[height<=${heightLimit}][ext=mp4]+ba[ext=m4a]`,
                `b[height<=${heightLimit}]`
            ].join('/');

            args.push('-f', formatSelector);
            args.push('-o', '-');
        }

        console.log(`Spawn yt-dlp: ${args.join(' ')}`);

        ytDlpProcess = spawn(ytDlpPath, args);

        // Pipe stdout (video data) to res
        ytDlpProcess.stdout.pipe(res);

        // Log stderr for debugging
        ytDlpProcess.stderr.on('data', (data) => {
            // yt-dlp escreve progresso no stderr também
            const msg = data.toString();
            if (!msg.includes('[download]')) {
                console.error(`[yt-dlp stderr]: ${msg}`);
            }
        });

        ytDlpProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`yt-dlp process exited with code ${code}`);
                // Se ainda não enviou headers (pouco provável se for stream), envia erro
                if (!res.headersSent) res.status(500).end();
            } else {
                console.log('Download finished successfully.');
            }
        });

        // Se o cliente desconectar, matar o processo
        req.on('close', () => {
            console.log('Client disconnected, killing yt-dlp process...');
            if (ytDlpProcess) ytDlpProcess.kill();
        });

    } catch (error) {
        console.error('Download Error:', error);
        if (ytDlpProcess) ytDlpProcess.kill();
        if (!res.headersSent) res.status(500).send('Internal Server Error');
    }
});

const PORT = 4001;
app.listen(PORT, () => console.log(`Servidor de Qualidade (yt-dlp) ON : ${PORT}`));
