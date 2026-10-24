/* Local DOM extraction. No requests, cookies or execution of page scripts. */
(function(g) {
'use strict';
const clean=s=>String(s||'').replace(/\u00ad/g,'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
const norm=s=>clean(s).replace(/\s+/g,' ').trim();
const escape=s=>clean(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const validId=s=>/^\/\d+(?:\/\d+)*(?:\.\d+)?$/.test(s||'');
const anchor=id=>'n'+id.replace(/\//g,'-').replace(/\./g,'-d-');
function compare(a,b) {
 const x=a.split(/[/.]/).filter(Boolean).map(Number),y=b.split(/[/.]/).filter(Boolean).map(Number);
 for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];
 return x.length-y.length;
}
function textOf(el) {
 if(/^H[1-6]$/.test(el.tagName)) {
  const ps=[...el.children].filter(e=>e.tagName==='P');
  if(ps.length)return norm(ps.map(e=>e.textContent).join(' '));
 }
 return norm(el.textContent);
}
function serialize(el,issues,inHeading=false,media=null) {
 if(el.nodeType===3)return escape(el.nodeValue);
 if(el.nodeType!==1)return '';
 const tag=el.tagName.toLowerCase();
 if(['script','style','iframe','object','embed','button','input','svg'].includes(tag))return '';
 if(tag==='img' && media) {
 const key=media.prefix+'-'+media.items.length+'.png';
 media.items.push({key,src:el.currentSrc||el.src||el.getAttribute('src')||''});
 return '<img src="images/'+key+'" alt="'+escape(el.getAttribute('alt')||'')+'" />';
}
if(['img','canvas','video','audio'].includes(tag)) {
  issues.push('Медиа не перенесено: '+tag);
  return '<span>[Медиа не перенесено'+(el.getAttribute('alt')?': '+escape(el.getAttribute('alt')):'')+']</span>';
 }
 const heading=/^h[1-6]$/.test(tag);
 const body=[...el.childNodes].map(n=>serialize(n,issues,inHeading||heading,media)).join('');
 if(inHeading && tag==='p')return body+'<br />';
 if(tag==='br')return '<br />';
 if(tag==='hr')return '<hr />';
 if(!['p','h1','h2','h3','h4','h5','h6','blockquote','ul','ol','li','table','thead','tbody','tfoot','tr','td','th','strong','b','em','i','u','s','sup','sub','a','div','span','pre','code'].includes(tag))return body;
 let attrs=validId(el.id)?' id="'+anchor(el.id)+'"':'';
 if(tag==='a') {
  const href=el.getAttribute('href')||'';
  if(href.startsWith('#') && validId(href.slice(1)))attrs+=' href="#'+anchor(href.slice(1))+'"';
  else if(/^https?:\/\//i.test(href))attrs+=' href="'+escape(href)+'"';
  else if(href)issues.push('Ссылка или сноска без перенесённой цели');
 }
 if(['td','th'].includes(tag))for(const name of ['colspan','rowspan']) {
  const v=el.getAttribute(name);if(/^[1-9]\d{0,2}$/.test(v||''))attrs+=' '+name+'="'+v+'"';
 }
 return '<'+tag+attrs+'>'+body+'</'+tag+'>';
}
function extract(doc,bookId) {
 const root=doc.querySelector('[data-testid="virtualContent"]')||doc.querySelector('#virtual-content');
 if(!root)throw Error('Контейнер текста не найден. Дождитесь загрузки книги.');
 const candidates=[...root.querySelectorAll('[id]')].filter(e=>validId(e.id));
 const blocks=candidates.filter(el=>{
  for(let p=el.parentElement;p && p!==root;p=p.parentElement)if(validId(p.id))return false;
  return true;
 }).map(el=>{
  const issues=[],media={prefix:anchor(el.id),items:[]},html=serialize(el,issues,false,media);
  return {id:el.id,tag:el.tagName.toLowerCase(),text:textOf(el),html,issues:[...new Set(issues)],images:media.items};
 }).filter(b=>b.text||b.issues.length||b.images.length);
 if(!blocks.length)throw Error('Текст ещё не загружен или структура читалки изменилась.');
 const slider=doc.querySelector('[data-testid="readerProgressBar"]');
 const page=Number(slider?.value||slider?.getAttribute('value'))||null,total=Number(slider?.max)||null;
 const toc=[...doc.querySelectorAll('[data-testid="tocItem"]')].map(textOf).filter(Boolean);
 return {id:bookId,title:norm(doc.title),blocks,toc,page,total};
}
function merge(previous,snapshot) {
 if(previous && previous.id!==snapshot.id)throw Error('Идентификаторы книг не совпадают.');
 const b=previous||{id:snapshot.id,title:snapshot.title,blocks:{},toc:[],pages:[],totals:[],conflicts:[],started:new Date().toISOString()};
 b.assets=b.assets||{}; Object.assign(b.assets,snapshot.assets||{});
 for(const block of snapshot.blocks) {
  const old=b.blocks[block.id];
  if(old && old.html!==block.html && old.text!==block.text)b.conflicts=[...new Set([...b.conflicts,block.id])];
  else b.blocks[block.id]=block;
 }
 if(snapshot.toc.length>b.toc.length)b.toc=snapshot.toc;
 if(snapshot.page)b.pages=[...new Set([...b.pages,snapshot.page])].sort((a,c)=>a-c);
 if(snapshot.total)b.totals=[...new Set([...b.totals,snapshot.total])];
 b.updated=new Date().toISOString();return b;
}
function report(b) {
 if(!b)return {count:0,missing:[],issues:[],conflicts:0,pages:[],total:null,characters:0};
 const blocks=Object.values(b.blocks),headings=new Set(blocks.filter(x=>/^h[1-6]$/.test(x.tag)).map(x=>norm(x.text)));
 const html=blocks.map(x=>x.html).join(''),ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
 const broken=[...html.matchAll(/href="#([^"]+)"/g)].filter(x=>!ids.has(x[1])).length;
 const issues=[...new Set(blocks.flatMap(x=>x.issues))];
 const imageKeys=[...new Set(blocks.flatMap(x=>(x.images||[]).map(i=>i.key)))];
 const missingImages=imageKeys.filter(k=>!b.assets?.[k]);
 if(missingImages.length)issues.push("Изображений не загружено: "+missingImages.length);
 if(broken)issues.push('Ссылок на несобранные сноски/блоки: '+broken);
 if(b.totals.length>1)issues.push('Количество страниц менялось; покрытие страниц несопоставимо.');
 if(!b.toc.length)issues.push('Оглавление не найдено: откройте его в читалке во время сбора.');
 return {imageCount:imageKeys.length,imagesSaved:imageKeys.length-missingImages.length,missingImages, count:blocks.length,characters:blocks.reduce((n,x)=>n+x.text.length,0),missing:b.toc.filter(x=>!headings.has(norm(x))),issues,conflicts:b.conflicts.length,pages:b.pages,total:b.totals.length===1?b.totals[0]:null};
}
g.ReaderCore={clean,norm,escape,anchor,compare,extract,merge,report};
})(globalThis);
