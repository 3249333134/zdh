"""Offline acceptance in an isolated data directory; no model or publishing calls."""
import json
import os
from pathlib import Path
import sys
import tempfile

root = Path(__file__).resolve().parent
source = root.parent / 'autoclip'
ffmpeg = next((root.parent / '.local-runtimes' / 'ffmpeg').glob('*/bin/ffmpeg.exe'))
test_data = Path(tempfile.mkdtemp(prefix='autoclip-', dir=root / 'logs'))
os.environ.update(AUTOCLIP_MODE='desktop', AUTOCLIP_DESKTOP_MODE='true', AUTOCLIP_APP_DIR=str(test_data), AUTOCLIP_DATA_DIR=str(test_data), DATABASE_URL=f'sqlite:///{test_data / "autoclip.db"}', LOG_FILE=str(test_data / 'backend.log'), AUTOCLIP_ALLOWED_ORIGINS='http://127.0.0.1:13002', AUTOCLIP_FFMPEG_PATH=str(ffmpeg), AUTOCLIP_FFPROBE_PATH=str(ffmpeg.with_name('ffprobe.exe')))
sys.path.insert(0, str(source))
from fastapi.testclient import TestClient
from backend.app_factory import create_app

with TestClient(create_app(mode='desktop'), base_url='http://127.0.0.1') as client:
    assert client.get('/health').status_code == 200
    assert client.post('/api/v1/example-project/create', headers={'Origin': 'https://untrusted.example'}).status_code == 403
    created = client.post('/api/v1/example-project/create', headers={'Origin': 'http://127.0.0.1:13002'})
    assert created.status_code == 200, created.text
    project_id = created.json()['project_id']
    repeated = client.post('/api/v1/example-project/create')
    assert repeated.json()['project_id'] == project_id
    project = client.get(f'/api/v1/projects/{project_id}')
    assert project.status_code == 200
    workspace = client.get(f'/api/v1/studio/{project_id}')
    assert workspace.status_code == 200, workspace.text
    outputs = list((test_data / 'projects' / project_id).rglob('*.mp4'))
    assert len(outputs) >= 2 and all(file.stat().st_size > 0 for file in outputs)
    report = {'ok': True, 'isolatedData': str(test_data), 'exampleCreated': True, 'idempotent': True, 'workspace': workspace.status_code, 'videoFiles': len(outputs), 'untrustedOriginBlocked': True, 'paidCalls': 0}
    (root / 'logs' / 'autoclip-offline-test.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))
