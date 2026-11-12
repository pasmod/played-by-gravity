# Santur, played by gravity

Persian classical music played by gravity. Two balls are dropped; every tile they land on is a note of a
santur. Nothing about the balls is animated: a physics simulation carries them, and the app draws it live and
triggers each note at its collision.

**Open the app: https://pasmod.github.io/shur-in-g/**

Drop the balls, drag to look around, pinch or scroll to zoom, tap a tile to play it, slow the fall down, jump
to any place in the piece, choose a piece. On a phone it can be added to the home screen and then works
without a connection.

The page began as "Shur in g", an original piece in Dastgāh-e Shur, and keeps that address.

## The pieces

Three short pieces from the radif of Mirzā Abdollāh that suit the two hammers of a santur:

- **Chahārmezrāb** (Māhur): fast and bright, with a low drone string that keeps returning.
- **Zang-e Shotor** (Chahārgāh): "the camel's bell", long ringing notes over a low stroke.
- **Kereshmeh** (Māhur): a lilting rhythm of short and long notes.

Every note of the transcription is played in its order and length; the longest notes are played as tremolo.

## What is in this repository

- `index.html`, `player.js`: the app: live sound, time, gestures and controls
- `app.js`: the picture, drawn with three.js from the time alone
- `pieces/<id>/scene.js`: the result of the physics run of one piece (tiles, trajectories, collisions)
- `pieces/<id>/notes.js`, `snd/`: one note per slot of the instrument, and the list of notes to trigger
- `sw.js`, `manifest.webmanifest`, `icons/`: what makes it installable
- `fonts/`: Cormorant Garamond and Vazirmatn, both under the SIL Open Font License

## Sources and licences

- Notes: [Radif Corpus](https://doi.org/10.5281/zenodo.15742125) by Maziar Kanani, Seán O'Leary and James
  McDermott, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), transcribed after Dariush Talai's
  notation of the radif of Mirzā Abdollāh. Changes here: a speed was chosen and long notes became tremolos.
- Santur (`snd/santur.m4a`): computed by a model, no samples.

The "About" sheet in the app explains how it works.
