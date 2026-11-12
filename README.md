# Shur in g

An original piece in Dastgāh-e Shur, played by gravity. Two balls are dropped; every tile they land on is a
note. Nothing about the balls is animated: a physics simulation carries them, and the app draws it live and
triggers each note at its collision.

**Open the app: https://pasmod.github.io/shur-in-g/**

Drop the balls, drag to look around, pinch or scroll to zoom, tap a tile to play it, slow the fall down,
jump between the four parts, switch the instrument. On a phone it can be added to the home screen and then
works without a connection.

## What is in this repository

- `index.html`, `player.js`: the app: live sound, time, gestures and controls
- `app.js`: the picture, drawn with three.js from the time alone
- `scene.js`: the result of the physics run (tiles, trajectories, collisions)
- `notes.js`, `snd/`: one note per slot for each instrument, and the list of notes to trigger
- `sw.js`, `manifest.webmanifest`, `icons/`: what makes it installable
- `fonts/`: Cormorant Garamond and Vazirmatn, both under the SIL Open Font License

## Sound sources and licences

- Santur: computed by a model, no samples.
- Setar (`snd/setar.m4a`, when present): single plucks of a real setar recorded by
  [Jacqke](https://commons.wikimedia.org/wiki/User:Jacqke) and published on Wikimedia Commons under
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The file here is an adaptation (cut into single
  notes, three high notes raised in pitch) and is offered under the same licence.

The "About" sheet in the app explains how the piece was made.
