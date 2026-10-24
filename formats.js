(function(g){
'use strict';
const E=ReaderCore.escape;
function blocks(book){
 const all=Object.values(book.blocks).sort((a,b)=>ReaderCore.compare(a.id,b.id));
 if(!all.length)throw Error(L.msg('No_saved_text'));
 return all;
}
function parse(html){return new DOMParser().parseFromString('<root>'+html+'</root>','application/xml').documentElement;}
function fb2(book){
 const used=new Set();
 function convert(node,inline=false){
  if(node.nodeType===3)return E(node.nodeValue);
  if(node.nodeType!==1)return '';
  const tag=node.localName;
  if(['script','style','iframe','object'].includes(tag))return '';
  const id=node.getAttribute('id'),attr=id?' id="'+E(id)+'"':'';
  if(tag==='img'){
   const key=(node.getAttribute('src')||'').replace(/^images\//,'');
   if(!book.assets?.[key])return '['+E(L.msg('imageMissing'))+']';
   used.add(key);return '<image l:href="#'+E(key)+'"/>';
  }
  if(tag==='br')return '\n';
  if(tag==='hr')return inline?'\n':'<empty-line/>';
  const body=[...node.childNodes].map(n=>convert(n,inline||['p','li','td','th'].includes(tag)||/^h[1-6]$/.test(tag))).join('');
  if(!body.trim())return '';
  if(/^h[1-6]$/.test(tag))return '<subtitle'+attr+'>'+body+'</subtitle>';
  const mapped={b:'strong',strong:'strong',i:'emphasis',em:'emphasis',s:'strikethrough',sup:'sup',sub:'sub',code:'code'}[tag];
  if(mapped)return '<'+mapped+'>'+body+'</'+mapped+'>';
  if(tag==='a'){
   const href=node.getAttribute('href')||'';
   return /^(#|https?:\/\/)/.test(href)?'<a l:href="'+E(href)+'">'+body+'</a>':body;
  }
  if(['p','li','pre'].includes(tag))return inline?body:'<p'+attr+'>'+body+'</p>';
  if(['table','tr','td','th'].includes(tag))return '<'+tag+attr+'>'+body+'</'+tag+'>';
  if(['root','ul','ol','thead','tbody','tfoot','blockquote'].includes(tag))return body;
  if(tag==='div'&&!inline&&!node.querySelector('p,div,table,ul,ol,h1,h2,h3,h4,h5,h6'))return '<p'+attr+'>'+body+'</p>';
  return body;
 }
 const body=blocks(book).map(b=>{
  const tree=parse(b.html);
  if(tree.localName==='parsererror')return '<p>'+E(b.text)+'</p>';
  const result=convert(tree);
  return /^(<p[ >]|<subtitle[ >]|<table[ >]|<empty-line)/.test(result)?result:'<p>'+result+'</p>';
 }).join('\n');
 const split=book.title.indexOf(' - '),author=split>0?book.title.slice(0,split):'';
 const xml='<?xml version="1.0" encoding="utf-8"?>\n<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink"><description><title-info><genre>other</genre><author><nickname>'+E(author||'Unknown')+'</nickname></author><book-title>'+E(book.title)+'</book-title><lang>ru</lang></title-info><document-info><author><nickname>litres book exporter</nickname></author><program-used>litres book exporter 0.4.0</program-used><date>'+new Date().toISOString().slice(0,10)+'</date><id>litres-'+E(book.id)+'</id><version>1.0</version></document-info></description><body><section>'+body+'</section></body>'+[...used].map(k=>'<binary id="'+E(k)+'" content-type="image/png">'+book.assets[k].base64+'</binary>').join('')+'</FictionBook>';
 return new Blob([xml],{type:'application/x-fictionbook+xml;charset=utf-8'});
}
// Rebuild printable DOM from an allowlist; never execute captured HTML or load remote images.
function printable(book,doc){
 const fragment=doc.createDocumentFragment();
 const allowed=new Set('p h1 h2 h3 h4 h5 h6 blockquote ul ol li table thead tbody tfoot tr td th strong b em i u s sup sub a div span pre code br hr img'.split(' '));
 function copy(node){
  if(node.nodeType===3)return doc.createTextNode(node.nodeValue);
  if(node.nodeType!==1)return doc.createTextNode('');
  const tag=node.localName;
  if(!allowed.has(tag))return doc.createTextNode('');
  const el=doc.createElement(tag);
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
