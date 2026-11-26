# 네이버 블로그 확장 프로그램 — 인계 문서

블로그 작업실(youngs-blog-studio.onrender.com)에서 쓴 글을 네이버 블로그 글쓰기 화면에 넣어주는 크롬 확장(MV3)이다.
**실제 네이버 편집기에서는 아직 한 번도 돌려보지 못했다.** 가짜 편집기(mock)에서만 통과했다. 이 문서를 읽는 쪽이 설치와 실제 시험을 이어간다.

## 왜 확장인가 (2026-11-25 실제 확인한 사실)
- 네이버 스마트에디터 ONE은 붙여넣은 HTML 안의 data URI 사진을 버린다. 작업실의 옛 ‘본문+사진 복사’와 저장 HTML 복사는 글만 들어갔다.
- 외부 주소 사진(`<img src="https://다른서버/...">`)은 붙여넣으면 보이지만, 발행 후에도 네이버가 가져가지 않고 외부 서버 것을 빌려 쓴다. 원본이 사라지면 깨지므로 쓰지 않는다.
- 네이버에 올라간 사진 주소(`*.pstatic.net`)가 든 HTML은 붙여넣으면 사진으로 들어간다. 사용자가 직접 확인했다.
- 그래서 방식은 “사진을 네이버 편집기에 먼저 올림 → 그 주소를 본문 HTML에 넣음 → 본문을 붙여넣음”이다. 작업실 사이트의 수동 3단계(`public/export.js`의 `naverImageUrls`·`matchNaverPhotos`)가 이미 이 방식으로 배포돼 실제로 동작한다. 확장은 같은 일을 버튼 한 번으로 줄이는 것이다.

## 파일
- `manifest.json` — MV3. 작업실 사이트와 `https://blog.naver.com/*`(모든 프레임)에 스크립트 주입.
- `studio.js` — 작업실에 ‘네이버로 보내기’ 버튼 추가. `#article`에서 제목·본문 HTML·사진을 뽑아 `chrome.storage.local.pending`에 저장하고 네이버 글쓰기 탭을 연다. 사진 자리는 `https://photo.invalid/N`, 사진 파일명은 `01.jpg…`.
- `background.js` — `https://blog.naver.com/GoBlogWrite.naver` 탭 열기.
- `match.js` — 네이버 사진 주소 판별과 번호순 정렬.
- `naver.js` — 편집기가 있는 프레임에 패널을 띄우고 ‘글 넣기’를 누르면: ① 사진 업로드 ② 제목 ③ 올린 사진 비우기 ④ 본문 붙여넣기. 발행은 누르지 않는다.

## naver.js가 가정한 것 (전부 실제 확인 필요)
공개 저장소 HITENEKEN/blog-auto-poster의 `NaverBrowserPoster.ts`(Playwright로 실제 발행에 쓰는 코드)에서 가져온 가정이다.
1. 편집기에 숨은 `input[type=file]`이 있고, `files`를 넣고 `change`를 쏘면 업로드된다. 없으면 `.se-canvas`에 합성 `drop`을 쏜다.
2. 여러 장을 올리면 배치 선택이 뜰 수 있다 → 글자가 `개별사진`인 요소를 누른다.
3. 업로드가 끝나면 `img.se-image-resource`의 src가 `postfiles.pstatic.net/.../01.jpg?type=…`처럼 파일명을 유지한다.
4. 본문 텍스트 모듈을 클릭하면 포커스가 이름이 `input_buffer…`인 숨은 iframe으로 가고, 그 문서에 합성 `ClipboardEvent('paste')`를 쏘면 편집기가 받는다. (참고 프로젝트에서 라이브 검증된 방식)
5. **가장 불확실:** 합성 `Ctrl+A`→`Backspace` 키 이벤트로 본문이 비워진다. 참고 프로젝트는 Playwright의 진짜 키 입력을 썼다. 확장은 진짜 키 입력을 못 쏜다.
6. **불확실:** 제목 칸(`.se-section-documentTitle .se-module-text`)을 클릭한 뒤 `text/plain` 붙여넣기로 제목이 들어간다.

5·6이 실패해도 멈추지 않는다. 사진은 올라간 상태에서 패널에 ‘본문 복사’·‘제목 복사’ 버튼이 생기고, 사용자가 Ctrl+A → Ctrl+V 한 번으로 마무리한다(이 경로는 사이트 수동 방식과 같아 동작이 확인돼 있다).

## 설치 (사용자 PC 크롬)
1. 저장소를 받고 `feat/naver-extension` 브랜치의 `extension/` 폴더를 준비한다.
2. `chrome://extensions` → 개발자 모드 켜기 → ‘압축해제된 확장 프로그램을 로드합니다’ → `extension` 폴더 선택.
3. 작업실 사이트를 새로고침하면 ‘네이버로 보내기’ 버튼이 보인다.

## 실제 시험 순서
1. 작업실에서 글을 만들거나 ‘저장한 글 불러오기’로 연다 → ‘네이버로 보내기’.
2. 열린 네이버 글쓰기 화면 오른쪽 아래 패널에서 ‘글 넣기’.
3. 끝나면 패널의 ‘기록 복사’로 진행 기록을 받아 본다. 기록에 단계별 결과가 찍힌다:
   - `시작: 프레임 … input_buffer 있음/없음 · 파일 입력 N개` → 가정 1·4
   - `사진 N장을 파일 입력으로/끌어놓기로 넘김`, `사진 주소 N개 확보 (번호로 정렬/올린 순서) 예: …` → 가정 1·2·3
   - `제목: 붙여넣기 성공 / insertText 성공 / 자동 입력 실패` → 가정 6
   - `본문 비우기 뒤: 컴포넌트 a, 사진 b, 글자 c` → 가정 5 (b·c가 0이어야 성공)
   - `본문 붙여넣기 (input_buffer): 사진 x→y, 글자 p→q` → 가정 4
4. 비공개로 발행해 사진이 보이고 주소가 `pstatic.net`인지 확인한다.

## 실패했을 때 손볼 곳
- 패널이 안 뜸: `hasEditor()`의 셀렉터, 또는 편집기 프레임의 URL이 `blog.naver.com`이 아닌 경우 manifest `matches`.
- 사진이 안 올라감: `FILE_INPUT`, `DROP_TARGET`, `pickSeparatePhotos()`. 편집기 화면에서 `document.querySelectorAll('input[type=file]')`와 사진 버튼 클릭 뒤 생기는 요소를 확인.
- 본문 비우기 실패(가장 가능성 높음): 대안 ① 올린 사진 컴포넌트를 하나씩 선택해 지우는 편집기 UI 동작 찾기 ② 사진 URL만 확보한 뒤 새 글쓰기 탭을 열어 거기에 본문 붙여넣기 ③ 그대로 수동 Ctrl+A→Ctrl+V 유지.
- 본문 붙여넣기가 무시됨: `inputTarget()`이 잡는 대상(`input_buffer` 프레임 이름, activeElement).

## 로컬에서 돌려볼 수 있는 것
- `npm test` — 사이트 로직과 `extension/match.js` 테스트.
- 가짜 편집기 시험은 저장소에 넣지 않았다. 실제 편집기와 다르기 때문에 통과해도 위 가정을 증명하지 못한다.

## 하지 말 것
- 자동 발행을 넣지 않는다. 사용자가 확인하고 직접 누른다.
- 사진을 외부 서버에 올려 주소로 붙이는 방식으로 돌아가지 않는다(위 ‘왜 확장인가’ 참고).
