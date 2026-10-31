// 캐릭터 선택 화면: 던전을 고른 뒤 달과 무진 중 하나를 골라 입장한다.
// 카드를 누르면 강조되고, 입장 버튼은 캐릭터를 골랐을 때만 켜진다. 뒤로 가면 고른 던전이 유지된 던전 선택으로 돌아간다.

import { h } from '../ui/dom.js';
import { CHARACTERS, createCharacterSelection } from '../data/characters.js';
import { getDungeon } from '../data/dungeons.js';
import { menuFrame, createRenderedScreen } from './common.js';

export function characterSelectScreen(app, { dungeonId }) {
  const dungeon = getDungeon(dungeonId);
  const selection = createCharacterSelection();
  const base = import.meta.env?.BASE_URL ?? '/';

  return createRenderedScreen((update) => {
    const card = (c) =>
      h(
        'button',
        {
          class: `card character-card${selection.selectedId === c.id ? ' selected' : ''}`,
          type: 'button',
          'aria-pressed': selection.selectedId === c.id ? 'true' : 'false',
          onClick: () => {
            selection.select(c.id);
            update();
          },
        },
        h('img', { class: 'character-portrait', src: `${base}${c.portrait}`, alt: `${c.name} 일러스트`, draggable: 'false' }),
        h('h2', { class: 'card-title' }, c.name),
      );
    return menuFrame(app, {
      title: '캐릭터 선택',
      back: 'dungeons',
      backParams: { selectedId: dungeonId },
      body: h(
        'div',
        { class: 'character-select' },
        dungeon ? h('p', { class: 'hint' }, `던전: ${dungeon.name}`) : null,
        h('div', { class: 'card-grid character-grid' }, CHARACTERS.map(card)),
        h('button', { class: 'btn btn-primary btn-go', type: 'button', disabled: !selection.canEnter, onClick: () => app.startBattle(dungeonId, selection.enter()) }, '입장'),
      ),
    });
  });
}
