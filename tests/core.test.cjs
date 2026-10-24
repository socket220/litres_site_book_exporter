'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..');
function runtime(){
 const ctx={TextEncoder,Blob,atob,btoa,crypto:webcrypto};
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
 for(const n of [...m.background.scripts,...m.content_scripts.flatMap(s=>s.js),'popup.js']){
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
 assert(r.issues.some(v=>v.includes('сноски')));
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
 assert.deepEqual(files.get('EPUB/images/pic.png'),Buffer.from(png,'base64'));
 assert.match(files.get('EPUB/package.opf').toString(),/href="images\/pic.png" media-type="image\/png"/);
 assert.match(files.get('EPUB/book.xhtml').toString(),/<img src="images\/pic.png"/);
 b.assets={};const partial=entries(Buffer.from(await E.build(b).arrayBuffer()));
 assert(!partial.has('EPUB/images/pic.png'));
 assert.match(partial.get('EPUB/book.xhtml').toString(),/Изображение не загружено/);
});
