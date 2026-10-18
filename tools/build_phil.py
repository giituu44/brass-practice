"""Pack the Philharmonia Orchestra tuba samples (via nbrosowsky/tonejs-instruments,
CC BY 3.0) as a MIDI.js-style soundfont file. Notes are trimmed to 2.6 s and
levelled so they all play at a similar loudness. No denoising needed."""
import base64, json, re, subprocess, sys
from pathlib import Path

src_dir, out_file = Path(sys.argv[1]), Path(sys.argv[2])
tmp = src_dir.parent / "phil-notes"
tmp.mkdir(exist_ok=True)

# tonejs file name -> our key (flats)
NOTES = {"F1": "F1", "As1": "Bb1", "Ds2": "Eb2", "F2": "F2", "As2": "Bb2",
         "D3": "D3", "F3": "F3", "As3": "Bb3", "D4": "D4"}
# Measured tuning errors (cents), corrected by resampling.
RETUNE = {"F1": +30}
LENGTH = 2.6
TARGET = -16.0   # mean level of the first 1.3 s (what the app plays), dB
PEAK_MAX = -1.0


def stats(src):
    err = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-t", "1.3", "-i", str(src),
         "-ac", "1", "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
    return (float(re.search(r"mean_volume: (-?[\d.]+)", err)[1]),
            float(re.search(r"max_volume: (-?[\d.]+)", err)[1]))


font = {}
for fname, key in NOTES.items():
    src = src_dir / f"{fname}.mp3"
    mean, peak = stats(src)
    gain = min(TARGET - mean, PEAK_MAX - peak)
    mp3 = tmp / f"{key}.mp3"
    retune = ""
    if key in RETUNE:
        retune = f"asetrate={44100 * 2 ** (RETUNE[key] / 1200):.1f},aresample=44100,"
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-t", f"{LENGTH + 0.1}", "-i", str(src),
         "-ac", "1", "-af", f"{retune}atrim=0:{LENGTH},volume={gain:.2f}dB,"
         # soften the buzzy first ~60 ms of the tongued attack
         f"afade=t=in:curve=qsin:d=0.06,afade=t=out:st={LENGTH - 0.3}:d=0.3",
         "-b:a", "128k", str(mp3)], check=True)
    font[key] = "data:audio/mp3;base64," + base64.b64encode(mp3.read_bytes()).decode()
    print(f"{key:4} mean {mean:6.1f} peak {peak:5.1f} gain {gain:+5.1f} dB  {mp3.stat().st_size // 1024} KB")

body = ",\n".join(f"{json.dumps(k)}: {json.dumps(v)}" for k, v in font.items())
out_file.write_text(
    "// Tuba, Philharmonia Orchestra samples via github.com/nbrosowsky/tonejs-instruments (CC BY 3.0).\n"
    "// One note every 2-5 semitones; the app pitch-shifts the nearest one for notes in between.\n"
    "if (typeof(MIDI) === 'undefined') var MIDI = {};\n"
    "if (typeof(MIDI.Soundfont) === 'undefined') MIDI.Soundfont = {};\n"
    "MIDI.Soundfont.tuba_phil = {\n" + body + "\n};\n",
    encoding="utf-8")
print("wrote", out_file, out_file.stat().st_size // 1024, "KB,", len(font), "notes")
