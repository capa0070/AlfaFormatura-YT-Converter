from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import json
import yt_dlp
import os

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        query = parse_qs(parsed_path.query)

        # CORS
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With, content-type')
        
        if path == '/api':
            self.send_header('Content-type', 'text/plain')
            self.end_headers()
            self.wfile.write('API YT Converter (Python) is OK 🚀'.encode('utf-8'))
            return

        # INFO ENDPOINT
        if path == '/api/info':
            url = query.get('url', [None])[0]
            if not url:
                self.send_error_json(400, 'URL missing')
                return

            try:
                ydl_opts = {
                    'quiet': True,
                    'no_warnings': True,
                    'skip_download': True, # Only info
                }
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    
                    # Convert formats logic if needed, but yt-dlp gives good info directly
                    # We simulate the structure the frontend expects
                    res = {
                        'title': info.get('title', 'Video'),
                        'author': info.get('uploader', 'Unknown'),
                        'thumbnail': info.get('thumbnail', ''),
                        'resolution': f"{info.get('width', 'HD')}x{info.get('height', '')}" if info.get('width') else 'HD',
                        'size': 'N/A' 
                    }
                    
                    self.send_json(res)
            except Exception as e:
                self.send_error_json(500, str(e))
            return

        # PLAYLIST ENDPOINT
        if path == '/api/playlist':
            url = query.get('url', [None])[0]
            if not url:
                self.send_error_json(400, 'URL missing')
                return

            try:
                ydl_opts = {
                    'quiet': True,
                    'no_warnings': True,
                    'extract_flat': True, # Fast check
                    'dump_single_json': True,
                }
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    
                    entries = info.get('entries', [])
                    videos = []
                    for entry in entries:
                        videos.append({
                            'title': entry.get('title'),
                            'url': entry.get('url') if 'http' in entry.get('url', '') else f"https://www.youtube.com/watch?v={entry.get('id')}",
                            'thumbnail': None, # flat extraction doesn't always have thumb
                            'author': entry.get('uploader')
                        })

                    res = {
                        'title': info.get('title', 'Playlist'),
                        'total': len(videos),
                        'videos': videos
                    }
                    self.send_json(res)

            except Exception as e:
                self.send_error_json(500, str(e))
            return

        # DOWNLOAD ENDPOINT
        if path == '/api/download':
            url = query.get('url', [None])[0]
            fmt = query.get('format', ['mp4'])[0]
            
            if not url:
                self.send_error_json(400, 'URL missing')
                return

            try:
                # Redirect strategy: Get the direct URL from yt-dlp and redirect user to it?
                # Problem: Direct URLs are often IP locked to the server (Vercel).
                # Streaming through Vercel (Python) has 10s timeout...
                # SOLUTION: We try to get a direct URL and stream it, hoping it's fast enough or allows range requests.
                # Actually, if we use 'get_url', we might get a workable URL for the user IF the signature isn't IP bound.
                # But let's try standard streaming via response write.
                
                ydl_opts = {
                    'format': 'bestaudio/best' if fmt == 'mp3' else 'best',
                    'quiet': True,
                }
                
                # We need to configure headers for attachment
                # First get info to get title
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    title = info.get('title', 'video').replace('"', '').replace('/', '_')
                    direct_url = info.get('url')
                    
                    if not direct_url:
                        # Sometimes best is a dash manifest which we can't stream easily without ffmpeg
                        # We need a direct 'url'
                        # Let's try to find a format with a 'url'
                        formats = info.get('formats', [])
                        for f in formats:
                            if f.get('url') and f.get('protocol') in ['https', 'http']:
                                direct_url = f.get('url')
                                break
                    
                    if not direct_url:
                        self.send_error_json(500, "Could not extract direct URL")
                        return

                    # Redirecting is safer for Vercel timeouts/limits!
                    # If we redirect, the user browser downloads directly from Google servers.
                    # This bypasses the 10s Vercel limit AND the 4.5MB limit.
                    # The only risk is if the URL is 403 Forbidden (IP locked).
                    # yt-dlp URLs are usually IP locked... 
                    # BUT worth a try. If not, we have to proxy.
                    # Proxying 1GB video through Vercel Function will FAIL (Limit 10s / 4.5MB).
                    
                    # PROXY STRATEGY (Buffered):
                    # We can't proxy large files on Vercel Functions.
                    # The user MUST use a real server (Render) for large downloads.
                    # OR we accept that Vercel is for small/short videos only.
                    
                    # Let's try REDIRECT first. It's the only way to support large downloads on Serverless.
                    self.send_response(302)
                    self.send_header('Location', direct_url)
                    self.end_headers()
                    return

            except Exception as e:
                self.send_error_json(500, str(e))
                return

        self.send_error_json(404, 'Not found')

    def send_json(self, data):
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def send_error_json(self, code, message):
        self.send_response(code)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'error': message}).encode('utf-8'))
