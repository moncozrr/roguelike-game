import './style.css';
import { startGame } from './game.js';

// 게임의 시작점. 제목과 게임 영역을 배치하고 게임 루프를 시작한다.
const app = document.querySelector('#app');

app.innerHTML = `
  <main class="game-screen">
    <header class="game-header">
      <h1 class="game-title">아홉 경계</h1>
      <p class="subtitle">Nine Borders</p>
    </header>
    <div class="game-frame">
      <canvas class="game-canvas" aria-label="게임 영역"></canvas>
    </div>
    <p class="controls">WASD 또는 방향키로 이동</p>
  </main>
`;

startGame(app.querySelector('.game-canvas'));
