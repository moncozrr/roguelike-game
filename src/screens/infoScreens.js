// 공지(목록/상세)와 설정(저장 내보내기, 가져오기, 초기화) 화면.

import { h, confirmDialog } from '../ui/dom.js';
import { NOTICES } from '../data/notices.js';
import { exportSave, parseImport } from '../save/saveStore.js';
import { menuFrame, createRenderedScreen } from './common.js';

export function noticesScreen(app) {
  let openId = null;
  return createRenderedScreen((update) => {
    const notice = NOTICES.find((n) => n.id === openId);
    if (notice) {
      return menuFrame(app, {
        title: '공지',
        back: null,
        body: h(
          'article',
          { class: 'card notice-detail' },
          h('p', { class: 'card-level' }, notice.date),
          h('h2', { class: 'card-title' }, notice.title),
          h('p', { class: 'notice-body' }, notice.body), // 줄바꿈은 CSS(white-space: pre-line)로 보여 준다.
          h('button', { class: 'btn', type: 'button', onClick: () => { openId = null; update(); } }, '← 목록'),
        ),
      });
    }
    return menuFrame(app, {
      title: '공지',
      body: h(
        'ul',
        { class: 'notice-list' },
        NOTICES.map((n) =>
          h('li', {}, h('button', { class: 'card notice-item', type: 'button', onClick: () => { openId = n.id; update(); } }, h('span', { class: 'notice-date' }, n.date), h('span', { class: 'notice-title' }, n.title))),
        ),
      ),
    });
  });
}

function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = h('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function settingsScreen(app) {
  const { profile } = app;
  let message = '';
  let messageKind = 'info';
  return createRenderedScreen((update) => {
    const say = (text, kind = 'info') => {
      message = text;
      messageKind = kind;
      update();
    };

    const onExport = () => {
      try {
        const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
        downloadText(`ninefold-veil-save-${stamp}.json`, exportSave(profile.save));
        say('저장 파일을 내려받았습니다.');
      } catch {
        say('내보내기에 실패했습니다.', 'error');
      }
    };

    const onImportFile = async (event) => {
      const input = event.target;
      const file = input.files?.[0];
      input.value = ''; // 같은 파일을 다시 골라도 change가 일어나도록
      if (!file) return;
      let text;
      try {
        text = await file.text();
      } catch {
        say('파일을 읽지 못했습니다.', 'error');
        return;
      }
      const parsed = parseImport(text);
      if (!parsed.ok) {
        say(`가져올 수 없는 파일입니다: ${parsed.error}`, 'error'); // 검증에 실패하면 현재 저장은 그대로다.
        return;
      }
      const yes = await confirmDialog({
        title: '저장 데이터 가져오기',
        message: `현재 진행(엽전 ${profile.save.coins}, 출정 ${profile.save.stats.runs}회)이 파일의 내용(엽전 ${parsed.data.coins}, 출정 ${parsed.data.stats.runs}회)으로 덮어쓰여집니다. 계속할까요?`,
        confirmLabel: '덮어쓰기',
        danger: true,
      });
      if (!yes) return say('가져오기를 취소했습니다.');
      profile.replaceWith(parsed.data);
      say(profile.persistOk ? '저장 데이터를 가져왔습니다.' : '가져왔지만 이 브라우저에는 저장할 수 없습니다.', profile.persistOk ? 'info' : 'error');
    };

    const onReset = async () => {
      const yes = await confirmDialog({
        title: '진행 초기화',
        message: '엽전, 업그레이드, 도감, 업적을 포함한 모든 진행이 삭제되며 되돌릴 수 없습니다. 먼저 "내보내기"로 백업해 두는 것을 권합니다. 정말 초기화할까요?',
        confirmLabel: '모두 삭제',
        danger: true,
      });
      if (!yes) return say('초기화를 취소했습니다.');
      const ok = profile.reset();
      say(ok ? '모든 진행을 초기화했습니다.' : '초기화 중 문제가 생겨 일부 데이터가 남았을 수 있습니다.', ok ? 'info' : 'error');
    };

    const stats = profile.save.stats;
    return menuFrame(app, {
      title: '설정',
      body: h(
        'div',
        { class: 'settings' },
        h('p', { class: 'hint' }, `출정 ${stats.runs}회 · 일반 처치 ${stats.normalKills} · 보스 처치 ${stats.bossKills} · 최고 생존 ${Math.floor(stats.bestSurvivalSeconds / 60)}분 ${stats.bestSurvivalSeconds % 60}초`),
        message ? h('p', { class: `banner ${messageKind === 'error' ? 'banner-warn' : 'banner-info'}`, role: 'status' }, message) : null,
        h(
          'section',
          { class: 'card' },
          h('h2', { class: 'card-title' }, '백업'),
          h('p', { class: 'card-text' }, '진행 상황을 파일로 저장하거나, 저장한 파일로 되돌립니다.'),
          h('div', { class: 'button-row' },
            h('button', { class: 'btn', type: 'button', onClick: onExport }, '내보내기'),
            h('label', { class: 'btn' }, '가져오기', h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', onChange: onImportFile }))),
        ),
        h(
          'section',
          { class: 'card' },
          h('h2', { class: 'card-title' }, '초기화'),
          h('p', { class: 'card-text' }, '모든 진행을 지우고 처음부터 시작합니다. 확인 창이 한 번 더 나옵니다.'),
          h('button', { class: 'btn btn-danger', type: 'button', onClick: onReset }, '진행 초기화'),
        ),
      ),
    });
  });
}
