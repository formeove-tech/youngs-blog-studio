const GOTHIC = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
const MYEONGJO = '"Nanum Myeongjo", AppleMyungjo, Batang, serif';
const presets = new Map([
  ['bold-gothic', { body: GOTHIC, heading: GOTHIC, weight: '800' }],
  ['myeongjo', { body: MYEONGJO, heading: MYEONGJO, weight: '700', webFont: true }],
  ['magazine', { body: GOTHIC, heading: MYEONGJO, weight: '800', webFont: true }]
]);

export function articleTypography(value) {
  return presets.get(value);
}

export function loadArticleFonts(doc) {
  if (doc.head.querySelector('link[data-article-fonts]')) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap';
  link.referrerPolicy = 'no-referrer';
  link.dataset.articleFonts = '';
  doc.head.append(link);
}

// Apply the same families to saved HTML and to clipboard fragments, which omit the article wrapper.
export function styleExportedArticle(article) {
  const typography = articleTypography(article.dataset.fontStyle);
  if (!typography) return;
  article.querySelectorAll('h1,h2').forEach(heading => {
    heading.style.fontFamily = typography.heading;
    heading.style.fontWeight = typography.weight;
  });
  article.querySelectorAll('blockquote').forEach(quote => { quote.style.fontFamily = typography.heading; });
  article.querySelectorAll('p,th,td').forEach(text => { text.style.fontFamily = typography.body; });
}
