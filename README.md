# Tancazo

Arcade cooperativo de tanques en color inspirado en los clásicos de defensa de base, construido para navegador con Three.js. El modo local y el online comparten una simulación determinista: las reglas de movimiento, combate, IA y objetivos son las mismas en cliente y servidor.

## Estado actual — 1.0

- Un jugador, cooperativo local para dos y salas online autoritativas de hasta cuatro tanques.
- Uno o dos jugadores por dispositivo, espectadores por código, reconexión automática y medición de latencia.
- Lobby con anfitrión, preparación, campo, dificultad y cuenta atrás.
- Campaña ramificada de once sectores con rutas industriais, tácticas e opcionais; inclúe eliminación, supervivencia, captura, escolta, sabotaxe, rescate e batalla final.
- Garaxe modular con tres chasis, catro torretas, tres motores e tres habilidades definitivas que cambian estatísticas e aparencia.
- Recompensas de misión, fabricación anticipada con medallas e subministracións roguelite temporais entre operacións.
- Progresión persistente con estrellas y mejoras de blindaje, motor y recarga.
- Evolución compartida durante cada partida: el tanque mejora en las bajas 5, 12, 22 y 35.
- Cinco armas: cañón, autocañón, perforante, rebote y cohete con daño de área.
- Objetos almacenables con activación manual: conxelador, bomba, EMP, mina, engado, reparación e fortaleza.
- Tutorial de obxectos, avisos de recollida, barra de rango e minimapa táctico durante a partida.
- Núcleo con catro impactos de resistencia, búnker inicial e escudo temporal cunha conta atrás visible. O cuarto impacto inimigo directo destrúe o núcleo e os tanques dos xogadores, e remata a partida en derrota. Os impactos no búnker e no escudo teñen sinais diferentes.
- Ladrillos destructibles por cuadrantes, proxectís que colisionan e doce potenciadores.
- IA táctica con exploradores, asalto, pesados, francotiradores, ingenieros y comandantes.
- Dano localizado: impactos traseiros críticos, incendios, orugas danadas, torreta avariada e reparación de sistemas.
- Cooperativo con unidades caídas, reanimación por proximidade e definitivas compartidas de bombardeo, Égida e sobrecarga.
- IA de escuadra con evasión de proxectís, minas de enxeñeiro, aura de comandante e prioridades diferentes por rol. Dous de cada tres despregamentos priorizan o obxectivo: abren o búnker disparando e atacan o núcleo, ou ocupan e disputan a baliza nas misións de captura.
- Xefe Leviatán con tres fases, puntos débiles orbitais, artillaría telegrafada, escudo, cambios de arma e reforzos.
- Escenarios dinámicos con xeo deslizante, barro, pontes, portas destructibles e barrís explosivos en cadea.
- Sete campos 3D con iluminación, partículas meteorolóxicas, efectos, cámara e música adaptativa por escenario.
- Trece pistas orixinais: unha por misión, menú e xefe; fundidos, reserva procedemental e volumes separados.
- Radio neuronal Celtia en galego, incluída como 26 clips locais, con proba de voz e redución da música durante os avisos. Unha única voz para todos os avisos, con niveis igualados e sen mestura coa síntese do navegador. Fontes e atribución en `src/client/radio/README.md`.
- Editor visual de mapas con validación, importación/exportación JSON y prueba inmediata.
- Teclado configurable, apuntado independiente con ratón y clic para disparar (opcional), dos jugadores locales, mando, controles táctiles y ayuda de apuntado.
- Adestramento guiado de movemento, disparo, Fortaleza e defensa do núcleo antes dunha primeira onda de tres inimigos.
- Impactos visibles, barras de vida sobre unidades danadas, proxectís hostís destacados e siluetas por rol.
- Resultados con duración, baixas, estado do núcleo e consellos segundo a causa da derrota; reintento da mesma misión e selección de subministracións sen conta atrás.
- Ajustes de volumen, escala de interfaz, alto contraste y sacudida de cámara.
- Imagen Docker única con servidor HTTP y WebSocket, `/health` y `/metrics`.

## Ejecutar

Con Node.js 22 o posterior:

```bash
npm install
npm start
```

Abre `http://localhost:8490`.

Con Docker:

```bash
docker compose up --build
```

## Controles

| Jugador | Movimiento | Disparo | Cambiar arma | Usar objeto | Definitiva / Apuntar |
|---|---|---|---|---|---|
| 1 | WASD | Clic izquierdo / Espacio | Q | E | F / Dirección de movimiento |
| 2 | Flechas | Intro | Mayús derecha | / | Numpad 0 / Dirección de movimiento |
| Mando | Stick izquierdo | A / gatillo derecho | Y | B | LB / Stick derecho |
| Táctil | Cruceta | Botón rojo | Q | E | F / Dirección de movimiento |

La columna **Definitiva / Apuntar** indica primero el control de la habilidad definitiva y después el sistema de apuntado disponible.

El ratón apunta de forma independiente para el jugador 1. Se puede desactivar en Accesibilidad para usar la dirección de movimiento. El mando conserva la prioridad cuando se usa.

**Aprender a xogar** abre el entrenamiento sin modificar el progreso de la campaña. Al completarlo, **Comezar campaña** inicia la primera misión. Tras ganar una partida rápida, **Seguinte campo** abre otro escenario; en campaña, **Seguinte misión** o una mejora táctica continúan la ruta. Los resultados aparecen aunque el navegador bloquee el guardado.

`Esc` vuelve al menú. Las teclas del jugador 1 se pueden reasignar desde Accesibilidad.

## Multijugador

El anfitrión crea una sala y comparte el código de cinco caracteres. Los demás pueden entrar con uno o dos jugadores desde su dispositivo. El botón **Ver** conecta como espectador sin consumir una de las cuatro plazas. Si se corta la conexión durante una partida, el cliente intenta volver a la sala automáticamente.

El servidor es autoritativo: valida controles y configuración, ejecuta la simulación a 60 Hz y distribuye instantáneas a 20 Hz. El cliente interpola el mundo y aplica una pequeña predicción visual al tanque propio.

## Arquitectura

- `src/shared`: mapas, campaña y simulación determinista sin dependencias del navegador.
- `src/client`: Three.js, entrada, audio, progresión, editor e interfaz.
- `server`: archivos estáticos, salas y bucle autoritativo WebSocket.
- `test`: simulación, campaña, editor, lobby, reconexión y espectadores.

La progresión, los mapas exportados y las preferencias permanecen en el navegador; las partidas online viven en memoria del servidor.

## Verificación y operación

```bash
npm run check
npm test
curl http://localhost:8490/health
curl http://localhost:8490/metrics
```

`/health` informa si el proceso responde. `/metrics` devuelve salas, partidas, conexiones y jugadores activos en JSON.
