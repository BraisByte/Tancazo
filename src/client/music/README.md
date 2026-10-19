# Música personalizada

Coloca aquí pistas propias ou con licenza compatible en formato OGG, MP3 ou WAV. Despois relaciónaas en `tracks.json`:

```json
{
  "tracks": {
    "menu": "/src/client/music/menu.ogg",
    "citadel": "/src/client/music/citadel.ogg",
    "foundry": "/src/client/music/foundry.ogg",
    "glacier": "/src/client/music/glacier.ogg",
    "marsh": "/src/client/music/marsh.ogg",
    "arsenal": "/src/client/music/arsenal.ogg",
    "fortress": "/src/client/music/fortress.ogg",
    "delta": "/src/client/music/delta.ogg",
    "boss": "/src/client/music/boss.ogg"
  }
}
```

As pistas reprodúcense en bucle e cambian cun fundido de 1,5 segundos. Se unha escena non ten pista asignada, o xogo conserva a música procedemental.
