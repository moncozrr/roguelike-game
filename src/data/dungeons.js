// 던전 목록. 첫 번째 이름은 [확정]이고, 두 번째 이름은 아직 정해지지 않아 [가칭]으로 표시한다.
// 가칭을 바꿀 때는 이 파일의 dungeon2.name 한 곳만 고치면 된다.

export const DUNGEONS = [
  {
    id: 'ruinedJoseon',
    name: '폐허가 된 조선', // [확정]
    description: '무너진 도성에 원혼이 떠돈다. 5분 안에 세 번의 보스가 길을 막는다.',
    available: true,
  },
  {
    id: 'dungeon2',
    name: '저승길 어귀', // [가칭] 최종 이름 미정
    placeholder: true,
    description: '준비 중인 던전입니다. (이름과 내용 미정)',
    available: false, // [임시] 입장은 "준비 중"으로 막는다. 전투 내용이 정해지면 true로 바꾼다.
  },
];

export function getDungeon(id) {
  return DUNGEONS.find((d) => d.id === id) ?? null;
}

// 던전 선택 상태: 카드를 고르면 강조되고, 입장 버튼은 입장할 수 있는 던전을 골랐을 때만 켜진다.
export function createDungeonSelection(dungeons = DUNGEONS) {
  let selectedId = null;
  return {
    get selectedId() {
      return selectedId;
    },
    // 목록에 있는 id만 받는다. 성공하면 true.
    select(id) {
      if (!dungeons.some((d) => d.id === id)) return false;
      selectedId = id;
      return true;
    },
    get canEnter() {
      return dungeons.some((d) => d.id === selectedId && d.available);
    },
    // 입장할 수 있으면 던전 id를, 아니면 null을 돌려준다.
    enter() {
      return this.canEnter ? selectedId : null;
    },
  };
}
