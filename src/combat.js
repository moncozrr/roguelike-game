// 플레이어 체력과 피해 판정. 화면(DOM)에 의존하지 않는 순수 로직이다.
// 피해를 막는 장치는 서로 독립된 두 가지다: "피격 후 보호"(피해를 받은 뒤 시작)와 "대시 무적"(대시를 시작할 때 시작).
// 둘 중 하나라도 켜져 있으면 피해를 받지 않으며, 두 타이머는 서로의 남은 시간을 바꾸지 않는다.

import { PLAYER_HEALTH, DASH_INVULN } from './config.js';

// 두 원이 닿았는지: 중심 거리 <= 반지름 합 (정확히 닿는 경우도 접촉). 제곱끼리 비교해 제곱근 계산을 피한다.
export function circlesTouch(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const sum = ar + br;
  return dx * dx + dy * dy <= sum * sum;
}

// 플레이어가 적 중 하나라도 닿았는지. 몇 마리가 닿았는지는 중요하지 않다(피해는 한 번만 적용하므로).
export function anyContact(player, playerRadius, enemies, enemyRadius) {
  for (const e of enemies) {
    if (circlesTouch(player.x, player.y, playerRadius, e.x, e.y, enemyRadius)) return true;
  }
  return false;
}

// 시간(dt)은 0 이상의 유한한 수만 인정한다. 그 밖의 값(음수, NaN, Infinity)은 0으로 본다.
function safeDt(dt) {
  return Number.isFinite(dt) && dt > 0 ? dt : 0;
}

function requireFinite(name, value, { min, exclusiveMin = false }) {
  const ok = typeof value === 'number' && Number.isFinite(value) && (exclusiveMin ? value > min : value >= min);
  if (!ok) throw new RangeError(`${name}: 올바르지 않은 값입니다 (${String(value)})`);
}

export function createPlayerHealth({ config = PLAYER_HEALTH, dashInvulnDuration = DASH_INVULN } = {}) {
  requireFinite('maxHp', config.maxHp, { min: 0, exclusiveMin: true });
  requireFinite('contactDamage', config.contactDamage, { min: 0 });
  requireFinite('hitProtection', config.hitProtection, { min: 0 });
  requireFinite('dashInvulnDuration', dashInvulnDuration, { min: 0 });

  let hp = config.maxHp;
  let protection = 0; // 피격 후 보호 남은 시간(초)
  let dashInvuln = 0; // 대시 무적 남은 시간(초)

  return {
    get hp() {
      return hp;
    },
    get maxHp() {
      return config.maxHp;
    },
    get isDead() {
      return hp <= 0;
    },
    get hitProtection() {
      return protection;
    },
    get dashInvuln() {
      return dashInvuln;
    },
    get isProtected() {
      return protection > 0;
    },
    get isDashInvulnerable() {
      return dashInvuln > 0;
    },
    // 지금 피해를 받을 수 있는지: 살아 있고, 두 장치가 모두 꺼져 있을 때만.
    get canTakeDamage() {
      return hp > 0 && protection <= 0 && dashInvuln <= 0;
    },
    // 두 타이머를 각각 줄인다(0 아래로는 내려가지 않음). 서로 영향을 주지 않는다.
    update(dt) {
      const step = safeDt(dt);
      protection = Math.max(0, protection - step);
      dashInvuln = Math.max(0, dashInvuln - step);
    },
    // 대시를 시작할 때 부른다. 피격 후 보호 시간은 건드리지 않는다.
    startDashInvulnerability() {
      dashInvuln = dashInvulnDuration;
    },
    // 접촉 피해 1회를 시도한다. 적용되면 true. 막혔으면 false(HP와 타이머 모두 변하지 않음).
    // 적용되면 HP가 줄고(0 미만으로는 내려가지 않음) 피격 후 보호 시간이 시작된다.
    takeContactDamage() {
      if (!this.canTakeDamage) return false;
      hp = Math.max(0, hp - config.contactDamage);
      protection = config.hitProtection;
      return true;
    },
    // 새 런을 시작할 때 HP와 두 타이머를 초기 상태로 되돌린다.
    reset() {
      hp = config.maxHp;
      protection = 0;
      dashInvuln = 0;
    },
  };
}
