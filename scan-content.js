(()=>{
'use strict';
const VERSION='0.7.0',seen=new Map();let active=false,mode='manual',run=0,status='',error='',speed='normal',bookId=null,pending=null;
const id=()=>new URL(location.href).searchParams.get('art');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const container=()=>document.querySelector('#canvas.pdf_canvas');
function ensure(token){if(!active||run!==token)throw Error('CANCELLED');if(bookId!==id())throw Error(L.msg('The_text_source_does_not_match_the_book'));if(document.visibilityState==='hidden')throw Error(L.msg('The_tab_is_hidden_Return_to_the_book_and_resume_automatic_capture'));}
function stop(){active=false;run++;status=L.msg('Capture_paused_Progress_saved');}
function nodes(){return [...document.querySelectorAll('[data-testid="content__page"][data-page-number]')].filter(node=>Number.isInteger(Number(node.dataset.pageNumber))&&Number(node.dataset.pageNumber)>0);}
function signature(node){const img=node.querySelector('img');return [node.dataset.pageNumber,img?.currentSrc||img?.src,img?.naturalWidth,img?.naturalHeight].join(':');}
async function savePages(token){
 ensure(token);const pages=nodes();if(!pages.length)throw Error(L.msg('pdfNoPages'));
 const saved=[];
 for(const node of pages){
  ensure(token);const number=Number(node.dataset.pageNumber),img=node.querySelector('img');
  if(!img?.complete||!img.naturalWidth)throw Error(L.msg('pdfLoading'));
  const before=signature(node);saved.push(number);
  if(seen.get(number)===before)continue;
  const width=img.naturalWidth,height=img.naturalHeight;
  if(width*height>32000000)throw Error(L.msg('pdfLargePage'));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.fillStyle='white';context.fillRect(0,0,width,height);context.drawImage(img,0,0);
  let rgba;try{rgba=context.getImageData(0,0,width,height).data;}catch{throw Error(L.msg('pdfUnreadable'));}
  const rgb=new Uint8Array(width*height*3);for(let i=0,j=0;i<rgba.length;i+=4){rgb[j++]=rgba[i];rgb[j++]=rgba[i+1];rgb[j++]=rgba[i+2];}
  const compressed=new Uint8Array(await new Response(new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  ensure(token);if(!node.isConnected||signature(node)!==before)throw Error(L.msg('pdfPageChanged'));
  let binary='';for(let i=0;i<compressed.length;i+=8192)binary+=String.fromCharCode(...compressed.subarray(i,i+8192));
  const result=await browser.runtime.sendMessage({type:'PDF_SAVE',id:bookId,title:document.title,page:{number,width,height,base64:btoa(binary)}});
  if(!result.ok)throw Error(result.error);seen.set(number,before);
  canvas.width=canvas.height=1;status=L.msg('pdfSavedPage')+' '+number;
 }
 return saved;
}
async function stable(token){
 let previous='',since=Date.now();const start=Date.now(),quiet={fast:400,normal:700,careful:1500}[speed];
 while(Date.now()-start<30000){
  ensure(token);const pages=nodes(),current=pages.map(signature).join('|');
  if(current!==previous){previous=current;since=Date.now();}
  if(pages.length&&pages.every(n=>{const img=n.querySelector('img');return img?.complete&&img.naturalWidth;})&&Date.now()-since>=quiet)return;
  await sleep(100);
 }
 throw Error(L.msg('pdfTimeout'));
}
async function collect(token,fromStart){
 const root=container();if(!root)throw Error(L.msg('pdfUnsupported'));
 if(fromStart){root.scrollTop=0;root.scrollLeft=0;await sleep(300);}
 await stable(token);
 const dimensions=[root.scrollWidth,root.scrollHeight,root.clientWidth,root.clientHeight].join(':');
 for(let step=0;step<20000;step++){
  ensure(token);
  if([root.scrollWidth,root.scrollHeight,root.clientWidth,root.clientHeight].join(':')!==dimensions)throw Error(L.msg('pdfSizeChanged'));
  const captured=await savePages(token);
  if(mode==='manual'){await sleep(1000);await stable(token);continue;}
  const vertical=root.scrollHeight>root.clientHeight+2;
  const position=vertical?root.scrollTop:root.scrollLeft,max=vertical?root.scrollHeight-root.clientHeight:root.scrollWidth-root.clientWidth;
  if(position>=max-2){
   await sleep(500);await stable(token);const last=await savePages(token);
   const result=await browser.runtime.sendMessage({type:'PDF_END',id:bookId,number:Math.max(...captured,...last)});if(!result.ok)throw Error(result.error);
   active=false;status=L.msg('pdfFinished');return;
  }
  const next=Math.min(max,position+(vertical?root.clientHeight:root.clientWidth)*0.7);
  if(vertical)root.scrollTop=next;else root.scrollLeft=next;
  await sleep(300);await stable(token);
 }
 throw Error(L.msg('pdfTimeout'));
}
browser.runtime.onMessage.addListener(async message=>{
 if(['AUTO','START'].includes(message.type)){
  stop();if(pending)await pending;
  if(bookId!==id())seen.clear();bookId=id();if(!/^\d+$/.test(bookId||''))return {active:false,error:L.msg('Invalid_book_identifier')};
  active=true;error='';mode=message.type==='AUTO'?'auto':'manual';speed=['fast','normal','careful'].includes(message.speed)?message.speed:'normal';
  const token=run;status=L.msg('Preparing_automatic_capture');
  pending=collect(token,message.type==='AUTO'&&message.fromStart).catch(e=>{if(token===run&&e.message!=='CANCELLED'){error=e.message;stop();}}).finally(()=>{pending=null;});
 }else if(message.type==='STOP')stop();else if(message.type!=='STATE')return;
 return {active,error,id:id(),mode,status,speed,version:VERSION,pdf:true};
});
addEventListener('pagehide',stop);
})();
