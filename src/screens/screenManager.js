// 화면 전환기: 한 번에 한 화면만 보여 주고, 화면을 바꿀 때 이전 화면의 destroy()를 반드시 부른다.
// 화면은 { element, destroy? } 를 돌려주는 함수다. 전투 화면처럼 정리할 것이 있는 화면이 destroy에서 리스너와 루프를 해제한다.

export function createScreenManager(root) {
  let current = null;

  function clear() {
    const old = current;
    current = null;
    old?.destroy?.();
    root.replaceChildren();
  }

  return {
    show(createScreen) {
      clear();
      current = createScreen();
      root.append(current.element);
    },
    destroy: clear,
  };
}
