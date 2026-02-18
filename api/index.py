from flask import Flask, request, jsonify, redirect
import yt_dlp
import os

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

@app.route('/api/info', methods=['GET'])
def info():
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'URL missing'}), 400

    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'cache_dir': '/tmp', # Fix for Vercel Read-Only Filesystem
            'noplaylist': True,
        }
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
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'dump_single_json': True,
            'cache_dir': '/tmp', # Fix for Vercel Read-Only Filesystem
        }
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
        ydl_opts = {
            'format': 'bestaudio/best' if fmt == 'mp3' else 'best',
            'quiet': True,
            'forceurl': True,
            'cache_dir': '/tmp', # Fix for Vercel Read-Only Filesystem
            'noplaylist': True,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            direct_url = info.get('url')
            
            if not direct_url:
                formats = info.get('formats', [])
                for f in formats:
                    if f.get('url') and f.get('protocol') in ['https', 'http']:
                        direct_url = f.get('url')
                        break

            if direct_url:
                return redirect(direct_url, code=302)
            else:
                return jsonify({'error': 'Não foi possível extrair o link direto do vídeo.'}), 500

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Vercel look for 'app'
# No need for if __name__ == '__main__' since Vercel handled WSGI
