# Shur in g

Persian classical music played by gravity. Two balls are dropped; every tile they land on is a note. Nothing
about the balls is animated: a physics simulation carries them, and the app draws it live and triggers each
note at its collision.

**Open the app: https://pasmod.github.io/shur-in-g/**

Drop the balls, drag to look around, pinch or scroll to zoom, tap a tile to play it, slow the fall down,
jump between the parts, switch between Persian piano and santur, choose a piece. On a phone it can be added to the
home screen and then works without a connection.

## The pieces

- **Shur in g**: an original piece in Dastgāh-e Shur, written for this project.
- **Esfahan: Darāmad, Jāmeh-darān, Suz-o Godāz**: three gushehs of Bayāt-e Esfahān from the radif of Mirzā
  Abdollāh. Every note of the transcription is played in its order and proportion; the longest notes are
  played as tremolo and a short breath separates the phrases.

## What is in this repository

- `index.html`, `player.js`: the app: live sound, time, gestures and controls
- `app.js`: the picture, drawn with three.js from the time alone
- `pieces/<id>/scene.js`: the result of the physics run of one piece (tiles, trajectories, collisions)
- `pieces/<id>/notes.js`, `snd/`: one note per slot for each instrument, and the list of notes to trigger
- `sw.js`, `manifest.webmanifest`, `icons/`: what makes it installable
- `fonts/`: Cormorant Garamond and Vazirmatn, both under the SIL Open Font License

## Sources and licences

- Notes of the Esfahan pieces: [Radif Corpus](https://doi.org/10.5281/zenodo.15742125) by Maziar Kanani,
  Seán O'Leary and James McDermott, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), transcribed
  after Dariush Talai's notation of the radif of Mirzā Abdollāh. Changes here: a speed was chosen, long notes
  became tremolos, breaths were added between phrases.
- Piano (`snd/piano.m4a`): notes of the [Salamander Grand Piano](https://github.com/Tonejs/audio/tree/master/salamander)
  by Alexander Holm, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), each retuned here to the pitch
  it needs, so the koron notes sit about a quarter tone low (a "Persian piano").
- Santur (`snd/santur.m4a`): computed by a model, no samples.

The "About" sheet in the app explains how it works.
