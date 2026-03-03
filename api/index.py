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
        opts['cookiefile'] = cookies_path

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
        from flask import Response, stream_with_context
        import urllib.request
        import re

        # Filtros: garante um arquivo unificado em MP4, ou melhor audio se for MP3/M4A
        # Isso evita links de manifestos HLS (m3u8) que o browser abre como player vazio
        ydl_opts = get_ydl_opts()
        ydl_opts['format'] = 'bestaudio[ext=m4a]/bestaudio/best' if fmt == 'mp3' else 'best[ext=mp4]/best'
        ydl_opts['noplaylist'] = True
        
        # Estratégia de Proxy Stream: repassa dados via servidor forçando "attachment"
        try:
             with yt_dlp.YoutubeDL({'forceurl': True, **ydl_opts}) as ydl:
                info = ydl.extract_info(url, download=False)
                direct_url = info.get('url')
                protocol = info.get('protocol', '')
                
                # Só processa se não for um manifesto de streaming (playlist_vid)
                if direct_url and 'm3u8' not in protocol and 'manifest' not in direct_url:
                    # Formata o titulo do arquivo pra um nome seguro
                    safe_title = re.sub(r'[^\w\s-]', '_', info.get('title', 'video')).strip()
                    ext = info.get('ext', 'mp4') if fmt == 'mp4' else 'm4a'
                    
                    req = urllib.request.Request(direct_url, headers={'User-Agent': 'Mozilla/5.0'})
                    resp = urllib.request.urlopen(req)
                    
                    # Cria cabeçalhos que dizem explicitamente: "ISTO DEVE SER BAIXADO!"
                    headers = {
                        'Content-Disposition': f'attachment; filename="{safe_title}.{ext}"',
                        'Content-Type': resp.headers.get('Content-Type', 'application/octet-stream')
                    }
                    if resp.headers.get('Content-Length'):
                        headers['Content-Length'] = resp.headers.get('Content-Length')
                        
                    def generate():
                        while True:
                            chunk = resp.read(1024 * 512)
                            if not chunk: break
                            yield chunk
                            
                    return Response(stream_with_context(generate()), headers=headers)
        except Exception as e:
            print("Proxy stream falhou, tentando fallback local:", str(e))
            pass # Falha proxy, tenta baixar pro disco
            
        # Fallback: Download no servidor (Render tem disco temporário)
        import shutil
        tmpdirname = tempfile.mkdtemp()
        try:
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
                
                safe_title = re.sub(r'[^\w\s-]', '_', info.get('title', 'video')).strip()
                ext_file = 'mp3' if fmt == 'mp3' else 'mp4'

                def generate_and_delete():
                    try:
                        with open(filename, 'rb') as f:
                            while True:
                                chunk = f.read(1024 * 512)
                                if not chunk: break
                                yield chunk
                    finally:
                        try:
                            shutil.rmtree(tmpdirname)
                        except Exception as e:
                            print("Erro ao remover tempdir:", e)

                headers = {
                    'Content-Disposition': f'attachment; filename="{safe_title}.{ext_file}"',
                    'Content-Type': 'audio/mpeg' if fmt == 'mp3' else 'video/mp4'
                }
                
                return Response(stream_with_context(generate_and_delete()), headers=headers)
        except Exception as e:
            try:
                shutil.rmtree(tmpdirname)
            except:
                pass
            raise e

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
