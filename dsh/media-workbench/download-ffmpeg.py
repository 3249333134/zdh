"""Install the project-local FFmpeg essentials bundle; resumable verified ranges."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import urllib.request
import zipfile

root = Path(__file__).resolve().parent.parent / '.local-runtimes' / 'ffmpeg'
url = 'https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip'
size, chunk = 114768076, 4 * 1024 * 1024

def fetch(i):
    start, end = i * chunk, min(size, (i + 1) * chunk) - 1
    target = root / f'part-{i:03}.zip'
    if target.exists() and target.stat().st_size == end - start + 1:
        return target
    request = urllib.request.Request(url + f'?workbench-part={i}', headers={'Range': f'bytes={start}-{end}'})
    with urllib.request.urlopen(request, timeout=90) as response:
        if response.status != 206 or response.headers.get('Content-Range') != f'bytes {start}-{end}/{size}':
            raise ValueError('Unexpected download range')
        data = response.read()
        if len(data) != end - start + 1:
            raise ValueError('Incomplete download range')
        target.write_bytes(data)
    return target

with ThreadPoolExecutor(max_workers=8) as pool:
    parts = list(pool.map(fetch, range((size + chunk - 1) // chunk)))
with (root / 'complete.zip').open('wb') as output:
    for part in parts:
        output.write(part.read_bytes())
with zipfile.ZipFile(root / 'complete.zip') as archive:
    if archive.testzip() is not None:
        raise ValueError('FFmpeg archive checksum failed')
    archive.extractall(root)
print('FFmpeg and FFprobe installed')
