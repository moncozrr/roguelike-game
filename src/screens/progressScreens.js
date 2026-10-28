// 수련(영구 업그레이드), 도감, 업적 화면. 규칙은 meta/progress.js가 맡고 여기서는 보여 주고 버튼만 연결한다.

import { h } from '../ui/dom.js';
import { UPGRADES, MAX_UPGRADE_LEVEL, upgradeCost } from '../data/upgrades.js';
import { MONSTERS } from '../data/monsters.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { upgradeLevel, maskedName, monsterKills, isNameComplete, nextRevealAt, REGISTRY, achievementStatus } from '../meta/progress.js';
import { menuFrame, createRenderedScreen } from './common.js';

const REASONS = {
  'not-enough-coins': '엽전이 부족합니다.',
  'max-level': '이미 최대 레벨입니다.',
  'not-enough-fragments': '이름 조각이 부족합니다.',
  'name-incomplete': '이름을 모두 해독해야 등록할 수 있습니다.',
  'already-registered': '이미 등록했습니다.',
  'already-claimed': '이미 수령했습니다.',
  'not-achieved': '아직 달성하지 못했습니다.',
  unknown: '알 수 없는 항목입니다.',
};

function effectText(upgrade, level) {
  const total = level * upgrade.perLevel;
  return `${upgrade.description} 현재 +${total}${upgrade.unit} (레벨당 +${upgrade.perLevel}${upgrade.unit})`;
}

export function upgradesScreen(app) {
  const { profile } = app;
  let message = '';
  return createRenderedScreen((update) => {
    const card = (u) => {
      const level = upgradeLevel(profile.save, u.id);
      const maxed = level >= MAX_UPGRADE_LEVEL;
      const cost = upgradeCost(level);
      return h(
        'article',
        { class: 'card upgrade-card' },
        h('h2', { class: 'card-title' }, u.name),
        h('p', { class: 'card-level' }, `Lv ${level} / ${MAX_UPGRADE_LEVEL}`),
        h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(MAX_UPGRADE_LEVEL), 'aria-valuenow': String(level) }, h('div', { class: 'meter-fill', style: `width:${(level / MAX_UPGRADE_LEVEL) * 100}%` })),
        h('p', { class: 'card-text' }, effectText(u, level)),
        h(
          'button',
          {
            class: 'btn btn-primary',
            type: 'button',
            disabled: maxed || profile.save.coins < cost,
            onClick: () => {
              const r = profile.buyUpgrade(u.id);
              message = r.ok ? `${u.name} Lv ${r.level} (엽전 ${r.cost} 사용)` : REASONS[r.reason] ?? '구매하지 못했습니다.';
              update();
            },
          },
          maxed ? '최대 레벨' : `강화 · 엽전 ${cost}`,
        ),
      );
    };
    return menuFrame(app, {
      title: '수련',
      body: h('div', {}, h('p', { class: 'hint', 'aria-live': 'polite' }, message || '엽전으로 능력을 영구히 키웁니다. 한 번에 1레벨씩 강화됩니다.'), h('div', { class: 'card-grid' }, UPGRADES.map(card))),
    });
  });
}

export function bestiaryScreen(app) {
  const { profile } = app;
  let message = '';
  return createRenderedScreen((update) => {
    const row = (m) => {
      const kills = monsterKills(profile.save, m.id);
      const seen = kills > 0;
      const registered = profile.save.bestiary[m.id]?.registered === true;
      const complete = isNameComplete(m, kills);
      const next = nextRevealAt(m, kills);
      return h(
        'article',
        { class: `card monster-card${registered ? ' registered' : ''}` },
        h('span', { class: 'tag' }, m.kind === 'boss' ? '보스' : '일반'),
        h('h2', { class: 'card-title monster-name' }, maskedName(m, kills)),
        h('p', { class: 'card-text' }, seen ? m.note : '아직 만난 적 없는 존재입니다.'),
        h('p', { class: 'card-level' }, `처치 ${kills}${next !== null ? ` · 다음 글자까지 ${next - kills}` : ''}`),
        registered
          ? h('p', { class: 'card-note' }, `등록 완료 · ${m.hanja}`)
          : complete
            ? h(
                'button',
                {
                  class: 'btn btn-primary',
                  type: 'button',
                  disabled: profile.save.nameFragments < REGISTRY.fragmentCost,
                  onClick: () => {
                    const r = profile.registerMonster(m.id);
                    message = r.ok ? `${m.name}의 이름을 등록했습니다. 엽전 ${r.coins} 획득` : REASONS[r.reason] ?? '등록하지 못했습니다.';
                    update();
                  },
                },
                `이름 등록 · 이름 조각 ${REGISTRY.fragmentCost}`,
              )
            : null,
      );
    };
    return menuFrame(app, {
      title: '도감',
      body: h('div', {}, h('p', { class: 'hint', 'aria-live': 'polite' }, message || '처치할수록 몬스터의 이름 글자가 하나씩 드러납니다. 이름을 모두 알면 이름 조각으로 등록할 수 있습니다.'), h('div', { class: 'card-grid' }, MONSTERS.map(row))),
    });
  });
}

export function achievementsScreen(app) {
  const { profile } = app;
  let message = '';
  return createRenderedScreen((update) => {
    const row = (a) => {
      const status = achievementStatus(profile.save, a);
      const { current, target } = a.progress(profile.save);
      const shown = Math.min(current, target);
      const rewardText = [a.reward.coins ? `엽전 ${a.reward.coins}` : null, a.reward.nameFragments ? `이름 조각 ${a.reward.nameFragments}` : null].filter(Boolean).join(' · ');
      return h(
        'article',
        { class: `card achievement-card status-${status}` },
        h('h2', { class: 'card-title' }, a.name),
        h('p', { class: 'card-text' }, a.description),
        h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(target), 'aria-valuenow': String(shown) }, h('div', { class: 'meter-fill', style: `width:${(shown / target) * 100}%` })),
        h('p', { class: 'card-level' }, `${shown} / ${target} · 보상 ${rewardText}`),
        h(
          'button',
          {
            class: 'btn btn-primary',
            type: 'button',
            disabled: status !== 'claimable',
            onClick: () => {
              const r = profile.claimAchievement(a.id);
              message = r.ok ? `${a.name} 보상을 받았습니다.` : REASONS[r.reason] ?? '수령하지 못했습니다.';
              update();
            },
          },
          status === 'claimed' ? '수령 완료' : status === 'claimable' ? '보상 받기' : '미달성',
        ),
      );
    };
    return menuFrame(app, {
      title: '업적',
      body: h('div', {}, h('p', { class: 'hint', 'aria-live': 'polite' }, message || '달성한 업적은 직접 눌러 보상을 받습니다.'), h('div', { class: 'card-grid' }, ACHIEVEMENTS.map(row))),
    });
  });
}
