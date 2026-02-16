const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');
const contentDisposition = require('content-disposition');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const app = express();

app.use(cors());
app.use(express.json());

ffmpeg.setFfmpegPath(ffmpegPath);

const agent = ytdl.createAgent();

app.get('/info', async (req, res) => {
    try {
        const info = await ytdl.getInfo(req.query.url, { agent });
        res.json({ title: info.videoDetails.title, author: info.videoDetails.author.name, thumbnail: info.videoDetails.thumbnails[0].url });
    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.get('/download', async (req, res) => {
    const { url, format } = req.query;
    console.log(`[Fluxo Seguro] Format: ${format}, URL: ${url}`);

    try {
        const info = await ytdl.getInfo(url, { agent });
        const cleanTitle = info.videoDetails.title.replace(/[^\x20-\x7E]/g, "").replace(/["']/g, "");

        if (format === 'mp3') {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Disposition', contentDisposition(`${cleanTitle}.mp3`));

            // ESTRATÉGIA ANTI-BLOQUEIO:
            // 1. Usar itag 18 (MP4 360p). O YouTube raramente bloqueia esse formato pois é o padrão de compatibilidade.
            // 2. Extrair o áudio desse vídeo usando FFmpeg e converter para MP3.

            const videoStream = ytdl(url, {
                quality: '18', // Força formato 18 (vídeo com áudio)
                agent
            });

            const command = ffmpeg(videoStream)
                .inputFormat('mp4')
                .toFormat('mp3')
                .audioBitrate(192)
                .on('start', () => console.log('FFmpeg iniciado (192kbps)...'))
                .on('error', (err) => {
                    console.error('Erro FFmpeg:', err);
                    if (!res.headersSent) res.status(500).end();
                })
                .on('end', () => console.log('Conversão finalizada!'));

            command.pipe(res, { end: true });

        } else {
            // Para MP4 também usamos itag 18 se possível, ou highest caso o usuário queira qualidade
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Content-Disposition', contentDisposition(`${cleanTitle}.mp4`));

            ytdl(url, {
                filter: (f) => f.container === 'mp4' && f.hasAudio && f.hasVideo,
                quality: 'highest', // Tenta a melhor qualidade para vídeo
                agent
            })
                .pipe(res)
                .on('error', (err) => {
                    console.error('Erro MP4:', err);
                    if (!res.headersSent) res.status(500).end();
                });
        }

    } catch (error) {
        console.error('Erro Geral:', error);
        if (!res.headersSent) res.status(500).send('Erro interno');
    }
});

const PORT = 4001;
app.listen(PORT, () => console.log(`Servidor Blindado ON : ${PORT}`));
