const express = require('express');
const ytdl = require('@distube/ytdl-core');
const ytpl = require('@distube/ytpl');

const app = express();

app.use(express.json());

// Health Check
app.get('/api', (req, res) => {
    res.send('API YT Converter on Vercel is OK 🚀');
});

app.get('/api/info', async (req, res) => {
    try {
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
            size: 'N/A' // ytdl-core doesn't always give size easily without content-length check
        });

    } catch (e) {
        console.error('Info Error:', e);
        res.status(500).send(e.message);
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
        res.status(500).send(e.message);
    }
});

app.get('/api/download', async (req, res) => {
    const { url, format } = req.query;
    if (!url) return res.status(400).send('URL missing');

    try {
        const info = await ytdl.getBasicInfo(url);
        const title = info.videoDetails.title.replace(/[^\x20-\x7E]/g, "").replace(/["'\/\\:*?"<>|]/g, "_");

        res.header('Content-Disposition', `attachment; filename="${title}.${format || 'mp4'}"`);

        if (format === 'mp3') {
           // Vercel Serverless limits execution time (10s free). 
           // Real conversion with ffmpeg is NOT viable here.
           // We will stream the audio-only format directly.
           // It will likely be m4a or webm, but we label as requested.
           // Browsers might play it or save it.
           ytdl(url, { filter: 'audioonly', quality: 'highestaudio' }).pipe(res);
        } else {
            // Video
            ytdl(url, { quality: 'highest' }).pipe(res);
        }

    } catch (error) {
        console.error('Download Error:', error);
        res.status(500).send('Error during download');
    }
});

module.exports = app;
