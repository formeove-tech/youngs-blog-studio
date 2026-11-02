(() => {
 if(globalThis.youngsRunner)return;
 let stopped=false,running=false;
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const visible=n=>!!n&&n.getClientRects().length>0;
 const title=()=>[...document.querySelectorAll('.se-title-text [contenteditable="true"],.se-documentTitle [contenteditable="true"]')].find(visible);
 const bodies=()=>[...document.querySelectorAll('.se-component.se-text [contenteditable="true"]')].filter(n=>visible(n)&&!n.closest('.se-documentTitle'));
 const status=message=>chrome.storage.local.set({status:{running:true,message}});
 const check=()=>{if(stopped)throw Error('사용자가 중지했어요. 이미 입력된 내용은 네이버에서 확인해주세요.');};
 async function until(test,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){check();const result=test();if(result)return result;await wait(250);}throw Error('편집기 응답을 확인하지 못했어요. 중복 실행하지 말고 작성된 내용과 진단 파일을 확인해주세요.');}
 const buttons=()=>[...document.querySelectorAll('button,[role="button"]')].filter(visible);
 const label=n=>(n.getAttribute('aria-label')||n.getAttribute('title')||n.innerText||'').trim();
 function setText(target,text){target.focus();const range=document.createRange();range.selectNodeContents(target);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);if(!document.execCommand('insertText',false,text))throw Error('본문 입력을 지원하지 않는 편집기예요. 진단 파일을 보내주세요.');}
 function lastBody(){const n=bodies().at(-1);if(!n)throw Error('본문 입력 위치를 찾지 못했어요.');return n;}
 async function paragraph(text,type){const target=lastBody();if(target.innerText.trim())throw Error('새 문단을 만들지 못했어요. 중복 입력을 방지하기 위해 멈췄어요.');setText(target,text);await wait(350);check();if(!target.innerText.includes(text))throw Error('입력 결과를 확인하지 못했어요.');
  if(type==='heading'){
   const range=document.createRange();range.selectNodeContents(target);getSelection().removeAllRanges();getSelection().addRange(range);document.execCommand('bold',false);document.execCommand('fontSize',false,'5');await wait(300);
   const node=target.querySelector('b,strong,font,span')||target;const style=getComputedStyle(node);if(Number.parseFloat(style.fontSize)<18||Number.parseInt(style.fontWeight)<600)throw Error('소제목 서식을 확인하지 못했어요. 진단 파일이 필요해요.');
   getSelection().collapseToEnd();document.execCommand('bold',false);document.execCommand('fontSize',false,'3');
  }
  target.focus();const range=document.createRange();range.selectNodeContents(target);range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);document.execCommand('insertParagraph');await wait(250);
 }
 async function photo(block,index){const before=document.querySelectorAll('.se-component.se-image').length;
  let input=[...document.querySelectorAll('input[type="file"]')].find(n=>/image/i.test(n.accept));
  if(!input){const candidates=buttons().filter(n=>/^(사진|사진 추가|사진 첨부)$/.test(label(n)));if(candidates.length!==1)throw Error('사진 업로드 버튼을 찾지 못했어요. 진단 파일을 저장해주세요.');candidates[0].click();input=await until(()=>[...document.querySelectorAll('input[type="file"]')].find(n=>/image/i.test(n.accept)),5000);}
  const match=block.src.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i);if(!match)throw Error('사진 형식 오류');
  const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));const file=new File([bytes],`${String(index).padStart(2,'0')}.${match[1].split('/')[1]}`,{type:match[1]});
  const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  await until(()=>document.querySelectorAll('.se-component.se-image').length>before,30000);
  await until(()=>[...document.querySelectorAll('.se-component.se-image img')].filter(visible).every(img=>img.complete&&img.naturalWidth>0),30000);
  const target=lastBody();if(target.innerText.trim())throw Error('사진 다음의 빈 문단을 확인하지 못했어요.');
 }
 function report(){return {version:'0.1.0',path:location.pathname,editorFound:!!title(),bodyEditableCount:bodies().length,editables:[...document.querySelectorAll('[contenteditable]')].map(n=>({tag:n.tagName,classes:n.className,editable:n.getAttribute('contenteditable')})).slice(0,60),buttons:buttons().map(n=>({label:label(n).slice(0,60),classes:n.className})).slice(0,120),fileInputs:[...document.querySelectorAll('input[type="file"]')].map(n=>({accept:n.accept,multiple:n.multiple})),imageComponents:document.querySelectorAll('.se-component.se-image').length};}
 async function run(packet,publish){if(running)return;running=true;stopped=false;try{
  if(publish)throw Error('이 시험판은 실제 네이버 작성·사진·서식 검증 전이라 자동 발행을 잠가두었어요. 먼저 발행 옵션을 끄고 초안을 시험해주세요.');
  if(!packet?.title||!Array.isArray(packet.blocks))throw Error('가져온 글 형식이 올바르지 않아요.');
  const heading=title();const initial=bodies();if(!heading||!initial.length)throw Error('편집기를 찾지 못했어요.');
  if(heading.innerText.trim()||initial.some(n=>n.innerText.trim())||document.querySelector('.se-component.se-image'))throw Error('빈 새 글에서만 실행할 수 있어요. 현재 글은 덮어쓰지 않습니다.');
  status('제목 입력 중…');setText(heading,packet.title);let count=0;
  for(const [i,block] of packet.blocks.entries()){check();await status(`${i+1}/${packet.blocks.length} 작성 중…`);if(block.type==='image')await photo(block,++count);else await paragraph(block.type==='quote'?`“${block.text}”`:block.text,block.type);}
  check();const actual=document.querySelectorAll('.se-component.se-image').length;if(actual!==count)throw Error('사진 개수가 맞지 않아 완료 처리하지 않았어요.');
  await chrome.storage.local.set({status:{running:false,message:`초안 입력을 마쳤어요. 사진 ${count}장과 소제목을 네이버에서 확인해주세요. 실제 발행은 실행하지 않았어요.`}});
 }catch(e){await chrome.storage.local.set({status:{running:false,message:e.message+'\n이미 입력된 내용은 유지됩니다. 오류 화면과 진단 파일을 전달해주세요.'}});}finally{running=false;}}
 globalThis.youngsRunner={report,probe:()=>!!title()&&bodies().length>0,run,stop:()=>{stopped=true;}};
})();
