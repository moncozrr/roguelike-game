// 카메라 계산과 월드/화면 좌표 변환. 화면(DOM)에 의존하지 않는다.
// 카메라 위치는 "화면 왼쪽 위 모서리가 가리키는 월드 좌표"이다.
//   screen = world - camera,  world = screen + camera

// 한 축의 카메라 위치. 대상을 화면 중앙에 두되 월드 밖이 보이지 않게 제한한다.
// 화면이 월드보다 크면 제한 범위가 뒤집히므로 월드를 가운데에 놓는다.
function cameraAxis(target, view, world) {
  if (view >= world) return (world - view) / 2;
  return Math.min(Math.max(target - view / 2, 0), world - view);
}

// target: 따라갈 월드 좌표 {x, y}, view: 화면 크기 {width, height}, world: 월드 크기 {width, height}
export function computeCamera(target, view, world) {
  return {
    x: cameraAxis(target.x, view.width, world.width),
    y: cameraAxis(target.y, view.height, world.height),
  };
}

export function worldToScreen(point, camera) {
  return { x: point.x - camera.x, y: point.y - camera.y };
}

export function screenToWorld(point, camera) {
  return { x: point.x + camera.x, y: point.y + camera.y };
}

// 화면에 보이는 월드 영역. 이후 적 생성 위치 계산이나 화면 밖 그리기 생략에 쓴다.
export function viewRect(camera, view) {
  return {
    left: camera.x,
    top: camera.y,
    right: camera.x + view.width,
    bottom: camera.y + view.height,
    width: view.width,
    height: view.height,
  };
}
