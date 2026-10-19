# Radio en galego

Os ficheiros WAV conteñen voz sintética neuronal en galego. Xéranse previamente, así que o xogo non precisa modelos, conexións externas nin voces instaladas no navegador durante a partida.

- Modelo: [HiTZ / Aholab, Celtia](https://huggingface.co/HiTZ/TTS-gl_celtia), Apache-2.0; véxase APACHE-2.0.txt.
- Ferramenta de síntese: [aHoTTS](https://github.com/hitz-zentroa/aHoTTS), Apache-2.0.
- Corpus: Vázquez Abuín, M., García Díaz, N., Vladu, A. I., Magariños, C., Vidal Miguéns, A., e Fernández Rei, E. (2023). [Nos_Celtia-GL: Galician TTS corpus (1.0.0.)](https://doi.org/10.5281/zenodo.7716958), CC BY 4.0.
- Os textos son avisos escritos para Tancazo. Os audios están sintetizados a partir dese modelo; non son gravacións humanas nin implican que a persoa do corpus participe no xogo.

Para rexenerar, descarga aHoTTS e o modelo seguindo as súas instrucións oficiais. Despois:

```bash
python3 scripts/generate-radio.py --engine-dir /ruta/aHoTTS
```

O catálogo completo procede de `radioCatalog()` en `src/client/radio.js`. O manifesto `clips.json` relaciona cada frase co seu ficheiro. Todos os avisos usan exclusivamente a voz incluída; se falla unha descarga, o aviso permanece escrito e non se substitúe por outra voz. `scripts/radio_levels.py` iguala o RMS dos tramos falados a 3000, preservando o ton e a velocidade. Cada URL inclúe o hash do audio para evitar reproducir clips antigos da caché. A música baixa mentres soa a radio e a cancelación impide reproducir avisos dunha partida anterior.
