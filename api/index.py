from flask import Flask, request, jsonify, Response, stream_with_context
import yt_dlp
import os
import tempfile
import shutil
import re
import urllib.request

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
        'nocheckcertificate': True,
        # Simula cliente Android para contornar detecção de bot
        'extractor_args': {
            'youtube': {
                'player_client': ['android', 'web'],
                'player_skip': ['webpage'],
            }
        },
        'http_headers': {
            'User-Agent': 'com.google.android.youtube/17.36.4 (Linux; U; Android 12; GB) gzip',
            'Accept-Language': 'pt-BR,pt;q=0.9',
        },
    }

    # Prioridade 1: Secret File do Render em /etc/secrets/cookies.txt
    secret_file_path = '/etc/secrets/cookies.txt'
    if os.path.exists(secret_file_path):
        print(f"[cookies] Usando Secret File: {secret_file_path}")
        opts['cookiefile'] = secret_file_path

    # Prioridade 2: Variável de ambiente COOKIES_TXT (fallback)
    elif os.environ.get('COOKIES_TXT'):
        cookies_content = os.environ.get('COOKIES_TXT')
        cookies_path = os.path.join(tempfile.gettempdir(), 'yt_cookies.txt')
        with open(cookies_path, 'w', encoding='utf-8') as f:
            f.write(cookies_content)
        print(f"[cookies] Usando env COOKIES_TXT salvo em: {cookies_path}")
        opts['cookiefile'] = cookies_path

    else:
        print("[cookies] AVISO: Nenhum cookie configurado. YouTube pode bloquear o acesso.")

    # Configura Proxy se disponível
    proxy_url = os.environ.get('HTTP_PROXY')
    if proxy_url:
        opts['proxy'] = proxy_url

    return opts

def safe_filename(title):
    return re.sub(r'[^\w\s-]', '_', title or 'video').strip()[:100]

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
            info_data = ydl.extract_info(url, download=False)

            res = {
                'title': info_data.get('title', 'Video'),
                'author': info_data.get('uploader', 'Unknown'),
                'thumbnail': info_data.get('thumbnail', ''),
                'resolution': f"{info_data.get('width')}x{info_data.get('height')}" if info_data.get('width') else 'HD',
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

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info_data = ydl.extract_info(url, download=False)

            entries = info_data.get('entries', [])
            videos = []
            for entry in entries:
                if not entry:
                    continue
                vid_url = entry.get('url')
                if not vid_url:
                    vid_id = entry.get('id')
                    if vid_id:
                        vid_url = f"https://www.youtube.com/watch?v={vid_id}"
                if vid_url:
                    videos.append({
                        'title': entry.get('title', 'Video'),
                        'url': vid_url,
                        'thumbnail': None,
                        'author': entry.get('uploader', 'Unknown')
                    })

            return jsonify({
                'title': info_data.get('title', 'Playlist'),
                'total': len(videos),
                'videos': videos
            })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download', methods=['GET'])
def download():
    url = request.args.get('url')
    fmt = request.args.get('format', 'mp4')

    if not url:
        return jsonify({'error': 'URL missing'}), 400

    try:
        ydl_opts = get_ydl_opts()
        ydl_opts['noplaylist'] = True

        if fmt == 'mp3':
            # Melhor áudio disponível
            ydl_opts['format'] = 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best'
        else:
            # Melhor vídeo MP4 com áudio embutido (evita muxing no servidor)
            ydl_opts['format'] = (
                'bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/'
                'best[ext=mp4]/best'
            )
            ydl_opts['merge_output_format'] = 'mp4'

        # ── Tentativa 1: Stream direto (sem salvar disco) ────────────────────
        try:
            probe_opts = {**ydl_opts}
            with yt_dlp.YoutubeDL(probe_opts) as ydl:
                info_data = ydl.extract_info(url, download=False)

            # Para formatos mesclados o yt-dlp retorna lista de 'requested_formats'
            direct_url = None
            protocol = ''

            req_formats = info_data.get('requested_formats')
            if req_formats:
                # Há mescla de streams → não tem URL única; vai pro fallback no disco
                raise ValueError("Formato requer mescla de streams, usando fallback no disco")

            direct_url = info_data.get('url')
            protocol = info_data.get('protocol', '')

            if not direct_url or 'm3u8' in protocol or 'manifest' in (direct_url or ''):
                raise ValueError("URL direta é manifesto HLS/DASH, usando fallback no disco")

            title = safe_filename(info_data.get('title', 'video'))
            ext = info_data.get('ext', 'mp4') if fmt == 'mp4' else 'm4a'

            req = urllib.request.Request(
                direct_url,
                headers={'User-Agent': 'com.google.android.youtube/17.36.4 (Linux; U; Android 12; GB) gzip'}
            )
            resp = urllib.request.urlopen(req, timeout=30)

            resp_headers = {
                'Content-Disposition': f'attachment; filename="{title}.{ext}"',
                'Content-Type': resp.headers.get('Content-Type', 'application/octet-stream'),
            }
            if resp.headers.get('Content-Length'):
                resp_headers['Content-Length'] = resp.headers.get('Content-Length')

            def gen_proxy():
                while True:
                    chunk = resp.read(512 * 1024)
                    if not chunk:
                        break
                    yield chunk

            return Response(stream_with_context(gen_proxy()), headers=resp_headers)

        except Exception as e:
            print(f"[Stream direto] falhou: {e} — tentando download no disco...")

        # ── Tentativa 2: Fallback – download no disco do servidor ─────────────
        tmpdirname = tempfile.mkdtemp()
        try:
            out_tmpl = os.path.join(tmpdirname, '%(title)s.%(ext)s')
            ydl_opts['outtmpl'] = out_tmpl

            if fmt == 'mp3':
                ydl_opts['postprocessors'] = [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }]

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info_data = ydl.extract_info(url, download=True)
                filename = ydl.prepare_filename(info_data)

                if fmt == 'mp3':
                    filename = os.path.splitext(filename)[0] + '.mp3'
                elif not filename.endswith('.mp4'):
                    # Se o muxing gerou outro nome, procura o mp4 na pasta
                    for f in os.listdir(tmpdirname):
                        if f.endswith('.mp4'):
                            filename = os.path.join(tmpdirname, f)
                            break

            if not os.path.exists(filename) or os.path.getsize(filename) == 0:
                shutil.rmtree(tmpdirname)
                return jsonify({'error': 'Arquivo de mídia vazio ou não encontrado. Tente outro vídeo.'}), 500

            title = safe_filename(info_data.get('title', 'video'))
            ext_file = 'mp3' if fmt == 'mp3' else 'mp4'
            file_size = os.path.getsize(filename)

            def gen_disk():
                try:
                    with open(filename, 'rb') as f:
                        while True:
                            chunk = f.read(512 * 1024)
                            if not chunk:
                                break
                            yield chunk
                finally:
                    try:
                        shutil.rmtree(tmpdirname)
                    except Exception as err:
                        print(f"Erro ao limpar tempdir: {err}")

            disk_headers = {
                'Content-Disposition': f'attachment; filename="{title}.{ext_file}"',
                'Content-Type': 'audio/mpeg' if fmt == 'mp3' else 'video/mp4',
                'Content-Length': str(file_size),
            }

            return Response(stream_with_context(gen_disk()), headers=disk_headers)

        except Exception as e:
            try:
                shutil.rmtree(tmpdirname)
            except Exception:
                pass
            raise e

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)
