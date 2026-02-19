from flask import Flask, request, jsonify, redirect, send_file
import yt_dlp
import os
import tempfile

app = Flask(__name__)

# Configuração simples do CORS
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

@app.route('/api', methods=['GET'])
def health():
    return "API YT Converter (Python/Flask) is OK 🚀"

def get_ydl_opts():
    opts = {
        'quiet': True,
        'no_warnings': True,
        'cache_dir': '/tmp',
        'nocheckcertificate': True,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    }
    
    # Verifica se temos cookies configurados na variável de ambiente
    cookies_content = os.environ.get('COOKIES_TXT')
    if cookies_content:
        # Cria um arquivo de cookies temporário
        cookies_path = os.path.join(tempfile.gettempdir(), 'youtube_cookies.txt')
        with open(cookies_path, 'w', encoding='utf-8') as f:
            f.write(cookies_content)
    # Configura Proxy se disponível (necessário para Geo-Block BR)
    proxy_url = os.environ.get('HTTP_PROXY')
    if proxy_url:
         opts['proxy'] = proxy_url
         
    return opts

@app.route('/api/info', methods=['GET'])
def info():
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'URL missing'}), 400

    try:
        ydl_opts = get_ydl_opts()
        ydl_opts['skip_download'] = True
        ydl_opts['noplaylist'] = True
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            res = {
                'title': info.get('title', 'Video'),
                'author': info.get('uploader', 'Unknown'),
                'thumbnail': info.get('thumbnail', ''),
                'resolution': f"{info.get('width')}x{info.get('height')}" if info.get('width') else 'HD',
                'size': 'N/A' 
            }
            return jsonify(res)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/playlist', methods=['GET'])
def playlist():
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'URL missing'}), 400

    try:
        ydl_opts = get_ydl_opts()
        ydl_opts['extract_flat'] = True
        ydl_opts['dump_single_json'] = True
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            entries = info.get('entries', [])
            videos = []
            for entry in entries:
                if not entry: continue
                
                vid_url = entry.get('url')
                if not vid_url:
                     vid_id = entry.get('id')
                     if vid_id: vid_url = f"https://www.youtube.com/watch?v={vid_id}"
                
                if vid_url:
                    videos.append({
                        'title': entry.get('title', 'Video'),
                        'url': vid_url,
                        'thumbnail': None,
                        'author': entry.get('uploader', 'Unknown')
                    })

            res = {
                'title': info.get('title', 'Playlist'),
                'total': len(videos),
                'videos': videos
            }
            return jsonify(res)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download', methods=['GET'])
def download():
    url = request.args.get('url')
    fmt = request.args.get('format', 'mp4')
    
    if not url:
        return jsonify({'error': 'URL missing'}), 400

    try:
        # Tenta obter URL direta primeiro (redirect)
        # Se falhar (por exemplo, 403 do youtube ou necessidade de merge), baixamos no servidor
        
        ydl_opts = get_ydl_opts()
        ydl_opts['format'] = 'bestaudio/best' if fmt == 'mp3' else 'best'
        ydl_opts['noplaylist'] = True
        
        # Estratégia híbrida: Tenta pegar URL direta primeiro
        try:
             with yt_dlp.YoutubeDL({'forceurl': True, **ydl_opts}) as ydl:
                info = ydl.extract_info(url, download=False)
                direct_url = info.get('url')
                if direct_url:
                    return redirect(direct_url, code=302)
        except Exception:
            pass # Falhou redirect, tentar baixar localmente
            
        # Fallback: Download no servidor (Render tem disco temporário)
        with tempfile.TemporaryDirectory() as tmpdirname:
            out_tmpl = os.path.join(tmpdirname, '%(title)s.%(ext)s')
            ydl_opts['outtmpl'] = out_tmpl
            
            # Se for MP3, precisa converter
            if fmt == 'mp3':
                ydl_opts['postprocessors'] = [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }]

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                filename = ydl.prepare_filename(info)
                
                if fmt == 'mp3':
                    filename = os.path.splitext(filename)[0] + '.mp3'
                
                return send_file(filename, as_attachment=True)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
