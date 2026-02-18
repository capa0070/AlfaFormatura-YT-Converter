import express from 'express';
import ytdl from '@distube/ytdl-core';
import ytpl from '@distube/ytpl';

const app = express();

app.use(express.json());

// Adicionar headers para tentar evitar bloqueio
const agentOptions = {
    requestOptions: {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        }
    }
};

// Health Check
app.get('/api', (req, res) => {
    res.send('API YT Converter on Vercel is OK (ESM) 🚀');
});

app.get('/api/info', async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) return res.status(400).send('URL é obrigatória');

        if (!ytdl.validateURL(url)) {
            return res.status(400).send('URL inválida');
        }

        // Tenta obter info com opções de agente
        const info = await ytdl.getBasicInfo(url, agentOptions);
        
        // Pega melhor formato disponível
        const format = ytdl.chooseFormat(info.formats, { quality: 'highest' });

        res.json({
            title: info.videoDetails.title,
            author: info.videoDetails.author.name,
            thumbnail: info.videoDetails.thumbnails[0].url,
            resolution: format.qualityLabel || 'HD',
            size: 'N/A' // ytdl-core não fornece tamanho fácil sem content-length
        });

    } catch (e) {
        console.error('Info Error:', e);
        res.status(500).json({ error: e.message || 'Erro ao processar vídeo' });
    }
});

app.get('/api/playlist', async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) return res.status(400).send('URL é obrigatória');

        const playlist = await ytpl(url, { limit: Infinity });
        
        const videos = playlist.items.map(item => ({
            title: item.title,
            url: item.shortUrl,
            thumbnail: item.bestThumbnail.url,
            author: item.author.name
        }));

        res.json({
            title: playlist.title,
            total: videos.length,
            videos: videos
        });

    } catch (e) {
        console.error('Playlist Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/download', async (req, res) => {
    const { url, format } = req.query;
    if (!url) return res.status(400).send('URL missing');

    try {
        const info = await ytdl.getBasicInfo(url, agentOptions);
        const title = info.videoDetails.title.replace(/[^\x20-\x7E]/g, "").replace(/["'\/\\:*?"<>|]/g, "_");

        // Define headers de download
        res.header('Content-Disposition', `attachment; filename="${title}.${format || 'mp4'}"`);

        if (format === 'mp3') {
           // Vercel Serverless tem limite de tempo (10s free).
           // Conversão real com ffmpeg NÃO é viável aqui.
           // Vamos fazer stream direto do formato 'audioonly'.
           // Provavelmente será m4a/webm, mas o navegador toca.
           ytdl(url, { ...agentOptions, filter: 'audioonly', quality: 'highestaudio' }).pipe(res);
        } else {
            // Video
            ytdl(url, { ...agentOptions, quality: 'highest' }).pipe(res);
        }

    } catch (error) {
        console.error('Download Error:', error);
        // Se já começou o pipe, não dá pra mandar JSON.
        if (!res.headersSent) {
            res.status(500).send('Error during download: ' + error.message);
        }
    }
});

// Export default para usar com "type": "module"
export default app;
