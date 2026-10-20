import './style.css';
import { startGame } from './game.js';
import { GAME_TITLE } from './config.js';

// 게임의 시작점. 제목과 게임 영역을 배치하고 게임 루프를 시작한다.
const app = document.querySelector('#app');

document.title = GAME_TITLE;

app.innerHTML = `
  <main class="game-screen">
    <header class="game-header">
      <h1 class="game-title">${GAME_TITLE}</h1>
    </header>
    <div class="game-frame">
      <canvas class="game-canvas" aria-label="게임 영역"></canvas>
    </div>
    <p class="controls">WASD/방향키 이동 · Space 대시 · Esc 일시 정지 · Enter 시작/재시작</p>
  </main>
`;

startGame(app.querySelector('.game-canvas'));
