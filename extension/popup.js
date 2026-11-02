const $=s=>document.querySelector(s);
let working=false;
async function refresh(){
 const {packet,status}=await chrome.storage.local.get(['packet','status']);
 $('#summary').textContent=packet?`${packet.title}\n사진 ${packet.blocks.filter(b=>b.type==='image').length}장`:'블로그 작업실 글을 가져오거나 저장한 HTML을 선택해주세요.';
 if(!working) $('#status').textContent=status?.message||'';
}
async function failed(error){const message=error?.message||String(error);await chrome.storage.local.set({status:{running:false,message}});$('#status').textContent=message;}
async function request(action){
 if(working)return;working=true;$('#status').textContent='처리 중…';
 try {const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id)throw Error('현재 탭을 찾지 못했어요.');const response=await chrome.runtime.sendMessage({action,tabId:tab.id,publish:$('#publish').checked});if(!response)throw Error('확장 프로그램이 응답하지 않아요. chrome://extensions에서 새로고침해주세요.');if(response.error)throw Error(response.error);}
 catch(e){await failed(e);}finally{working=false;await refresh();}
}
$('#capture').onclick=()=>request('capture');$('#write').onclick=()=>request('write');$('#stop').onclick=()=>request('stop');
$('#clear').onclick=async()=>{if(working)return;await chrome.storage.local.remove(['packet','status']);await refresh();};
$('#import-html').onclick=()=>$('#html-file').click();
$('#html-file').onchange=async event=>{
 const file=event.target.files[0];if(!file)return;if(working)return;working=true;$('#status').textContent='저장 파일에서 글과 사진을 읽는 중…';
 try {
  if(file.size>100*1024*1024)throw Error('100MB 이하 HTML 파일을 선택해주세요.');
  const parsed=new DOMParser().parseFromString(await file.text(),'text/html');
  const packet=globalThis.youngsExtractArticle(parsed);
  await chrome.storage.local.set({packet,status:{running:false,message:'저장 파일에서 글과 사진을 가져왔어요. 네이버 새 글쓰기를 열어주세요.'}});
 }catch(e){await failed(e);}finally{working=false;event.target.value='';await refresh();}
};
$('#diagnose').onclick=async()=>{
 if(working)return;working=true;
 try {const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const response=await chrome.runtime.sendMessage({action:'diagnose',tabId:tab.id});if(!response)throw Error('확장 프로그램 응답이 없어요.');if(response.error)throw Error(response.error);const url=URL.createObjectURL(new Blob([JSON.stringify(response.report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='youngs-editor-diagnostic.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
 catch(e){await failed(e);}finally{working=false;await refresh();}
};
refresh().catch(failed);setInterval(()=>refresh().catch(failed),1200);
