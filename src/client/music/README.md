# Banda sonora de Tancazo

Inclúe trece composicións orixinais sintetizadas para este proxecto, sen samples nin gravacións de terceiros: once temas de misión, un de menú e un de xefe. Cada tema ten melodía, baixo, acordes e percusión propios, con dúas frases de catro compases. Os campos de partida rápida usan o tema da misión correspondente.

Para rexenerar os ficheiros WAV e o manifesto:

```bash
node scripts/generate-music.mjs
```

A reprodución prioriza a misión actual, despois o escenario. O xefe ten tema propio. Hai fundidos de 1,5 segundos entre temas e só se conservan tres pistas descodificadas na memoria. A música baixa durante as mensaxes de voz. Se unha pista non se pode cargar, actívase o acompañamento procedemental de reserva.

## Música personalizada

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
