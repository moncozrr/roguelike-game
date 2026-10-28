// 메뉴 화면들이 함께 쓰는 조각: 화면 틀, 재화 표시줄, 저장 상태 안내.

import { h } from '../ui/dom.js';
import { GAME_TITLE } from '../config.js';

// 저장이 안 되고 있을 때 보여 줄 안내 문장. 문제가 없으면 null.
export function saveWarning(profile) {
  if (profile.loadStatus === 'corrupt') return '저장 데이터가 손상되어 새로 시작했습니다. (손상된 원본은 브라우저에 백업해 두었습니다)';
  if (profile.loadStatus === 'unavailable' || !profile.persistOk) return '이 브라우저에서는 진행을 저장할 수 없습니다. 창을 닫으면 진행이 사라집니다.';
  return null;
}

export function currencyBar(profile) {
  return h(
    'div',
    { class: 'currency-bar', 'aria-label': '보유 재화' },
    h('span', { class: 'currency' }, h('span', { class: 'currency-label' }, '엽전'), h('strong', {}, String(profile.save.coins))),
    h('span', { class: 'currency' }, h('span', { class: 'currency-label' }, '이름 조각'), h('strong', {}, String(profile.save.nameFragments))),
  );
}

// 메뉴 화면 틀: 제목줄(뒤로 가기 + 제목 + 재화), 저장 안내, 본문.
export function menuFrame(app, { title, back = 'lobby', body }) {
  const warning = saveWarning(app.profile);
  return h(
    'main',
    { class: 'menu-screen' },
    h(
      'header',
      { class: 'menu-header' },
      back ? h('button', { class: 'btn btn-back', type: 'button', onClick: () => app.go(back) }, '← 뒤로') : null,
      h('h1', { class: 'menu-title' }, title),
      currencyBar(app.profile),
    ),
    warning ? h('p', { class: 'banner banner-warn', role: 'status' }, warning) : null,
    body,
  );
}

export function titleBlock() {
  return h('div', { class: 'title-block' }, h('h1', { class: 'game-title' }, GAME_TITLE), h('p', { class: 'game-subtitle' }, 'The Ninefold Veil'));
}

// 화면을 처음 만든 뒤 내용을 바꿔 끼우는 도우미: render()가 돌려준 요소로 root의 내용을 통째로 교체한다.
export function createRenderedScreen(render) {
  const element = h('div', { class: 'screen-root' });
  const update = () => element.replaceChildren(render(update));
  update();
  return { element, update };
}
