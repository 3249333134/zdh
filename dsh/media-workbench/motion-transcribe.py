"""Local-only ASR. Only model files are downloaded; media never leaves the machine."""
import json, sys, os, subprocess
import numpy as np
from faster_whisper import WhisperModel

config = json.load(open(sys.argv[1], encoding='utf-8'))
model = WhisperModel(config['model'], device='cpu', compute_type='int8', cpu_threads=4, local_files_only=True)
results = []
for asset in config['assets']:
    pcm = subprocess.run([config['ffmpeg'],'-v','error','-i',asset['path'],'-t','600','-map','0:a:0','-ac','1','-ar','16000','-f','f32le','pipe:1'],capture_output=True,check=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)).stdout
    segments, info = model.transcribe(np.frombuffer(pcm,dtype=np.float32).copy(), beam_size=3, vad_filter=True, word_timestamps=True, condition_on_previous_text=False)
    cues = []
    for s in segments:
        if s.no_speech_prob > .65 or s.avg_logprob < -1.2:
            continue
        # Split at real word boundaries to keep readable, time-aligned captions.
        text, start, end = '', s.start, s.end
        for word in s.words or []:
            if not text: start = word.start
            text += word.word
            end = word.end
            if len(text) >= 18 or end - start >= 3.5:
                cues.append({'start':start,'end':end,'text':text.strip()}); text = ''
        if text: cues.append({'start':start,'end':end,'text':text.strip()})
        elif not s.words: cues.append({'start':s.start,'end':s.end,'text':s.text.strip()})
    results.append({'assetId':asset['id'],'language':info.language,'cues':cues})
with open(config['output'], 'w', encoding='utf-8') as f: json.dump(results,f,ensure_ascii=False)
