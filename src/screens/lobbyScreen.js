// 로비와 던전 선택 화면.

import { h } from '../ui/dom.js';
import { DUNGEONS, createDungeonSelection } from '../data/dungeons.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { achievementStatus } from '../meta/progress.js';
import { saveWarning, titleBlock, menuFrame, createRenderedScreen, currencyBar } from './common.js';

export function lobbyScreen(app) {
  const { profile } = app;
  const claimable = ACHIEVEMENTS.filter((a) => achievementStatus(profile.save, a) === 'claimable').length;
  const warning = saveWarning(profile);
  const menuButton = (label, screen, badge = 0) =>
    h('button', { class: 'btn btn-menu', type: 'button', onClick: () => app.go(screen) }, label, badge > 0 ? h('span', { class: 'badge', 'aria-label': `수령 가능 ${badge}개` }, String(badge)) : null);

  return {
    element: h(
      'main',
      { class: 'menu-screen lobby' },
      h('div', { class: 'lobby-top' }, currencyBar(profile)),
      titleBlock(),
      warning ? h('p', { class: 'banner banner-warn', role: 'status' }, warning) : null,
      h('button', { class: 'btn btn-primary btn-go', type: 'button', onClick: () => app.go('dungeons') }, '출정'),
      h(
        'nav',
        { class: 'menu-grid', 'aria-label': '로비 메뉴' },
        menuButton('수련', 'upgrades'),
        menuButton('도감', 'bestiary'),
        menuButton('업적', 'achievements', claimable),
        menuButton('공지', 'notices'),
        menuButton('설정', 'settings'),
      ),
    ),
  };
}

// 던전 선택: 카드를 누르면 강조되고, 입장 버튼은 입장할 수 있는 던전을 골랐을 때만 켜진다.
export function dungeonSelectScreen(app, { selectedId = null } = {}) {
  const selection = createDungeonSelection();
  if (selectedId) selection.select(selectedId);

  const screen = createRenderedScreen((update) => {
    const chosen = DUNGEONS.find((d) => d.id === selection.selectedId);
    const card = (d) =>
      h(
        'button',
        {
          class: `card dungeon-card${selection.selectedId === d.id ? ' selected' : ''}${d.available ? '' : ' unavailable'}`,
          type: 'button',
          'aria-pressed': selection.selectedId === d.id ? 'true' : 'false',
          onClick: () => {
            selection.select(d.id);
            update();
          },
        },
        d.placeholder ? h('span', { class: 'tag' }, '가칭') : null,
        h('h2', { class: 'card-title' }, d.name),
        h('p', { class: 'card-text' }, d.description),
        d.available ? null : h('p', { class: 'card-note' }, '준비 중'),
      );
    return menuFrame(app, {
      title: '던전 선택',
      body: h(
        'div',
        { class: 'dungeon-select' },
        h('div', { class: 'card-grid dungeon-grid' }, DUNGEONS.map(card)),
        h(
          'button',
          { class: 'btn btn-primary btn-go', type: 'button', disabled: !selection.canEnter, onClick: () => app.startBattle(selection.enter()) },
          chosen && !chosen.available ? '준비 중' : '입장',
        ),
      ),
    });
  });
  return screen;
}
