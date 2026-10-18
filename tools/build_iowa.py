"""Split the Iowa MIS mf tuba chromatic runs into single notes, denoise them, and
pack them as a MIDI.js-style soundfont file (base64 MP3 per note, keyed "Bb1").

usage: build_iowa.py <dir with mf.*.aiff> <out.js> <a|b>
  a = wavelet denoise   b = FFT denoise with a learned noise profile + gain smoothing
Each note gets 0.5 s of hiss from a silent gap prepended (variant b learns the
noise from it), which is trimmed off again before encoding."""
import base64, json, re, subprocess, sys
from pathlib import Path

src_dir, out_file, variant = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
tmp = src_dir.parent / f"iowa-notes-{variant}"
tmp.mkdir(exist_ok=True)

NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
RUNS = [("mf.C1B1.aiff", 1, 12), ("mf.C2B2.aiff", 2, 12), ("mf.C3C4.aiff", 3, 13)]
PREFIX = 0.5
DENOISE = {
    "a": "afwtdn=sigma=0.002:percent=95",
    "b": "asendcmd=c='0.02 afftdn sn 1\\;0.45 afftdn sn 2',afftdn=nr=30:gs=30:rf=-70",
    "light": "afftdn=nf=-72:nr=8",  # leaves a little hiss, keeps the tone intact
}[variant]
LOWPASS = {"a": "f=6000", "b": "f=6000", "light": "f=4000:p=2"}[variant]
GLOBAL = {"a": "tuba_iowa_a", "b": "tuba_iowa_b", "light": "tuba_iowa"}[variant]


def segments(path):
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
         "-af", "silencedetect=noise=-45dB:d=0.3", "-f", "null", "-"],
        capture_output=True, text=True).stderr
    dur = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out)
    total = int(dur[1]) * 3600 + int(dur[2]) * 60 + float(dur[3])
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", out)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", out)]
    # Sound runs from the end of one silence to the start of the next.
    bounds, pos = [], 0.0
    for s, e in zip(starts, ends + [total]):
        if s - pos > 0.2:
            bounds.append((pos, s))
        pos = e
    if total - pos > 0.2:
        bounds.append((pos, total))
    return bounds


def graph(noise_at, start, length, tail):
    return (f"[0:a]atrim={noise_at}:{noise_at + PREFIX},asetpts=PTS-STARTPTS[n];"
            f"[1:a]atrim={start}:{start + length},asetpts=PTS-STARTPTS[s];"
            f"[n][s]concat=n=2:v=0:a=1,pan=mono|c0=0.5*c0+0.5*c1,{DENOISE},"
            f"highpass=f=25,lowpass={LOWPASS},atrim={PREFIX},asetpts=PTS-STARTPTS{tail}")


font = {}
for fname, octave, count in RUNS:
    src = src_dir / fname
    segs = segments(src)
    if len(segs) != count:
        sys.exit(f"{fname}: expected {count} notes, found {len(segs)}")
    noise_at = segs[0][1] + 0.2  # hiss only: just after the first note's decay
    for i, (a, b) in enumerate(segs):
        name = NAMES[i % 12] + str(octave + i // 12)
        start = max(a - 0.02, 0)
        length = min(b - start + 0.12, 2.6)
        ins = ["-i", str(src), "-i", str(src)]
        vd = subprocess.run(
            ["ffmpeg", "-hide_banner", "-nostats", *ins, "-filter_complex",
             graph(noise_at, start, length, ",volumedetect"), "-f", "null", "-"],
            capture_output=True, text=True).stderr
        gain = -2.0 - float(re.search(r"max_volume: (-?[\d.]+) dB", vd)[1])
        fade = f",volume={gain:.2f}dB,afade=t=out:st={max(length - 0.2, 0):.3f}:d=0.2"
        mp3 = tmp / f"{name}.mp3"
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *ins, "-filter_complex",
             graph(noise_at, start, length, fade), "-b:a", "112k", str(mp3)],
            check=True)
        font[name] = "data:audio/mp3;base64," + base64.b64encode(mp3.read_bytes()).decode()
        print(name, f"{gain:+.1f} dB", mp3.stat().st_size // 1024, "KB")

body = ",\n".join(f"{json.dumps(k)}: {json.dumps(v)}" for k, v in font.items())
out_file.write_text(
    "// Tuba, mezzo-forte. University of Iowa Electronic Music Studios, Musical Instrument Samples\n"
    "// (David Spies, Mirafone 1865U CC tuba). Split into single notes and denoised for this app.\n"
    "if (typeof(MIDI) === 'undefined') var MIDI = {};\n"
    "if (typeof(MIDI.Soundfont) === 'undefined') MIDI.Soundfont = {};\n"
    f"MIDI.Soundfont.{GLOBAL} = {{\n" + body + "\n};\n",
    encoding="utf-8")
print("wrote", out_file, out_file.stat().st_size // 1024, "KB,", len(font), "notes")
