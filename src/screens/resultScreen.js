// 전투 결과 화면: 처치 수, 생존 시간, 얻은 재화, 새로 드러난 이름 글자. 다시 도전하거나 로비로 돌아간다.

import { h } from '../ui/dom.js';
import { getDungeon } from '../data/dungeons.js';
import { MONSTER_BY_ID } from '../data/monsters.js';
import { menuFrame } from './common.js';

function formatDuration(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function resultScreen(app, { result, summary }) {
  const victory = result.outcome === 'victory';
  const dungeon = getDungeon(result.dungeonId);
  const stat = (label, value) => h('li', {}, h('span', {}, label), h('strong', {}, value));
  const reveals = summary.newlyRevealed.map((r) => {
    const m = MONSTER_BY_ID[r.monsterId];
    return h('li', { class: 'reveal' }, r.nameComplete ? `${m.name}: 이름을 모두 해독했습니다. 도감에서 등록할 수 있습니다.` : `${m.name}: 이름 글자 ${r.letters}개가 드러났습니다.`);
  });

  return {
    element: menuFrame(app, {
      title: '출정 결과',
      back: null,
      body: h(
        'div',
        { class: 'result' },
        h('h2', { class: `result-title ${victory ? 'victory' : 'defeat'}` }, victory ? '승리' : '쓰러졌습니다'),
        h('p', { class: 'hint' }, dungeon?.name ?? ''),
        h(
          'ul',
          { class: 'stat-list' },
          stat('생존 시간', formatDuration(result.survivalSeconds)),
          stat('일반 몬스터 처치', String(result.normalKills)),
          stat('보스 처치', String(result.bossKills)),
          stat('얻은 엽전', `+${summary.coins}`),
          stat('얻은 이름 조각', `+${summary.nameFragments}`),
        ),
        reveals.length > 0 ? h('ul', { class: 'reveal-list', 'aria-label': '도감 변화' }, reveals) : null,
        h(
          'div',
          { class: 'button-row' },
          h('button', { class: 'btn btn-primary', type: 'button', onClick: () => app.startBattle(result.dungeonId) }, '다시 도전'),
          h('button', { class: 'btn', type: 'button', onClick: () => app.go('lobby') }, '로비로'),
        ),
      ),
    }),
  };
}
