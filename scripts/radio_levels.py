"""Use a common speech level for every Celtia clip without altering its pitch or speed."""
from array import array
import math
import hashlib
import json
from pathlib import Path
import sys
import wave

TARGET_RMS = 3000

def speech_rms(samples, sample_rate):
    frame = max(1, sample_rate // 50)
    chunks = [samples[start:start + frame] for start in range(0, len(samples), frame)]
    levels = [math.sqrt(sum(value * value for value in chunk) / len(chunk)) for chunk in chunks]
    threshold = max(150, max(levels, default=0) * .08)
    active = [value for chunk, level in zip(chunks, levels) if level > threshold for value in chunk]
    return math.sqrt(sum(value * value for value in active) / len(active)) if active else 0

def normalize(path):
    with wave.open(str(path), 'rb') as source:
        params = source.getparams()
        if params.nchannels != 1 or params.sampwidth != 2:
            raise ValueError(f'Expected mono PCM16: {path}')
        samples = array('h', source.readframes(params.nframes))
    if sys.byteorder != 'little': samples.byteswap()
    rms = speech_rms(samples, params.framerate)
    if not rms: raise ValueError(f'Silent recording: {path}')
    gain = min(TARGET_RMS / rms, .85 * 32767 / max(map(abs, samples)))
    adjusted = array('h', (round(value * gain) for value in samples))
    if sys.byteorder != 'little': adjusted.byteswap()
    with wave.open(str(path), 'wb') as target:
        target.setparams(params)
        target.writeframes(adjusted.tobytes())
    return gain

if __name__ == '__main__':
    directory = Path(__file__).resolve().parent.parent / 'src/client/radio'
    for path in sorted(directory.glob('*.wav')):
        print(f'{path.name}: {20 * math.log10(normalize(path)):+.1f} dB')
    manifest_path = directory / 'clips.json'
    manifest = json.loads(manifest_path.read_text())
    for text, url in manifest['clips'].items():
        path = directory / url.split('?')[0].split('/')[-1]
        manifest['clips'][text] = f"/src/client/radio/{path.name}?v={hashlib.sha256(path.read_bytes()).hexdigest()[:12]}"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
