// 보상 카드 화면 그리기(Canvas, 임시 디자인). 계산은 rewardCards.js, 보상 데이터는 rewards.js가 맡고 여기서는 그리기만 한다.
// 표시하는 이름, 효과 수치, 설명은 보상 데이터의 값을 그대로 쓰며 여기서 따로 계산하지 않는다.
// 일반 레벨업('LEVEL UP')과 이후 경계 강화('BOUNDARY UPGRADE')가 title만 바꿔서 함께 쓴다. 최종 아트로 바꿀 때는 이 파일만 교체하면 된다.

import { computeCardLayout, titleAnchor, wrapText } from './rewardCards.js';

const FONT = 'system-ui, "Malgun Gothic", sans-serif';

// 보상 유형별 강조 색(임시)
const KIND_COLORS = {
  newWeapon: '#e0b455',
  weaponUpgrade: '#6fb4ff',
  magnet: '#6fe08d',
};

// cards: [{ kind, category, title, effect, description }] (최대 3장, 왼쪽부터)
// selectedIndex: 방금 선택한 카드 번호(강조 표시). 없으면 null. 그린 카드 사각형 목록을 돌려준다.
export function drawRewardCards(ctx, view, { title, cards, selectedIndex = null }) {
  const layout = computeCardLayout(cards.length, view);
  ctx.save();
  // 게임 화면은 그대로 두고 전체에 반투명한 어두운 오버레이를 씌운다.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, 0, view.width, view.height);

  const anchor = titleAnchor(layout, view);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e8e6e3';
  ctx.font = `700 36px ${FONT}`;
  ctx.fillText(title, anchor.x, anchor.y);

  cards.forEach((card, i) => drawCard(ctx, layout[i], card, i, selectedIndex === i, selectedIndex !== null));
  ctx.restore();
  return layout;
}

function drawCard(ctx, rect, card, index, selected, dimmed) {
  const color = KIND_COLORS[card.kind] ?? '#c9a24a';
  const pad = Math.max(12, rect.width * 0.08);
  const centerX = rect.x + rect.width / 2;
  ctx.save();
  if (dimmed && !selected) ctx.globalAlpha = 0.45; // 선택이 끝난 뒤에는 고르지 않은 카드를 흐리게

  // 카드 배경과 테두리(선택된 카드는 더 밝고 두꺼운 테두리)
  ctx.fillStyle = selected ? '#2c2a3a' : '#1d1b27';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = selected ? '#ffffff' : color;
  ctx.lineWidth = selected ? 5 : 2;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

  // 선택 번호(왼쪽부터 1, 2, 3)
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = color;
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(String(index + 1), rect.x + pad, rect.y + pad);

  // 보상 유형(신규 무기 / 무기 강화 / 자석 강화)
  ctx.textAlign = 'right';
  ctx.font = `600 14px ${FONT}`;
  ctx.fillText(card.category, rect.x + rect.width - pad, rect.y + pad + 6);

  const maxTextWidth = rect.width - pad * 2;
  const measureWith = (font) => {
    ctx.font = font;
    return (text) => ctx.measureText(text).width;
  };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // 보상 이름
  const nameFont = `700 20px ${FONT}`;
  ctx.fillStyle = '#f4f1ea';
  let y = rect.y + pad + 48;
  for (const line of wrapText(measureWith(nameFont), card.title, maxTextWidth)) {
    ctx.font = nameFont;
    ctx.fillText(line, centerX, y);
    y += 26;
  }

  // 효과 수치 또는 업그레이드 결과
  const effectFont = `600 15px ${FONT}`;
  y += 8;
  ctx.fillStyle = color;
  for (const line of wrapText(measureWith(effectFont), card.effect, maxTextWidth)) {
    ctx.font = effectFont;
    ctx.fillText(line, centerX, y);
    y += 21;
  }

  // 효과를 설명하는 짧은 문장
  const descriptionFont = `400 14px ${FONT}`;
  y += 8;
  ctx.fillStyle = '#b9b5c4';
  for (const line of wrapText(measureWith(descriptionFont), card.description, maxTextWidth)) {
    if (y + 18 > rect.y + rect.height - pad / 2) break; // 카드 밖으로 넘치는 줄은 그리지 않는다
    ctx.font = descriptionFont;
    ctx.fillText(line, centerX, y);
    y += 20;
  }
  ctx.restore();
}
