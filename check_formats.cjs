const ytdl = require('@distube/ytdl-core');
const url = 'https://www.youtube.com/watch?v=ghtYp3SmX34';
const agent = ytdl.createAgent();

async function check() {
    const info = await ytdl.getInfo(url, { agent });
    console.log('Formatos Disponíveis:');
    info.formats.forEach(f => {
        console.log(`ITAG: ${f.itag}, Ext: ${f.container}, Q: ${f.qualityLabel || f.audioQuality}, HasV: ${f.hasVideo}, HasA: ${f.hasAudio}, URL: ${f.url ? 'YES' : 'NO'}`);
    });
}
check();
