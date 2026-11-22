(function(g){
'use strict';
let opening;
function db(){return opening||(opening=new Promise((resolve,reject)=>{const r=indexedDB.open('litres-pdf-pages',1);r.onupgradeneeded=()=>{r.result.createObjectStore('pages',{keyPath:['id','number']});r.result.createObjectStore('books',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}));}
async function transaction(names,mode,work){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(names,mode);let result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.failure||tx.error||Error('Storage transaction aborted'));work(tx,value=>{result=value;});});}
async function get(id,number){return transaction([number===undefined?'books':'pages'],'readonly',(tx,done)=>{const r=tx.objectStore(number===undefined?'books':'pages').get(number===undefined?id:[id,number]);r.onsuccess=()=>done(r.result);});}
async function save(id,title,page){
 return transaction(['books','pages'],'readwrite',(tx,done)=>{
  const store=tx.objectStore('books'),r=store.get(id);
  r.onsuccess=()=>{
   const book=r.result||{id,title,pages:[],bytes:0,end:null};
   const old=book.pages.find(p=>p.number===page.number);
   const size=book.bytes-(old?.size||0)+page.bytes.length;
   if(size>250000000){tx.failure=Error(L.msg('pdfStorageLimit'));tx.abort();return;}
   book.bytes=size;book.title=title;book.pages=book.pages.filter(p=>p.number!==page.number);
   book.pages.push({number:page.number,width:page.width,height:page.height,size:page.bytes.length});book.pages.sort((a,b)=>a.number-b.number);
   tx.objectStore('pages').put({id,...page});store.put(book);done(book);
  };
 });
}
async function end(id,number){return transaction(['books'],'readwrite',(tx)=>{const s=tx.objectStore('books'),r=s.get(id);r.onsuccess=()=>{if(r.result)s.put({...r.result,end:number});};});}
g.ScanStore={get,save,end};
})(globalThis);
