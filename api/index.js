import express from 'express';

const app = express();

app.use(express.json());

// Rota raiz da API para verificação de status (Health Check)
app.get('/api', (req, res) => {
    res.status(200).json({ 
        status: 'online', 
        message: 'API YT Converter está rodando! 🚀',
        version: '1.0.1',
        env: process.env.NODE_ENV
    });
});

app.get('/api/info', async (req, res) => {
    try {
        // Lazy load para evitar crash na inicialização
        const ytdl = (await import('@distube/ytdl-core')).default;

        const url = req.query.url;
        if (!url) return res.status(400).send('URL é obrigatória');

        if (!ytdl.validateURL(url)) {
            return res.status(400).send('URL inválida');
        }

        const info = await ytdl.getBasicInfo(url);
        const format = ytdl.chooseFormat(info.formats, { quality: 'highest' });

        res.json({
            title: info.videoDetails.title,
            author: info.videoDetails.author.name,
            thumbnail: info.videoDetails.thumbnails[0].url,
            resolution: format.qualityLabel || 'HD',
            size: 'N/A' 
        });

    } catch (e) {
        console.error('Info Error:', e);
        res.status(500).send(e.message || 'Erro ao obter informações');
    }
});

app.get('/api/playlist', async (req, res) => {
    try {
        // Lazy load
        const ytpl = (await import('@distube/ytpl')).default;

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
        res.status(500).send(e.message || 'Erro ao processar playlist');
    }
});

app.get('/api/download', async (req, res) => {
    const { url, format } = req.query;
    if (!url) return res.status(400).send('URL missing');

    try {
        // Lazy load
        const ytdl = (await import('@distube/ytdl-core')).default;

        const info = await ytdl.getBasicInfo(url);
        const title = info.videoDetails.title.replace(/[^\x20-\x7E]/g, "").replace(/["'\/\\:*?"<>|]/g, "_");

        res.header('Content-Disposition', `attachment; filename="${title}.${format || 'mp4'}"`);

        if (format === 'mp3') {
           ytdl(url, { filter: 'audioonly', quality: 'highestaudio' }).pipe(res);
        } else {
            ytdl(url, { quality: 'highest' }).pipe(res);
        }

    } catch (error) {
        console.error('Download Error:', error);
        res.status(500).send('Error during download');
    }
});

export default app;
