# Sari Galin, played by gravity

The old folk song "Sari Galin" (in Persian also "Dāman-keshān"), played on a santur by gravity. Two balls are
dropped; every tile they land on is a note. Nothing about the balls is animated: a physics simulation carries
them, and the app draws it live and triggers each note at its collision.

**Open the app: https://pasmod.github.io/shur-in-g/**

Drop the balls, drag to look around, pinch or scroll to zoom, tap a tile to play it, slow the fall down, jump
to any place in the song. On a phone it can be added to the home screen and then works without a connection.

The page began as "Shur in g", an original piece in Dastgāh-e Shur, and keeps that address.

## What is in this repository

- `index.html`, `player.js`: the app: live sound, time, gestures and controls
- `app.js`: the picture, drawn with three.js from the time alone
- `pieces/<id>/scene.js`: the result of the physics run of one piece (tiles, trajectories, collisions)
- `pieces/<id>/notes.js`, `snd/`: one note per slot of the instrument, and the list of notes to trigger
- `sw.js`, `manifest.webmanifest`, `icons/`: what makes it installable
- `fonts/`: Cormorant Garamond and Vazirmatn, both under the SIL Open Font License

## Sources and licences

- Melody: traditional. Notes: [Sari Gelin.mid](https://commons.wikimedia.org/wiki/File:Sari_Gelin.mid) on
  Wikimedia Commons by Peter Gerloff (Rabanus Flavus), released into the public domain
  ([CC0](https://creativecommons.org/publicdomain/zero/1.0/)). Changes here: a speed was chosen, long notes
  became tremolos, the melody is played a second time an octave higher, phrase ends broaden.
- Santur (`snd/santur.m4a`): computed by a model, no samples.

The "About" sheet in the app explains how it works.
