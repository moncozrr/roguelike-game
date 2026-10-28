// 아주 작은 DOM 도우미. 프레임워크 없이 화면 요소를 만들 때 쓴다.
//   h('button', { class: 'btn', onClick: fn, disabled: true }, '글자', 자식요소)
// on으로 시작하는 속성은 이벤트 리스너, true는 빈 속성(disabled 등), false/null은 생략한다.
// 글자는 항상 textContent로 들어가므로 HTML로 해석되지 않는다(저장 데이터나 가져온 글자가 들어가도 안전하다).

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

// 확인 창(예/아니오). 페이지 안에 띄우는 대화상자이고, true/false로 끝나는 Promise를 돌려준다.
// Esc나 바깥 클릭은 "아니오"다. 위험한 동작(초기화, 덮어쓰기)에서 쓴다.
export function confirmDialog({ title, message, confirmLabel = '확인', cancelLabel = '취소', danger = false }) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const abort = new AbortController();
    const finish = (answer) => {
      abort.abort();
      overlay.remove();
      previousFocus?.focus?.();
      resolve(answer);
    };
    const cancelButton = h('button', { class: 'btn', type: 'button', onClick: () => finish(false) }, cancelLabel);
    const confirmButton = h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', onClick: () => finish(true) }, confirmLabel);
    const overlay = h(
      'div',
      { class: 'dialog-backdrop', role: 'presentation', onClick: (e) => e.target === overlay && finish(false) },
      h('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title }, h('h2', {}, title), h('p', {}, message), h('div', { class: 'dialog-actions' }, cancelButton, confirmButton)),
    );
    window.addEventListener('keydown', (e) => e.code === 'Escape' && finish(false), { signal: abort.signal });
    document.body.append(overlay);
    cancelButton.focus(); // 실수로 Enter를 눌러도 "취소"가 되도록 기본 포커스는 취소에 둔다.
  });
}
