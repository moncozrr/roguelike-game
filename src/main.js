import './style.css';

// 게임의 시작점. 지금은 타이틀 화면만 그린다.
const app = document.querySelector('#app');

app.innerHTML = `
  <main class="title-screen">
    <h1 class="title">아홉 경계</h1>
    <p class="subtitle">Nine Borders</p>
    <p class="status">개발 중</p>
  </main>
`;
