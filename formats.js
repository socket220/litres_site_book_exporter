(function(g){
'use strict';
const E=ReaderCore.escape;
function blocks(book){
 const all=ReaderCore.exportBlocks(book);
 if(!all.length)throw Error(L.msg('No_saved_text'));
 return all;
}
function parse(html){return new DOMParser().parseFromString('<root>'+html+'</root>','application/xml').documentElement;}
function fb2(book){
 const used=new Set();

 function stateFor(node,parent={}){
  const state={...parent},tag=node.localName;
  const styles=Object.fromEntries(ReaderCore.safeStyle(node.getAttribute('style')).split(';').filter(Boolean).map(x=>x.split(':')));
  if(['b','strong'].includes(tag))state.bold=true;
  if(['em','i'].includes(tag))state.italic=true;
  if(tag==='s'&&!styles['text-decoration-line'])state.strike=true;
  if(['sup','sub'].includes(tag))state.script=tag;
  if(['code','pre'].includes(tag))state.code=true;
  if(tag==='pre')state.space='pre';
  if(styles['font-weight'])state.bold=styles['font-weight']==='bold'||Number(styles['font-weight'])>=600;
  if(styles['font-style'])state.italic=styles['font-style']!=='normal';
  if(styles['text-decoration-line']?.includes('line-through'))state.strike=true;
  if(styles['vertical-align'])state.script={super:'sup',sub:'sub'}[styles['vertical-align']]||null;
  if(styles['font-family'])state.code=styles['font-family']==='monospace';
  if(styles['white-space'])state.space=styles['white-space'];
  if(tag==='a'){
   const href=node.getAttribute('href')||'';
   if(/^(#|https?:\/\/)/.test(href))state.href=href;
  }
  return state;
 }
 function wrap(text,state){
  let result=text;
  for(const [enabled,tag] of [[state.code,'code'],[state.script,state.script],[state.strike,'strikethrough'],[state.italic,'emphasis'],[state.bold,'strong']])if(enabled&&result)result='<'+tag+'>'+result+'</'+tag+'>';
  return state.href&&result?'<a l:href="'+E(state.href)+'">'+result+'</a>':result;
 }
 // A private separator represents explicit line breaks. Wrappers are applied per line,
 // so splitting into FB2 paragraphs cannot leave unbalanced inline tags.
 const lineBreak='\u0000';
 function inline(node,parent={}){
  if(node.nodeType===3){
   let text=node.nodeValue;
   if(!['pre','pre-wrap','pre-line','break-spaces'].includes(parent.space))text=text.replace(/[ \t\r\n\f]+/g,' ');
   else if(parent.space!=='pre-line')text=text.replace(/ /g,'\u00a0').replace(/\t/g,'\u00a0\u00a0\u00a0\u00a0');
   return text.split(/\r?\n/).map(t=>wrap(E(t),parent)).join(lineBreak);
  }
  if(node.nodeType!==1)return '';
  const tag=node.localName;if(['script','style','iframe','object'].includes(tag))return '';
  if(tag==='br'||tag==='hr')return lineBreak;
  const state=stateFor(node,parent);
  if(tag==='img'){
   const key=(node.getAttribute('src')||'').replace(/^images\//,'');
   if(!book.assets?.[key])return '['+E(L.msg('imageMissing'))+']';
   used.add(key);return '<image l:href="#'+E(key)+'"/>';
  }
  return [...node.childNodes].map(n=>inline(n,state)).join('');
 }
 function paragraphs(body,attr=''){
  return body.split(lineBreak).map((line,i)=>line.trim()?'<p'+(i===0?attr:'')+'>'+line+'</p>':(i===0&&attr?'<p'+attr+'></p>':'<empty-line/>')).join('');
 }
 function convert(node,parent={}){
  if(node.nodeType===3)return node.nodeValue.trim()?paragraphs(inline(node,parent)):'';
  if(node.nodeType!==1)return '';
  const tag=node.localName;if(['script','style','iframe','object'].includes(tag))return '';
  const state=stateFor(node,parent),id=node.getAttribute('id'),attr=id?' id="'+E(id)+'"':'';
  if(tag==='hr')return '<empty-line/>';
  if(['table','tr','thead','tbody','tfoot'].includes(tag)){
   const body=[...node.children].map(n=>convert(n,state)).join('');
   return ['table','tr'].includes(tag)?'<'+tag+attr+'>'+body+'</'+tag+'>':body;
  }
  if(['td','th'].includes(tag)){
   let spans='';for(const key of ['colspan','rowspan']){const value=node.getAttribute(key);if(/^[1-9]\d{0,2}$/.test(value||''))spans+=' '+key+'="'+value+'"';}
   return '<'+tag+attr+spans+'>'+inline(node,parent).split(lineBreak).join(' / ')+'</'+tag+'>';
  }
  if(/^h[1-6]$/.test(tag))return inline(node,parent).split(lineBreak).map((line,i)=>'<subtitle'+(i===0?attr:'')+'>'+line+'</subtitle>').join('');
  if(tag==='li'){
   const ordered=node.parentElement?.localName==='ol',start=Number(node.parentElement?.getAttribute('start'))||1;
   const index=[...node.parentElement.children].filter(n=>n.localName==='li').indexOf(node);
   const own=[...node.childNodes].filter(n=>!['ul','ol'].includes(n.localName)).map(n=>inline(n,state)).join('');
   const nested=[...node.children].filter(n=>['ul','ol'].includes(n.localName)).map(n=>convert(n,state)).join('');
   return paragraphs((ordered?String(start+index)+'. ':'• ')+own,attr)+nested;
  }
  if(['p','pre'].includes(tag))return paragraphs(inline(node,parent),attr);
  const children=[...node.childNodes];
  if(['root','div','blockquote','ul','ol'].includes(tag)){
   let out='',pending='';
   const flush=()=>{if(pending.trim())out+=paragraphs(pending);pending='';};
   for(const child of children){
    if(child.nodeType===1&&/^(p|pre|div|blockquote|ul|ol|li|table|h[1-6]|hr)$/.test(child.localName)){flush();out+=convert(child,state);}
    else pending+=inline(child,state);
   }
   flush();return out;
  }
  return paragraphs(inline(node,parent),attr);
 }

 const sections=[];
 for(const b of blocks(book)){
  if(b.chapter){
   const title=parse(b.html).querySelector('h1');
   const aliases=[...parse(b.html).querySelectorAll('span[id]')].map(n=>'<p id="'+E(n.getAttribute('id'))+'"></p>').join('');
   sections.push({title:'<title>'+paragraphs(title?inline(title):E(b.text))+'</title>',id:ReaderCore.anchor(b.id),content:aliases});
   continue;
  }
  if(!sections.length)sections.push({title:'',id:'',content:''});
  const tree=parse(b.html);
  const result=tree.localName==='parsererror'?'<p>'+E(b.text)+'</p>':convert(tree);
  sections.at(-1).content+= /^(<p[ >]|<subtitle[ >]|<table[ >]|<empty-line)/.test(result)?result:'<p>'+result+'</p>';
 }
 const body=sections.map(s=>'<section'+(s.id?' id="'+E(s.id)+'"':'')+'>'+s.title+(s.content||'<empty-line/>')+'</section>').join('\n');
 const m=ReaderCore.metadata(book),cover=book.cover?.base64;
 const coverKey='export-cover.png';
 const annotation=m.description?'<annotation><p>'+E(m.description)+'</p></annotation>':'';
 const publish=m.publisher||m.year?'<publish-info>'+(m.publisher?'<publisher>'+E(m.publisher)+'</publisher>':'')+(m.year?'<year>'+E(m.year)+'</year>':'')+'</publish-info>':'';
 const xml='<?xml version="1.0" encoding="utf-8"?>\n<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink"><description><title-info><genre>other</genre><author><nickname>'+E(m.author||'Unknown')+'</nickname></author><book-title>'+E(m.title)+'</book-title>'+annotation+(cover?'<coverpage><image l:href="#'+coverKey+'"/></coverpage>':'')+'<lang>'+E(m.language)+'</lang></title-info><document-info><author><nickname>litres book exporter</nickname></author><program-used>litres book exporter 0.6.0</program-used><date>'+new Date().toISOString().slice(0,10)+'</date><id>litres-'+E(book.id)+'</id><version>1.0</version></document-info>'+publish+'</description><body>'+body+'</body>'+[...used].map(k=>'<binary id="'+E(k)+'" content-type="image/png">'+book.assets[k].base64+'</binary>').join('')+(cover?'<binary id="'+coverKey+'" content-type="image/png">'+cover+'</binary>':'')+'</FictionBook>';
 return new Blob([xml],{type:'application/x-fictionbook+xml;charset=utf-8'});
}
// Rebuild printable DOM from an allowlist; never execute captured HTML or load remote images.
function printable(book,doc){
 const fragment=doc.createDocumentFragment();
 if(book.cover?.base64){
  const page=doc.createElement('div');page.className='book-cover';
  const img=doc.createElement('img');img.src='data:image/png;base64,'+book.cover.base64;img.alt=ReaderCore.metadata(book).title;
  page.append(img);fragment.append(page);
 }
 const allowed=new Set('p h1 h2 h3 h4 h5 h6 blockquote ul ol li table thead tbody tfoot tr td th strong b em i u s sup sub a div span pre code br hr img'.split(' '));
 function copy(node){
  if(node.nodeType===3)return doc.createTextNode(node.nodeValue);
  if(node.nodeType!==1)return doc.createTextNode('');
  const tag=node.localName;
  if(!allowed.has(tag))return doc.createTextNode('');
  const el=doc.createElement(tag);
  const style=ReaderCore.safeStyle(node.getAttribute('style'));if(style)el.setAttribute('style',style);
  if(tag==='ol'&&/^-?\d{1,6}$/.test(node.getAttribute('start')||''))el.setAttribute('start',node.getAttribute('start'));
  if(tag==='img'){
   const key=(node.getAttribute('src')||'').replace(/^images\//,''),asset=book.assets?.[key];
   if(!asset)return doc.createTextNode('['+L.msg('imageMissing')+']');
   el.src='data:image/png;base64,'+asset.base64;el.alt=node.getAttribute('alt')||'';
  }
  if(node.hasAttribute('id'))el.id=node.getAttribute('id');
  if(tag==='a'){
   const href=node.getAttribute('href')||'';
   if(/^(#|https?:\/\/)/.test(href))el.setAttribute('href',href);
  }
  if(['td','th'].includes(tag))for(const key of ['colspan','rowspan']){
   const value=node.getAttribute(key);if(/^[1-9]\d{0,2}$/.test(value||''))el.setAttribute(key,value);
  }
  for(const child of node.childNodes)el.append(copy(child));
  return el;
 }
 for(const b of blocks(book)){
  const tree=parse(b.html);
  if(tree.localName==='parsererror'){const p=doc.createElement('p');p.textContent=b.text;fragment.append(p);}
  else for(const child of tree.childNodes)fragment.append(copy(child));
 }
 return fragment;
}
g.ReaderFormats={fb2,printable};
})(globalThis);
