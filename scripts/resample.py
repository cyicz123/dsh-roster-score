import wave, sys, array
import numpy as np

src, dst = sys.argv[1], sys.argv[2]
with wave.open(src, 'rb') as w:
    channels, width, rate, frames = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
    data = w.readframes(frames)
samples = np.frombuffer(data, dtype=np.int16).astype(np.float32)
if channels > 1:
    samples = samples.reshape(-1, channels).mean(axis=1)
target = 16000
if rate != target:
    count = int(round(len(samples) * target / rate))
    positions = np.linspace(0, len(samples) - 1, count)
    samples = np.interp(positions, np.arange(len(samples)), samples)
pcm = np.clip(np.round(samples), -32768, 32767).astype(np.int16)
with wave.open(dst, 'wb') as out:
    out.setnchannels(1)
    out.setsampwidth(2)
    out.setframerate(target)
    out.writeframes(pcm.tobytes())
print(f'{rate}->{target}, {len(pcm)} samples')
