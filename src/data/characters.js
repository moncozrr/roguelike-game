// 선택할 수 있는 캐릭터 목록. 이름은 [확정]이다(달: 2026-10-28, 무진: 2026-10-28).
// 두 캐릭터의 능력치와 무기는 같다(사용자 결정). 차이는 모습뿐이며, 배경과 설정은 정해지지 않았다.
// sheet: 인게임 8방향 시트(192x96), portrait: 선택 화면의 큰 일러스트. 둘 다 BASE_URL 뒤에 붙는 경로다.

export const CHARACTERS = [
  {
    id: 'dal',
    name: '달',
    sheet: 'assets/characters/dal/dal_8dir_48.png',
    portrait: 'assets/characters/portraits/dal.png',
  },
  {
    id: 'mujin',
    name: '무진',
    sheet: 'assets/characters/mujin/mujin_8dir_48.png',
    portrait: 'assets/characters/portraits/mujin.png',
  },
];

export const DEFAULT_CHARACTER_ID = 'dal'; // 캐릭터를 따로 고르지 않는 단독 실행(전투만 시작)에서 쓴다.

export function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) ?? null;
}

// 캐릭터 선택 상태: 카드를 고르면 강조되고, 입장 버튼은 목록에 있는 캐릭터를 골랐을 때만 켜진다. 처음에는 아무것도 고르지 않는다.
export function createCharacterSelection(characters = CHARACTERS) {
  let selectedId = null;
  return {
    get selectedId() {
      return selectedId;
    },
    // 목록에 있는 id만 받는다. 성공하면 true.
    select(id) {
      if (!characters.some((c) => c.id === id)) return false;
      selectedId = id;
      return true;
    },
    get canEnter() {
      return characters.some((c) => c.id === selectedId);
    },
    // 입장할 수 있으면 캐릭터 id를, 아니면 null을 돌려준다.
    enter() {
      return this.canEnter ? selectedId : null;
    },
  };
}
