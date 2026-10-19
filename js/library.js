// Built-in pieces, written in ABC notation (concert pitch, bass clef, BB♭ tuba range).
// The exercises and études are original, written for this app in a method-book
// style; the melodies are traditional or public-domain tunes arranged for tuba.
const LIBRARY = [
  // ---------- Warm-ups ----------
  {
    id: 'long-tones', cat: 'Warm-ups', level: 1, title: 'Long tones',
    note: 'Four full beats on each note, steady air, then rest. Watch the tuner on the mic.',
    abc: `T:Long tones
M:4/4
L:1/1
Q:1/4=60
K:Bb
B,, | z | A,, | z | _A,, | z | G,, | z | _G,, | z | F,, | z | B,,, | z | F,, | z | B,, |]`,
  },
  {
    id: 'lip-slurs-1', cat: 'Warm-ups', level: 1, title: 'Lip slurs 1 — two partials', mic: true,
    note: 'Same fingering for each group; change partials with your air and lips, not the valves. Best with the mic, which can hear the partial.',
    abc: `T:Lip slurs 1
M:4/4
L:1/4
Q:1/4=72
K:C
_B,,,2 F,,2 | _B,,2 F,,2 | _B,,,4 | z4 |
A,,,2 E,,2 | A,,2 E,,2 | A,,,4 | z4 |
_A,,,2 _E,,2 | _A,,2 _E,,2 | _A,,,4 | z4 |
G,,,2 D,,2 | G,,2 D,,2 | G,,,4 | z4 |
_G,,,2 _D,,2 | _G,,2 _D,,2 | _G,,,4 | z4 |
F,,,2 C,,2 | F,,2 C,,2 | F,,,4 | z4 |]`,
  },
  {
    id: 'lip-slurs-2', cat: 'Warm-ups', level: 2, title: 'Lip slurs 2 — four partials', mic: true,
    note: 'Up and down the harmonic series on one fingering. Keep the air moving through the leaps.',
    abc: `T:Lip slurs 2
M:4/4
L:1/8
Q:1/4=66
K:C
_B,,,2 F,,2 _B,,2 D,2 | _B,,2 F,,2 _B,,,4 |
A,,,2 E,,2 A,,2 ^C,2 | A,,2 E,,2 A,,,4 |
_A,,,2 _E,,2 _A,,2 C,2 | _A,,2 _E,,2 _A,,,4 |
G,,,2 D,,2 G,,2 B,,2 | G,,2 D,,2 G,,,4 |]`,
  },

  // ---------- Technique ----------
  {
    id: 'technical-1', cat: 'Technique', level: 2, title: 'Technical study (Clarke style)',
    note: 'Light, even sixteenths. Start slow; the loop control is your friend.',
    abc: `T:Technical study
M:4/4
L:1/16
Q:1/4=66
K:Bb
B,,C,D,C, B,,C,D,C, B,,C,D,C, B,,4 | B,,C,D,E, F,E,D,C, B,,C,D,E, F,4 | F,E,D,C, B,,C,D,C, B,,A,,B,,C, B,,4 |
[K:F] F,,G,,A,,G,, F,,G,,A,,G,, F,,G,,A,,G,, F,,4 | F,,G,,A,,B,, C,B,,A,,G,, F,,G,,A,,B,, C,4 | C,B,,A,,G,, F,,G,,A,,G,, F,,E,,F,,G,, F,,4 |]`,
  },
  {
    id: 'thirds-bb', cat: 'Technique', level: 2, title: 'B♭ major in thirds',
    abc: `T:B-flat major in thirds
M:4/4
L:1/8
Q:1/4=84
K:Bb
B,,D, C,E, D,F, E,G, | F,A, G,B, A,C B,2 | B,G, A,F, G,E, F,D, | E,C, D,B,, C,A,, B,,2 |]`,
  },
  {
    id: 'arpeggios', cat: 'Technique', level: 2, title: 'Arpeggios in B♭, F and E♭',
    abc: `T:Arpeggios
M:4/4
L:1/8
Q:1/4=88
K:Bb
B,,D,F,D, B,,D,F,B, | B,4 F,4 | F,,A,,C,A,, F,,A,,C,F, | F,4 C,4 |
E,,G,,B,,G,, E,,G,,B,,E, | E,4 B,,4 | B,,D,F,D, B,,F,D,F, | B,,8 |]`,
  },
  {
    id: 'articulation', cat: 'Technique', level: 3, title: 'Articulation study',
    note: 'Short, clear tongue strokes on the repeated notes; keep the air steady underneath.',
    abc: `T:Articulation study
M:4/4
L:1/16
Q:1/4=76
K:Bb
B,,B,,B,,B,, D,D,D,D, F,F,F,F, D,D,D,D, | E,E,E,E, C,C,C,C, A,,A,,A,,A,, F,,F,,F,,F,, |
B,,B,,D,D, F,F,D,D, C,C,A,,A,, F,,F,,A,,A,, | B,,4 F,,4 B,,,8 |]`,
  },
  {
    id: 'low-register', cat: 'Technique', level: 2, title: 'Low register study',
    note: 'Open the throat and let the low notes ring. Check tuning on the 4th-valve notes.',
    abc: `T:Low register study
M:4/4
L:1/4
Q:1/4=72
K:Bb
B,,,2 F,,2 | D,,2 B,,,2 | C,,2 E,,2 | F,,4 | E,,2 C,,2 | A,,,2 F,,,2 | B,,,2 F,,2 | B,,,4 |]`,
  },

  // ---------- Études ----------
  {
    id: 'etude-chorale', cat: 'Études', level: 1, title: 'Étude 1 — Chorale',
    note: 'Sing through every note. Breathe at the end of each four-bar phrase.',
    abc: `T:Etude 1 - Chorale
M:4/4
L:1/4
Q:1/4=72
K:Bb
B,,2 D,2 | F,2 E,2 | D, C, B,, C, | D,4 | E,2 C,2 | F,2 A,,2 | B,, C, D, C, | B,,4 |
D,2 F,2 | G,2 F,2 | E, D, C, E, | F,4 | G,2 E,2 | D,2 C,2 | B,, D, C, A,, | B,,4 |]`,
  },
  {
    id: 'etude-march', cat: 'Études', level: 2, title: 'Étude 2 — March',
    note: 'Crisp and in time, like the bass line of a street band.',
    abc: `T:Etude 2 - March
M:2/4
L:1/8
Q:1/4=104
K:F
F,,2 C,2 | A,,2 C,2 | F,, A,, C, A,, | F,,4 | C,,2 G,,2 | E,,2 G,,2 | C,, E,, G,, B,, | A,,4 |
B,,2 D,2 | C,2 A,,2 | G,, A,, B,, G,, | F,,2 C,,2 | D,,2 E,,2 | F,,2 A,,2 | G,, C, B,, G,, | F,,4 |]`,
  },
  {
    id: 'etude-waltz', cat: 'Études', level: 2, title: 'Étude 3 — Waltz',
    note: 'Lean into beat one, lighter on two and three.',
    abc: `T:Etude 3 - Waltz
M:3/4
L:1/4
Q:1/4=120
K:Eb
E,,2 G,, | B,,2 G,, | A,,2 F,, | D,,3 | B,,,2 D,, | F,,2 A,, | G,,2 E,, | B,,,3 |
E,,2 G,, | B,,2 E, | D,2 B,, | C,2 A,, | B,,2 F,, | D,,2 B,,, | E,,3- | E,,3 |]`,
  },
  {
    id: 'etude-triplets', cat: 'Études', level: 3, title: 'Étude 4 — Triplets',
    note: 'Three even notes per beat — no galloping.',
    abc: `T:Etude 4 - Triplets
M:4/4
L:1/8
Q:1/4=80
K:F
(3F,,A,,C, (3F,C,A,, F,,2 C,,2 | (3G,,B,,D, (3G,D,B,, G,,2 D,,2 | (3A,,C,F, (3A,F,C, A,,2 F,,2 | (3C,B,,A,, (3G,,F,,E,, F,,4 |]`,
  },

  {
    id: 'etude-intervals', cat: 'Études', level: 2, title: 'Étude 5 — Fourths and fifths',
    note: 'Keep the air steady across the leaps; hear each note before you play it.',
    abc: `T:Etude 5 - Fourths and fifths
M:4/4
L:1/4
Q:1/4=80
K:Bb
B,,2 F,2 | E,2 B,,2 | C,2 G,2 | F,2 C,2 | D,2 A,2 | G,2 D,2 | E,2 B,2 | B,,4 |
F,2 B,,2 | D,2 G,,2 | C,2 F,,2 | B,,4 |]`,
  },
  {
    id: 'etude-syncopation', cat: 'Études', level: 3, title: 'Étude 6 — Syncopation',
    note: 'Feel the off-beats: count “1 & 2 &” and lean on the tied notes.',
    abc: `T:Etude 6 - Syncopation
M:4/4
L:1/8
Q:1/4=88
K:F
F,,2 A,,2 C,2 z2 | A,,C,- C,2 A,,2 z2 | G,,2 B,,2 D,2 z2 | B,,D,- D,2 B,,2 z2 |
C,2 E,2 G,2 z2 | E,G,- G,2 E,2 C,2 | F,2 C,A,,- A,,2 F,,2 | F,,8 |]`,
  },
  {
    id: 'etude-hunting', cat: 'Études', level: 3, title: 'Étude 7 — Hunting song (6/8)',
    note: 'Two big beats per bar; the quarter–eighth pattern should bounce.',
    abc: `T:Etude 7 - Hunting song
M:6/8
L:1/8
Q:3/8=60
K:Eb
B,,, | E,,2 G,, B,,2 G,, | E,,2 G,, B,,3 | A,,2 F,, D,,2 F,, | B,,,3- B,,,2 B,,, |
E,,2 G,, B,,2 E, | D,2 C, B,,2 A,, | G,,2 F,, E,,2 D,, | E,,3- E,,2 |]`,
  },
  {
    id: 'etude-chromatic', cat: 'Études', level: 3, title: 'Étude 8 — Chromatic',
    note: 'Every half step from F2 to F3 and back. Watch the 2nd valve: it does most of the work.',
    abc: `T:Etude 8 - Chromatic
M:4/4
L:1/8
Q:1/4=72
K:C
F,,^F,,G,,^G,, A,,^A,,B,,C, | ^C,D,^D,E, F,4 | F,E,_E,D, _D,C,B,,_B,, | A,,_A,,G,,_G,, F,,4 |]`,
  },

  // ---------- Melodies ----------
  {
    id: 'yankee-doodle', cat: 'Melodies', level: 1, title: 'Yankee Doodle', composer: 'Traditional',
    abc: `T:Yankee Doodle
C:Traditional
M:2/4
L:1/8
Q:1/4=104
K:F
F,,F,,G,,A,, | F,,A,,G,,C,, | F,,F,,G,,A,, | F,,2E,,2 | F,,F,,G,,A,, | B,,A,,G,,F,, | E,,C,,D,,E,, | F,,2F,,2 |]`,
  },
  {
    id: 'auld-lang-syne', cat: 'Melodies', level: 2, title: 'Auld Lang Syne', composer: 'Traditional',
    abc: `T:Auld Lang Syne
C:Traditional
M:4/4
L:1/4
Q:1/4=84
K:F
C,, | F,,3/2F,,/ F,, A,, | G,,3/2F,,/ G,, A,,/G,,/ | F,,3/2F,,/ A,, C, | D,3 D, | C,3/2A,,/ A,, F,, | G,,3/2F,,/ G,, A,,/G,,/ | F,,3/2D,,/ D,, C,, | F,,3 |]`,
  },
  {
    id: 'twinkle', cat: 'Melodies', level: 1, title: 'Twinkle, Twinkle, Little Star', composer: 'Traditional',
    abc: `T:Twinkle, Twinkle, Little Star
C:Traditional
M:4/4
L:1/4
Q:1/4=100
K:Bb
B,,B,,F,F, | G,G,F,2 | E,E,D,D, | C,C,B,,2 | F,F,E,E, | D,D,C,2 | F,F,E,E, | D,D,C,2 |
B,,B,,F,F, | G,G,F,2 | E,E,D,D, | C,C,B,,2 |]`,
  },
  {
    id: 'frere-jacques', cat: 'Melodies', level: 1, title: 'Frère Jacques', composer: 'Traditional',
    abc: `T:Frere Jacques
C:Traditional
M:4/4
L:1/4
Q:1/4=110
K:F
F,,G,,A,,F,, | F,,G,,A,,F,, | A,,B,,C,2 | A,,B,,C,2 | C,/D,/C,/B,,/A,,F,, | C,/D,/C,/B,,/A,,F,, | F,,C,,F,,2 | F,,C,,F,,2 |]`,
  },
  {
    id: 'ode-to-joy', cat: 'Melodies', level: 1, title: 'Ode to Joy', composer: 'L. van Beethoven',
    abc: `T:Ode to Joy
C:L. van Beethoven
M:4/4
L:1/4
Q:1/4=100
K:Bb
D,D,E,F, | F,E,D,C, | B,,B,,C,D, | D,3/2C,/C,2 | D,D,E,F, | F,E,D,C, | B,,B,,C,D, | C,3/2B,,/B,,2 |
C,C,D,B,, | C,D,/E,/D,B,, | C,D,/E,/D,C, | B,,C,F,,2 | D,D,E,F, | F,E,D,C, | B,,B,,C,D, | C,3/2B,,/B,,2 |]`,
  },
  {
    id: 'saints', cat: 'Melodies', level: 1, title: 'When the Saints Go Marching In', composer: 'Traditional',
    abc: `T:When the Saints Go Marching In
C:Traditional
M:4/4
L:1/4
Q:1/4=120
K:Bb
zB,,D,E, | F,4 | zB,,D,E, | F,4 | zB,,D,E, | F,2D,2 | B,,2D,2 | C,4 |
zD,D,C, | B,,3B,, | D,2F,2 | F,E,3 | zD,E,F, | D,2B,,2 | C,2C,2 | B,,4 |]`,
  },
  {
    id: 'amazing-grace', cat: 'Melodies', level: 1, title: 'Amazing Grace', composer: 'Traditional',
    abc: `T:Amazing Grace
C:Traditional
M:3/4
L:1/4
Q:1/4=80
K:F
C,, | F,,2 A,,/F,,/ | A,,2 G,, | F,,2 D,, | C,,2 C,, | F,,2 A,,/F,,/ | A,,2 G,,/A,,/ | C,3- | C,2 A,,/C,/ |
C,2 A,,/F,,/ | A,,2 G,, | F,,2 D,, | C,,2 C,, | F,,2 A,,/F,,/ | A,,2 G,, | F,,3- | F,,2 |]`,
  },
  {
    id: 'greensleeves', cat: 'Melodies', level: 2, title: 'Greensleeves', composer: 'Traditional',
    abc: `T:Greensleeves
C:Traditional
M:6/8
L:1/8
Q:3/8=56
K:Am
A,, | C,2 D, E,>F, E, | D,2 B,, G,,>A,, B,, | C,2 A,, A,,>^G,, A,, | B,,2 ^G,, E,,2 A,, |
C,2 D, E,>F, E, | D,2 B,, G,,>A,, B,, | C,>B,, A,, ^G,,>^F,, ^G,, | A,,3 A,,2 |]`,
  },
  {
    id: 'minuet-g', cat: 'Melodies', level: 2, title: 'Minuet in G', composer: 'C. Petzold (attr. J. S. Bach)',
    abc: `T:Minuet in G
C:C. Petzold
M:3/4
L:1/8
Q:1/4=100
K:G
D,2 G,,A,,B,,C, | D,2 G,,2 G,,2 | E,2 C,D,E,F, | G,2 G,,2 G,,2 | C,2 D,C,B,,A,, | B,,2 C,B,,A,,G,, | F,,2 G,,A,,B,,G,, | A,,6 |
D,2 G,,A,,B,,C, | D,2 G,,2 G,,2 | E,2 C,D,E,F, | G,2 G,,2 G,,2 | C,2 D,C,B,,A,, | B,,2 C,B,,A,,G,, | A,,2 B,,A,,G,,F,, | G,,6 |]`,
  },
  {
    id: 'mountain-king', cat: 'Melodies', level: 3, title: 'In the Hall of the Mountain King', composer: 'E. Grieg',
    note: 'Start slow and creep the tempo up with the loop — the original famously speeds up.',
    abc: `T:In the Hall of the Mountain King
C:E. Grieg
M:4/4
L:1/8
Q:1/4=100
K:Bm
B,,,C,,D,,E,, F,,D,,F,,2 | ^E,,^C,,^E,,2 =E,,=C,,E,,2 | B,,,C,,D,,E,, F,,D,,F,,B,, | A,,F,,D,,F,, A,,4 |
B,,,C,,D,,E,, F,,D,,F,,2 | ^E,,^C,,^E,,2 =E,,=C,,E,,2 | B,,,C,,D,,E,, F,,D,,F,,B,, | A,,F,,D,,F,, B,,4 |]`,
  },
  // ---------- Duets: you play one part, the app plays the other ----------
  {
    id: 'duet-chorale', cat: 'Duets', level: 1, title: 'Duet 1 — Chorale',
    note: 'Two tubas in thirds and tenths. Listen down to the other part and tune your chords to it.',
    abc: `T:Duet 1 — Chorale (part 1)
M:4/4
L:1/4
Q:1/4=66
K:Bb
D, D, C, B,, | E, D, C,2 | D, F, E, D, | C,4 | F, E, D, C, | B,, C, D, E, | D, C, B,, A,, | B,,4 |]`,
    abc2: `T:Duet 1 — Chorale (part 2)
M:4/4
L:1/4
Q:1/4=66
K:Bb
B,,, B,,, F,,, G,,, | C,, D,, F,,2 | B,,, D,, C,, B,,, | F,,,4 | D,, C,, B,,, A,,, | G,,, A,,, B,,, C,, | F,,, F,,, G,,, F,,, | B,,,4 |]`,
  },
  {
    id: 'duet-round', cat: 'Duets', level: 1, title: 'Duet 2 — Frère Jacques (a round)', composer: 'Traditional',
    note: 'A round: part 2 comes in two bars later, an octave down. Keep your own line steady while the other one starts.',
    abc: `T:Frère Jacques (part 1)
C:Traditional
M:4/4
L:1/4
Q:1/4=84
K:F
F,, G,, A,, F,, | F,, G,, A,, F,, | A,, B,, C,2 | A,, B,, C,2 | C,/2D,/2C,/2B,,/2 A,, F,, | C,/2D,/2C,/2B,,/2 A,, F,, | F,, C,, F,,2 | F,, C,, F,,2 | F,, G,, A,, F,, | F,,4 |]`,
    abc2: `T:Frère Jacques (part 2)
C:Traditional
M:4/4
L:1/4
Q:1/4=84
K:F
z4 | z4 | F,,, G,,, A,,, F,,, | F,,, G,,, A,,, F,,, | A,,, B,,, C,,2 | A,,, B,,, C,,2 | C,,/2D,,/2C,,/2B,,,/2 A,,, F,,, | C,,/2D,,/2C,,/2B,,,/2 A,,, F,,, | F,,, C,,, F,,,2 | F,,, C,,, F,,,2 |]`,
  },
  {
    id: 'duet-ode', cat: 'Duets', level: 2, title: 'Duet 3 — Ode to Joy', composer: 'L. van Beethoven (melody)',
    note: 'Part 1 has the tune; part 2 is a bass line under it. Try both — the bass line is where a tuba lives.',
    abc: `T:Ode to Joy (part 1)
C:L. van Beethoven
M:4/4
L:1/4
Q:1/4=96
K:Bb
D, D, E, F, | F, E, D, C, | B,, B,, C, D, | D,3/2 C,/2 C,2 | D, D, E, F, | F, E, D, C, | B,, B,, C, D, | C,3/2 B,,/2 B,,2 |]`,
    abc2: `T:Ode to Joy (part 2)
M:4/4
L:1/4
Q:1/4=96
K:Bb
B,,,2 D,,2 | B,,,2 F,,,2 | B,,,2 G,,,2 | F,,,4 | B,,,2 D,,2 | B,,,2 F,,,2 | G,,,2 F,,,2 | F,,,2 B,,,2 |]`,
  },
  // ---------- Excerpts: famous tuba moments from public-domain music ----------
  {
    id: 'excerpt-mahler1', cat: 'Excerpts', level: 2, title: 'Mahler 1, mvt. 3 — the “Bruder Martin” canon', composer: 'G. Mahler (1888)',
    note: 'The minor-key Frère Jacques the tuba takes up in the canon. Very soft, very even, never rushed. Written from the melody — check the rhythm and dynamics against a real part.',
    abc: `T:Mahler 1, mvt. 3 — canon
C:G. Mahler
M:4/4
L:1/4
Q:1/4=60
K:Dm
D,, E,, F,, D,, | D,, E,, F,, D,, | F,, G,, A,,2 | F,, G,, A,,2 | A,,/2B,,/2A,,/2G,,/2 F,, D,, | A,,/2B,,/2A,,/2G,,/2 F,, D,, | D,, A,,, D,,2 | D,, A,,, D,,2 |]`,
  },
  {
    id: 'excerpt-dies-irae', cat: 'Excerpts', level: 1, title: 'Symphonie fantastique, mvt. 5 — Dies irae', composer: 'H. Berlioz (1830)',
    note: 'The plainchant Berlioz gives the tubas and ophicleides: one long, heavy note a bar. Full, dark sound; no gaps between notes. Written from the chant — check it against a real part.',
    abc: `T:Dies irae (Berlioz, Symphonie fantastique)
C:H. Berlioz
M:6/8
L:1/8
Q:3/8=50
K:C
C,6 | B,,6 | C,6 | A,,6 | B,,6 | G,,6 | A,,6 | A,,6 | C,6 | C,6 | D,6 | C,6 | B,,6 | A,,6 | G,,6 | B,,6 | C,6 | B,,6 | A,,6- | A,,6 |]`,
  },
];
