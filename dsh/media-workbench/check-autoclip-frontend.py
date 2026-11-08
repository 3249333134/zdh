"""Run the upstream gate with Windows' npm.cmd launcher resolved explicitly."""
from pathlib import Path
import os
import shutil
import sys

source = Path(__file__).resolve().parent.parent / 'autoclip'
sys.path.insert(0, str(source))
from scripts import quality_gate
original = quality_gate.checks

def windows_commands(group, python):
    rows = original(group, python)
    for _name, command, _cwd in rows:
        if command[0] == 'npm':
            command[0] = shutil.which('npm.cmd')
    return rows

quality_gate.checks = windows_commands
os.environ['VITE_WORKBENCH'] = '1'
raise SystemExit(quality_gate.run('frontend', Path(__file__).resolve().parent / 'logs/autoclip-managed-quality.json', sys.executable))
