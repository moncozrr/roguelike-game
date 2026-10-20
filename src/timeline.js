// 게임 시간에 따라 이벤트를 한 번씩 발동시키는 타임라인.
// 화면(DOM)에 의존하지 않는다. 이벤트끼리는 서로의 상태를 참조하지 않는다.

// events: [{ id, at(초) }]
export function createTimeline(events) {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const fired = new Set();

  return {
    // time 이하이면서 아직 발동하지 않은 이벤트를 시간순으로 모두 발동하고 목록을 돌려준다.
    // 프레임이 이벤트 시각을 건너뛰어도 누락되지 않고, 같은 이벤트는 다시 발동하지 않는다.
    update(time) {
      const due = [];
      for (const event of sorted) {
        if (event.at <= time && !fired.has(event.id)) {
          fired.add(event.id);
          due.push(event);
        }
      }
      return due;
    },
    // 새 런을 시작할 때 발동 기록을 지운다.
    reset() {
      fired.clear();
    },
  };
}
