import './style.css';
import { createApp } from './app.js';
import { createSaveStore } from './save/saveStore.js';
import { GAME_TITLE } from './config.js';

// 게임의 시작점. 로비 화면을 띄운다. 전투는 로비에서 던전에 입장할 때 시작된다(src/screens/battleScreen.js).
const app = document.querySelector('#app');

document.title = GAME_TITLE;

createApp(app, { saveStore: createSaveStore() });
