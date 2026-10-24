'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..');
function runtime(){
 const messages=JSON.parse(fs.readFileSync(path.join(root,'_locales/en/messages.json'),'utf8'));
 const ctx={TextEncoder,Blob,atob,btoa,crypto:webcrypto,L:{msg:key=>{assert(messages[key],key);return messages[key].message;}}};
 vm.createContext(ctx);
 for(const name of ['core.js','epub.js'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),ctx);
 return ctx;
}
function block(id,text='Example',extra={}){
 return {id,text,html:'<p id="n-1-2-d-0">'+text+'</p>',tag:'p',issues:[],images:[],...extra};
}
function snapshot(blocks,extra={}){
 return {id:'123',title:'Example Author - Example Book',blocks,toc:[],page:1,total:2,...extra};
}
test('runtime files parse and manifest references exist',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 for(const n of [...m.background.scripts,...m.content_scripts.flatMap(s=>s.js),'popup.js','print.js','metadata.js']){
  new vm.Script(fs.readFileSync(path.join(root,n),'utf8'),{filename:n});
 }
 assert(fs.existsSync(path.join(root,m.browser_action.default_popup)));
});
test('merge deduplicates, updates formatting, preserves conflicting text and isolates books',()=>{
 const {ReaderCore:C}=runtime(),s=snapshot([block('/1/2.0')]);
 let b=C.merge(null,s);b=C.merge(b,s);
 assert.equal(Object.keys(b.blocks).length,1);
 C.merge(b,snapshot([block('/1/2.0','Example',{html:'<p><b>Example</b></p>'})]));
 assert.equal(b.conflicts.length,0);
 C.merge(b,snapshot([block('/1/2.0','Changed')]));
 assert.equal(b.conflicts.length,1);assert.equal(b.blocks['/1/2.0'].text,'Example');
 assert.throws(()=>C.merge(b,snapshot([],{id:'other'})));
 assert.deepEqual(['/1/10.0','/1/2.0','/1/3.0'].sort(C.compare),['/1/2.0','/1/3.0','/1/10.0']);
});
test('report identifies missing headings, images and internal targets',()=>{
 const {ReaderCore:C}=runtime();
 const s=snapshot([block('/1/2.0','Example',{html:'<p><a href="#missing">Example</a></p>',images:[{key:'pic.png',src:'https://www.litres.ru/example.png'}]})],{toc:['Uncollected chapter']});
 const b=C.merge(null,s),r=C.report(b);
 assert.equal(r.missing.length,1);assert.equal(r.missingImages.length,1);
 assert(r.issues.some(v=>v.includes('footnotes')));
 C.merge(b,snapshot([],{assets:{'pic.png':{base64:'AA==',mime:'image/png'}},page:2}));
 assert.equal(C.report(b).imagesSaved,1);assert.equal(b.pages.length,2);
});
function entries(buffer){
 const files=new Map();let offset=0;
 while(offset+30<=buffer.length && buffer.readUInt32LE(offset)===0x04034b50){
  assert.equal(buffer.readUInt16LE(offset+8),0,'ZIP entries use STORE');
  const size=buffer.readUInt32LE(offset+18),nameSize=buffer.readUInt16LE(offset+26),extra=buffer.readUInt16LE(offset+28);
  const name=buffer.subarray(offset+30,offset+30+nameSize).toString('utf8');
  const start=offset+30+nameSize+extra;
  files.set(name,buffer.subarray(start,start+size));offset=start+size;
 }
 return files;
}
test('EPUB embeds binary images with manifest references and flags missing images',async()=>{
 const {ReaderCore:C,ReaderEpub:E}=runtime();
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=';
 const s=snapshot([block('/1/2.0','Example',{html:'<p>Example<img src="images/pic.png" alt="" /></p>',images:[{key:'pic.png'}]})],{assets:{'pic.png':{base64:png,mime:'image/png'}}});
 const b=C.merge(null,s),files=entries(Buffer.from(await E.build(b).arrayBuffer()));
 assert.equal([...files.keys()][0],'mimetype');
 assert.equal(files.get('mimetype').toString(),'application/epub+zip');
 assert(!files.has('EPUB/notice.xhtml'));
 assert.doesNotMatch(files.get('EPUB/nav.xhtml').toString(),/notice\.xhtml/);
 assert.match(files.get('EPUB/package.opf').toString(),/<spine><itemref idref="book"\/><\/spine>/);
 assert.match(files.get('EPUB/package.opf').toString(),/<dc:title>Example Author - Example Book<\/dc:title>/);
 assert.deepEqual(files.get('EPUB/images/pic.png'),Buffer.from(png,'base64'));
 assert.match(files.get('EPUB/package.opf').toString(),/href="images\/pic.png" media-type="image\/png"/);
 assert.match(files.get('EPUB/book.xhtml').toString(),/<img src="images\/pic.png"/);
 b.assets={};const partial=entries(Buffer.from(await E.build(b).arrayBuffer()));
 assert(!partial.has('EPUB/images/pic.png'));
 assert.match(partial.get('EPUB/book.xhtml').toString(),/Image not loaded/);
});

test('English and Russian catalogs cover every runtime message and preserve add-on identity',()=>{
 const catalogs=['en','ru'].map(locale=>JSON.parse(fs.readFileSync(path.join(root,'_locales',locale,'messages.json'),'utf8')));
 const keys=[];
 for(const name of fs.readdirSync(root).filter(n=>/\.(js|html)$/.test(n))){
  const source=fs.readFileSync(path.join(root,name),'utf8');
  for(const match of source.matchAll(/L\.msg\('([^']+)'|data-i18n="([^"]+)"/g))keys.push(match[1]||match[2]);
 }
 for(const key of keys)for(const catalog of catalogs)assert(catalog[key]?.message,`Missing translation: ${key}`);
 assert.deepEqual(Object.keys(catalogs[0]).sort(),Object.keys(catalogs[1]).sort());
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 assert.equal(manifest.default_locale,'en');
 assert.equal(manifest.name,'litres book exporter');
 assert.equal(manifest.browser_specific_settings.gecko.id,'local-reader-epub@example.invalid');
});

test('EPUB exports editable metadata, cover and chapter files with working cross-links',async()=>{
 const {ReaderCore:C,ReaderEpub:E}=runtime();
 const heading=block('/1/3.0','1. Что такое речь',{html:'<p id="chapter">1. Что такое речь</p>'});
 const b=C.merge(null,snapshot([
  block('/1/1.0','Предисловие',{html:'<p id="preface">Предисловие</p>'}),
  block('/1/2.0','Intro',{html:'<p><a href="#chapter">Next</a></p>'}),heading,
  block('/1/4.0','1. Ordinary list item',{html:'<p>1. Ordinary list item</p>'})
 ],{toc:['1. Что такое речь']}));
 b.metadata={title:'Custom & Title',author:'A < B',language:'en',publisher:'Publisher',year:'2020',description:'Description & notes'};
 b.cover={mime:'image/png',base64:'iVBORw0KGgo='};
 const original=b.blocks['/1/3.0'].html;
 const files=entries(Buffer.from(await E.build(b).arrayBuffer())),opf=files.get('EPUB/package.opf').toString();
 assert.match(opf,/properties="cover-image"/);assert.match(opf,/<meta name="cover" content="cover-image"/);
 assert.match(opf,/<dc:title>Custom &amp; Title<\/dc:title>/);assert.match(opf,/<dc:creator>A &lt; B<\/dc:creator>/);
 assert.match(opf,/<dc:language>en<\/dc:language>/);assert.match(opf,/<dc:publisher>Publisher<\/dc:publisher>/);
 assert.match(opf,/<dc:date>2020<\/dc:date>/);assert.match(opf,/<dc:description>Description &amp; notes/);
 assert(files.has('EPUB/cover.png'));assert(files.has('EPUB/cover.xhtml'));assert(files.has('EPUB/chapter1.xhtml'));
 assert.match(files.get('EPUB/book.xhtml').toString(),/href="chapter1.xhtml#chapter"/);
 assert.match(files.get('EPUB/chapter1.xhtml').toString(),/<h1 id="n-1-3-d-0">1. Что такое речь<\/h1>/);
 assert.match(files.get('EPUB/chapter1.xhtml').toString(),/<p>1. Ordinary list item<\/p>/);
 assert.match(files.get('EPUB/nav.xhtml').toString(),/chapter1.xhtml#n-1-3-d-0/);
 assert.equal(b.blocks['/1/3.0'].html,original);
 C.merge(b,snapshot([]));assert.equal(b.metadata.title,'Custom & Title');assert(b.cover);
});

test('cover persists independently of metadata and accepts only extension editor commands',async()=>{
 const ctx=runtime(),saved={};let listener;
 const book=ctx.ReaderCore.merge(null,snapshot([block('/1/2.0')]));saved['book:123']=book;
 ctx.URL=URL;
 ctx.browser={runtime:{getURL:p=>'moz-extension://test/'+p,onMessage:{addListener:fn=>{listener=fn;}}},storage:{local:{get:async key=>({[key]:structuredClone(saved[key])}),set:async data=>Object.assign(saved,structuredClone(data))}},downloads:{onChanged:{addListener:()=>{}}}};
 vm.runInContext(fs.readFileSync(path.join(root,'background.js'),'utf8'),ctx);
 const sender={url:'moz-extension://test/metadata.html?id=123',tab:{id:9}};
 const cover={mime:'image/png',base64:'iVBORw0KGgo=',filename:'cover.png'};
 assert((await listener({type:'COVER_SAVE',id:'123',cover},sender)).ok);
 const metadata={title:'Edited',author:'Author',language:'ru',publisher:'',year:'',description:''};
 assert((await listener({type:'METADATA_SAVE',id:'123',metadata},sender)).ok);
 const loaded=await listener({type:'METADATA_GET',id:'123'},sender);
 assert.equal(loaded.cover.filename,'cover.png');assert.equal(loaded.metadata.title,'Edited');
 assert.equal((await listener({type:'COVER_SAVE',id:'123',cover:null},{url:'https://www.litres.ru/static/reader/text/?art=123',tab:{id:1}})).ok,false);
 assert((await listener({type:'COVER_SAVE',id:'123',cover:null},sender)).ok);
 assert.equal((await listener({type:'METADATA_GET',id:'123'},sender)).cover,null);
});
