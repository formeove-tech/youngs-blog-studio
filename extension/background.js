chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(sender.tab)return; // Only the extension popup may initiate a write.
 (async()=>{
  const tab=await chrome.tabs.get(message.tabId);const url=new URL(tab.url);
  if(message.action==='capture'){
   let target = tab;
   if(url.origin !== 'https://youngs-blog-studio.onrender.com') {
    const studios = await chrome.tabs.query({url:'https://youngs-blog-studio.onrender.com/*'});
    if(studios.length !== 1) throw Error(studios.length ? '영스 탭이 여러 개예요. 가져올 글이 있는 영스 탭에서 눌러주세요.' : '영스 사이트를 열어주세요. 또는 아래 ‘저장한 HTML에서 가져오기’를 이용하세요.');
    target = studios[0];
   }
   await chrome.scripting.executeScript({target:{tabId:target.id},files:['capture.js']});
   const results = await chrome.scripting.executeScript({target:{tabId:target.id},func:async()=>{
    try {
     const packet = globalThis.youngsExtractArticle(document);
     // Do not send photo-heavy data back through the script result/message channel.
     await chrome.storage.local.set({packet,status:{running:false,message:'글과 사진을 가져왔어요. 네이버에서 새 빈 글을 열어주세요.'}});
     return {ok:true,title:packet.title,photos:packet.blocks.filter(b=>b.type==='image').length};
    } catch(e) { return {ok:false,error:e.message || '글을 읽지 못했어요.'}; }
   }});
   const result = results[0]?.result;
   if(!result?.ok) throw Error(result?.error || '영스 화면에 연결하지 못했어요. 영스 탭을 새로 열거나 저장한 HTML에서 가져와주세요.');
   return {ok:true,title:result.title,photos:result.photos};
  }
  if(url.hostname!=='blog.naver.com')throw Error('네이버 블로그의 새 글쓰기 화면에서 실행하세요.');
  await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:['runner.js']});
  if(message.action==='diagnose'){
   const reports=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:()=>globalThis.youngsRunner.report()});return {report:reports.map(r=>({frameId:r.frameId,...r.result}))};
  }
  if(message.action==='stop'){await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:()=>{globalThis.youngsRunner.stop();}});return {};}
  if(message.action!=='write')throw Error('지원하지 않는 작업입니다.');
  const {packet,status}=await chrome.storage.local.get(['packet','status']);if(!packet)throw Error('영스 글을 먼저 가져오세요.');
  if(status?.running)throw Error('작성 중입니다. 완료되거나 중지될 때까지 기다려주세요.');
  const frames=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:()=>globalThis.youngsRunner.probe()});
  const match=frames.filter(f=>f.result);if(match.length!==1)throw Error('편집기를 정확히 찾지 못했어요. 진단 파일을 저장해 전달해주세요.');
  await chrome.storage.local.set({status:{running:true,message:'편집기 확인 중…'}});
  // Detached from the popup: closing it does not cancel the page-side task.
  chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[match[0].frameId]},func:(p,publish)=>{globalThis.youngsRunner.run(p,publish);},args:[packet,!!message.publish]}).catch(async e=>{await chrome.storage.local.set({status:{running:false,message:e.message}});});
  return {};
 })().then(reply).catch(async e=>{ const error=e.message || '작업에 실패했어요.'; await chrome.storage.local.set({status:{running:false,message:error}}); reply({error}); });return true;
});
