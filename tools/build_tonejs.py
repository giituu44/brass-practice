"""Pack a tonejs-instruments (Philharmonia, CC BY 3.0) sample folder as a
MIDI.js-style soundfont: trimmed to 2.6 s, levelled, short fade-in on the attack.
usage: build_tonejs.py <dir of As1.mp3 …> <out.js> <global name> [retune json]"""
import base64, json, re, subprocess, sys
from pathlib import Path
src_dir, out_file, glob = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
retune = json.loads(sys.argv[4]) if len(sys.argv) > 4 else {}
tmp = src_dir.parent / (src_dir.name + "-notes"); tmp.mkdir(exist_ok=True)
FLAT = {"Cs": "Db", "Ds": "Eb", "Fs": "Gb", "Gs": "Ab", "As": "Bb"}
LENGTH, TARGET, PEAK_MAX = 2.6, -16.0, -1.0
font = {}
for src in sorted(src_dir.glob("*.mp3")):
    m = re.match(r"([A-G]s?)(\d)$", src.stem)
    key = FLAT.get(m[1], m[1]) + m[2]
    err = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-t", "1.3", "-i", str(src), "-ac", "1", "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
    mean = float(re.search(r"mean_volume: (-?[\d.]+)", err)[1]); peak = float(re.search(r"max_volume: (-?[\d.]+)", err)[1])
    gain = min(TARGET - mean, PEAK_MAX - peak)
    rt = f"asetrate={44100 * 2 ** (retune[key] / 1200):.1f},aresample=44100," if key in retune else ""
    out = tmp / f"{key}.mp3"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-t", f"{LENGTH + 0.1}", "-i", str(src), "-ac", "1",
                    "-af", f"{rt}atrim=0:{LENGTH},volume={gain:.2f}dB,afade=t=in:curve=qsin:d=0.04,afade=t=out:st={LENGTH - 0.3}:d=0.3", "-b:a", "128k", str(out)], check=True)
    font[key] = "data:audio/mp3;base64," + base64.b64encode(out.read_bytes()).decode()
body = ",\n".join(f"{json.dumps(k)}: {json.dumps(v)}" for k, v in font.items())
out_file.write_text("// Philharmonia Orchestra samples via github.com/nbrosowsky/tonejs-instruments (CC BY 3.0).\n"
    "if (typeof(MIDI) === 'undefined') var MIDI = {};\nif (typeof(MIDI.Soundfont) === 'undefined') MIDI.Soundfont = {};\n"
    f"MIDI.Soundfont.{glob} = {{\n" + body + "\n};\n", encoding="utf-8")
print("wrote", out_file, out_file.stat().st_size // 1024, "KB", sorted(font))
