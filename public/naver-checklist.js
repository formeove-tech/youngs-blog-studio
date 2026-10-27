export const checklistItems = [
  ['title','제목','auto','제목을 작성했는지 확인해요.'],
  ['body','본문 1,500자 이상','auto','공백·제목·해시태그를 제외한 본문 기준이에요.'],
  ['photos','사진 5장 · 가로 760px 이상','auto','초안에 들어간 사진의 실제 가로 크기를 확인해요. 작은 사진을 억지로 늘리지 않아요.'],
  ['gif','움직이는 GIF','manual','필요할 때 네이버에서 GIF 파일을 추가하세요.'],
  ['video','동영상','manual','직접 촬영한 영상이 있을 때 네이버 동영상 기능으로 올리세요.'],
  ['map','지도·위치 등록','manual','장소 기능에서 실제 방문 매장을 선택하세요. URL을 입력한 것과 장소 카드 등록은 달라요.'],
  ['file','첨부파일','manual','필요한 자료가 있을 때만 네이버 파일 기능으로 첨부하세요.'],
  ['link','관련 내부 링크','auto','내 블로그의 실제 관련 글 주소를 넣으면 링크로 만들어요.'],
  ['sticker','이모티콘·스티커','manual','네이버 스티커 기능에서 분위기에 맞는 것을 직접 골라주세요.'],
  ['symbol','특수문자','auto','본문 속 특수문자를 확인해요. 필요 이상으로 늘리지 마세요.'],
  ['divider','구분선','auto','이야기의 전환점에 구분선을 넣어요.'],
  ['quote','인용구','auto','한 줄 감상 인용문이에요. 네이버 전용 디자인은 붙여넣은 뒤 적용하세요.'],
  ['shopping','글감·쇼핑','manual','실제 소개하는 상품이 있을 때만 네이버 글감 기능을 사용하세요.'],
  ['talk','톡톡 버튼','manual','연결할 실제 톡톡 계정과 방문 목적이 있을 때만 추가하세요.'],
  ['table','표','auto','직접 입력한 매장 정보가 표로 정리돼요.'],
  ['tags','태그','auto','본문의 해시태그를 확인해요. 네이버 발행 화면의 태그에도 직접 입력하세요.'],
  ['knowledge','지식백과','manual','설명에 도움이 되는 실제 자료가 있을 때 출처와 함께 연결하세요.'],
  ['copyright','저작권','manual','사진·자료의 사용 권한을 확인하고 필요한 출처·설정을 반영하세요.'],
  ['schedule','일정','manual','실제 행사·방문 일정 안내가 있을 때만 등록하세요.'],
  ['market','블로그마켓','manual','판매 글을 작성할 때만 네이버 블로그마켓에서 설정하세요.'],
  ['clip','클립','manual','직접 만든 세로 영상이 있을 때 네이버 클립에서 등록하세요.'],
  ['formula','수식','manual','내용상 수식이 필요한 글에서만 네이버 수식 기능을 사용하세요.'],
  ['purchase','내돈내산 등록','manual','대상 구매·예약 내역이 있을 때 네이버의 실제 내돈내산 기능에서 등록하세요. 문구만 적는 것과 달라요.'],
  ['translate','번역','manual','번역이 필요한 경우 사용하고 뜻을 다시 확인하세요.'],
  ['spelling','맞춤법 검사','manual','네이버 편집기에서 맞춤법 검사를 실행하고 수정하세요.'],
  ['ai','AI 활용 표시 확인','manual','AI를 활용했다면 발행 화면에서 제공되는 관련 표시·설정을 확인하세요.']
];

export function evaluateChecklist({title='',body='',photoWidths=[],links=0,symbols=false,dividers=0,quote='',tables=0,tags=''}={}) {
  const characters=body.replace(/\s/g,'').length;
  const largePhotos=photoWidths.filter(width=>width>=760).length;
  return {
    title:{done:Boolean(title.trim()),detail:title.trim()?'제목 작성됨':'제목을 적어주세요'},
    body:{done:characters>=1500,detail:`${characters.toLocaleString('ko-KR')} / 1,500자 · 공백 제외`},
    photos:{done:photoWidths.length>=5 && largePhotos===photoWidths.length,detail:`${photoWidths.length} / 5장 · 가로 760px 이상 ${largePhotos}/${photoWidths.length}장`},
    link:{done:links>0,detail:`관련 글 링크 ${links}개`},
    symbol:{done:symbols,detail:symbols?'특수문자 있음':'필요한 경우만 사용'},
    divider:{done:dividers>0,detail:`구분선 ${dividers}개`},
    quote:{done:Boolean(quote.trim()),detail:quote.trim()?'한 줄 인용문 있음':'한 줄 감상을 입력하면 추가돼요'},
    table:{done:tables>0,detail:tables?'매장 정보 표 있음':'확인한 매장 정보를 입력해주세요'},
    tags:{done:/#[\p{L}\p{N}]/u.test(tags),detail:tags.trim()?'해시태그 있음':'관련 태그를 적어주세요'}
  };
}
