"""Render bundled Galician radio clips with the aHoTTS / HiTZ Celtia model.

Usage: python3 scripts/generate-radio.py --engine-dir /tmp/aHoTTS-main
See src/client/radio/README.md for model sources and attribution.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import wave
from radio_levels import normalize

parser = argparse.ArgumentParser()
parser.add_argument('--engine-dir', required=True, type=Path)
args = parser.parse_args()
engine = args.engine_dir.resolve()
root = Path(__file__).resolve().parent.parent
output = root / 'src/client/radio'
output.mkdir(parents=True, exist_ok=True)
catalog = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', "import { radioCatalog } from './src/client/radio.js'; console.log(JSON.stringify(radioCatalog()));"], cwd=root, text=True))
env = dict(os.environ, LD_LIBRARY_PATH=str(engine))
manifest = {'voice': 'Celtia', 'language': 'gl-ES', 'clips': {}}
for name, text in catalog.items():
    target = output / f'{name}.wav'
    subprocess.run([str(engine / 'ahotts/tts'), '-Lang=gl', '-Method=Vits', f'-HDicDB={engine}/ahotts/dicts/gl/cotovia', f'-voice_path={engine}/ahotts/voices/gl/celtia', str(target)], input=(text + '\n').encode(), env=env, cwd=engine, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True, timeout=60)
    with wave.open(str(target), 'rb') as audio:
        if audio.getnframes() < audio.getframerate() / 4:
            raise ValueError(f'Empty voice clip: {name}')
    normalize(target)
    manifest['clips'][text] = f'/src/client/radio/{name}.wav?v={hashlib.sha256(target.read_bytes()).hexdigest()[:12]}'
    print(f'{name}: {text}', flush=True)
(output / 'clips.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
