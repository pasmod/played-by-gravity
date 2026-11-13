# Zang-e Shotor, played by gravity

"Zang-e Shotor", the camel's bell, a piece of Persian classical music, played on a santur by gravity. Two
balls are dropped; every tile they land on is a note. Nothing about the balls is animated: a physics
simulation carries them, and the app draws it live and triggers each note at its collision.

**Open the app: https://pasmod.github.io/played-by-gravity/**

Drop the balls and watch; the camera finds its own way. Tap a tile to play it, slow the fall down, jump to any
place in the piece. On a phone it can be added to the home screen and then works without a connection.

The page began as "Shur in g", an original piece in Dastgāh-e Shur.

## The piece

Zang-e Shotor is a gusheh, a short traditional piece, of the dastgāh Chahārgāh in the radif of Mirzā Abdollāh:
a long ringing note, a low stroke, another long note, in the swaying step of a caravan. Every note of the
transcription is played in its order and length; the longest notes are played as tremolo.

## What is in this repository

- `index.html`, `player.js`: the app: live sound, time and controls
- `app.js`: the picture and the camera, drawn with three.js from the time alone
- `pieces/<id>/scene.js`: the result of the physics run (tiles, trajectories, collisions, camera data)
- `pieces/<id>/notes.js`, `snd/`: one note per slot of the instrument, and the list of notes to trigger
- `sw.js`, `manifest.webmanifest`, `icons/`: what makes it installable
- `fonts/`: Cormorant Garamond and Vazirmatn, both under the SIL Open Font License

## Sources and licences

- Notes: [Radif Corpus](https://doi.org/10.5281/zenodo.15742125) by Maziar Kanani, Seán O'Leary and James
  McDermott, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), transcribed after Dariush Talai's
  notation of the radif of Mirzā Abdollāh. Changes here: a speed was chosen and long notes became tremolos.
- Santur (`snd/santur.m4a`): computed by a model, no samples.

The "About" sheet in the app explains how it works.
