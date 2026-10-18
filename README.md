# Brass Practice

A practice app for tuba and other brass: fingerings, scales, rhythm, real pieces and a tuner. It runs entirely in the browser with no server and no install, and works offline.

**To run it:** open `index.html` in Chrome, Edge, Firefox or Safari.

## What's in it

- **Today**: a five-step daily routine (warm-up, scale of the day, note drill, rhythm, piece), with minutes practised this week, a streak, and progress for the current instrument.
- **Fingerings**: name-the-fingering drills that give your weak notes more often. You answer with Space, automatically, or against a metronome. Read in any key signature, or turn on ear training.
- **Scales**: every major and minor scale plus chromatic, one or two octaves, written with key signatures. Play along with a metronome (each beat is graded) or go at your own pace. A loop option speeds up after each clean run.
- **Pieces**: the music scrolls past a gold play line (or shows as a page with a moving playhead). Your note sounds as you finger it, a wrong fingering sounds the note it would really make, and misses show the right fingering. Real notation with a built-in library (warm-ups, lip slurs, technical studies, études, melodies) and a sight-reading generator. Play along graded, wait-for-me, or listen. Loop a passage, change the tempo, move it to any of the 12 keys (key signature and spelling follow), or shift the octave. The clef and key stay pinned at the left while the music scrolls, and after a run it points out the bars where most misses were, with a one-click slower loop of them. With the mic on, each run is recorded so you can hear your take back with the music scrolling along, and you get a tuning report (which notes sat sharp or flat, marked on the score). A miss tells you what your valves actually made ("you held 4 — that's C3"), and Loop can speed up 4 bpm after each clean run. Press B for the library browser (search, categories, your best scores).
  - **Import** MusicXML or MXL (from MuseScore, Sibelius, Finale or Dorico) or ABC, or write ABC with a live preview.
  - **PDF**: a PDF exported from notation software (MuseScore, LilyPond, Sibelius, Finale, Dorico) has its notes **read automatically**: pitch, rhythm, key, clef (bass, treble, alto, tenor), accidentals, ties, triplets, and repeats with 1st and 2nd endings, played out in order. The result appears beside the page so you can check and fix it. On LilyPond PDFs scored against their MIDI files, it got 97–99% of pitches and about 95% of rhythms right, and MuseScore PDFs read correctly in spot checks. Scanned PDFs are only pictures, so for those you copy the notes in with a click-or-type note palette.
- **Method books**: all 60 of Kopprasch's *60 Studies, Op. 6* (the classic low-horn book tubists study), at concert pitch, from the Mutopia Project edition (CC BY-SA 3.0). Every note was checked against Mutopia's MIDI files. Plus 53 **Bordogni vocalises** (the "Rochut" melodious études, Rochut numbering and keys), from Michael Shirley's public-domain transcriptions of the original editions (github.com/muschem/trombone, CC0). Both books are set for tuba: bass clef, with the octave chosen for your instrument.
- **Piano accompaniment** for the Bordogni vocalises (from the original piano parts), played by a built-in electric-piano sound and following any key change; **breath marks** where Bordogni put them. **‹ ›** (or `[` `]`) steps through a book, and a clean run offers the next study. Today's routine alternates a piece with the next study from your books.
- **Metronome** (the metronome icon in the sidebar): tempo, beats per bar, eighths/triplets/16ths, tap tempo; it keeps going while you switch tabs, for practising from paper music.
- **Save your take**: after a mic run, ⬇ Save downloads the recording as an audio file.
- **Rhythm**: a metronome, and rhythm reading at four levels with millisecond-accurate tap scoring.
- **Tuner**: note, cents and fingering; an **intonation map** (play every note in your range, see which sit sharp or flat and roughly how many mm to move which slide); a **lip slur builder** (pick a fingering and pattern; it writes an exercise over that fingering's partials in your range, graded by the mic); a long-tone challenge; and a drone.
- Built-in sounds are tuned to A = 440: each recorded sample was measured and is corrected at playback (the Iowa tuba recordings ran ~12¢ sharp on average). Pieces keep a history of every run (accuracy and tempo charts).
- **Microphone input**: play your real instrument instead of using the keyboard. It checks the right note and the right partial.
- **Instruments**:
  - B♭ tuba, 4 or 3 valves
  - C, E♭ and F tuba
  - Euphonium
  - Tenor trombone (slide positions)
  - B♭ trumpet (treble clef, written pitch)

## Settings worth knowing

- **Valve keys** can be rebound, which helps if your keyboard can't register certain keys pressed together.
- **Timing** can be strict, normal or lenient.
- **Audio offset** corrects for the delay of Bluetooth headphones; **Calibrate** measures it by tapping along to clicks.
- **Tuning:** A = 438–446 Hz (e.g. 442 for many bands); sounds, drone, tuner and mic grading all follow it.
- **Theme:** auto, light or dark.
- **Sounds:** your note sound and the wrong-note sound can each be turned on or off.
- **Memorize** (in a piece's Options) hides the notes until you've played them.

## Keys

| | |
|---|---|
| `J` `K` `L` `;` | valves 1–4 (hold them like real valves; rebindable) |
| `1`–`7` | trombone slide positions |
| `Space` | check / start / tap |
| `H` | hear the note |
| `+` / `−` | tempo |
| `Esc` | stop |
| `?` | help |

## Files

- `index.html`, `style.css`
- `fingerings.js`: the hand-made BB♭ tuba chart
- `js/`:
  - `core.js`: settings, the instrument, staff drawing, sound, valve input
  - `instruments.js`: chart generator for the other instruments
  - `pitch.js`: microphone pitch detection
  - `score.js`: ABC and MusicXML parsing and notation rendering
  - `omr.js`: reads notes from PDFs exported by notation software
  - `import.js`: the Add music dialog (files, PDF view, note palette)
  - `library.js`: the built-in pieces
  - `mode-*.js`: one file per tab
- `sounds/`: instrument samples as base64 MP3 in `.js` files, so they load even when the page is opened from your disk
- `vendor/pdfjs/`: pdf.js 3.11, used to show and read PDFs (loaded only when you open one)
- `tools/`: the Python and ffmpeg scripts that built the sample files

## Credits

- Tuba samples:
  - University of Iowa Electronic Music Studios, Musical Instrument Samples (David Spies, tuba)
  - Philharmonia Orchestra samples via [nbrosowsky/tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments) (CC BY 3.0)
  - MusyngKite (CC BY-SA 3.0) and FluidR3 GM (CC BY 3.0) soundfonts via [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts)
- Trumpet and trombone samples: Philharmonia Orchestra via tonejs-instruments (CC BY 3.0)
- PDF viewer: [pdf.js](https://mozilla.github.io/pdf.js/) by Mozilla (Apache 2.0).
- Built-in music: the exercises and études are original. The melodies are traditional or public-domain tunes.
