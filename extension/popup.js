const $=s=>document.querySelector(s);
async function refresh(){const {packet,status}=await chrome.storage.local.get(['packet','status']);$('#summary').textContent=packet?`${packet.title}\n사진 ${packet.blocks.filter(b=>b.type==='image').length}장`:'영스에서 완성한 글을 먼저 가져오세요.';$('#status').textContent=status?.message||'';}
async function request(action){try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const r=await chrome.runtime.sendMessage({action,tabId:tab.id,publish:$('#publish').checked});if(r?.error)throw Error(r.error);await refresh();}catch(e){$('#status').textContent=e.message;}}
$('#capture').onclick=()=>request('capture');$('#write').onclick=()=>request('write');$('#stop').onclick=()=>request('stop');
$('#clear').onclick=async()=>{await chrome.storage.local.remove(['packet','status']);await refresh();};
$('#diagnose').onclick=async()=>{try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const r=await chrome.runtime.sendMessage({action:'diagnose',tabId:tab.id});if(r.error)throw Error(r.error);const u=URL.createObjectURL(new Blob([JSON.stringify(r.report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='youngs-editor-diagnostic.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),3000);}catch(e){$('#status').textContent=e.message;}};
refresh();setInterval(refresh,1200);
