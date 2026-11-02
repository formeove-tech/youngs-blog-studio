chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(sender.tab)return; // Only the extension popup may initiate a write.
 (async()=>{
  const tab=await chrome.tabs.get(message.tabId);const url=new URL(tab.url);
  if(message.action==='capture'){
   if(url.origin!=='https://youngs-blog-studio.onrender.com')throw Error('영스에서 완성한 글을 연 뒤 실행하세요.');
   const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
    const article=document.querySelector('#article');if(!article||article.hidden)throw Error('완성한 글이 없습니다.');
    const title=article.querySelector('h1')?.innerText.trim();if(!title)throw Error('제목이 없습니다.');
    const blocks=[];
    for(const n of article.children){if(n.matches('.export-ignore,h1'))continue;
     if(n.tagName==='IMG'){if(!/^data:image\/(jpeg|png|webp);base64,/i.test(n.src))throw Error('사진 데이터 형식을 확인해주세요.');blocks.push({type:'image',src:n.src,alt:n.alt});}
     else if(n.tagName==='HR')blocks.push({type:'divider',text:'──────────'});
     else {let text=n.innerText?.trim()||'';if(n.tagName==='TABLE')text=[...n.rows].map(r=>[...r.cells].map(c=>c.innerText).join(' : ')).join('\n');if(n.querySelector('a[href]'))text+='\n'+n.querySelector('a').href;if(text)blocks.push({type:n.tagName==='H2'?'heading':n.tagName==='BLOCKQUOTE'?'quote':'text',text});}
    }
    return {version:1,title,blocks,capturedAt:Date.now()};
   }});
   await chrome.storage.local.set({packet:result,status:{message:'글과 사진을 가져왔어요. 네이버에서 새 빈 글을 열어주세요.'}});return {};
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
 })().then(reply).catch(e=>reply({error:e.message}));return true;
});
