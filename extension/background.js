// Opens the Naver write page when the studio asks. GoBlogWrite redirects to the signed-in blog.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'open-naver-write') return;
  chrome.tabs.create({ url: 'https://blog.naver.com/GoBlogWrite.naver' }).then(() => respond({ ok: true }), error => respond({ ok: false, error: String(error) }));
  return true;
});
