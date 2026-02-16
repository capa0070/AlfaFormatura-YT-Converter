const ytdl = require('@distube/ytdl-core');
const fs = require('fs');

const url = 'https://www.youtube.com/watch?v=ghtYp3SmX34';
console.log('Testando download de:', url);

async function test() {
    try {
        const info = await ytdl.getInfo(url);
        console.log('Título:', info.videoDetails.title);
        const stream = ytdl(url, { filter: 'audioonly' });
        stream.pipe(fs.createWriteStream('test.mp3'));
        stream.on('finish', () => console.log('Sucesso!'));
        stream.on('error', (err) => console.error('Erro na stream:', err));
    } catch (err) {
        console.error('Erro ao pegar info:', err);
    }
}

test();
