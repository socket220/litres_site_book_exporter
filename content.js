(() => {
'use strict';
let active=false,mode='manual',bookId=null,observer=null,timer=null,interval=null,last='',error='',status=L.msg('Capture_stopped'),run=0,pending=null;
const cache=new Map(),sentAssets=new Set();
const speeds={fast:{min:300,quiet:200},normal:{min:600,quiet:300},careful:{min:2500,quiet:1200}};
let speed='normal';
const currentId=()=>new URL(location.href).searchParams.get('art');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function stop(){run++;active=false;observer?.disconnect();observer=null;clearTimeout(timer);clearInterval(interval);status=L.msg('Capture_paused_Progress_saved');}
function ensure(token){if(token!==run||!active)throw Error('CANCELLED');if(currentId()!==bookId)throw Error(L.msg('A_different_book_is_open_Restart_capture'));}
function frame(){return ReaderCore.extract(document,bookId);}
function signature(s){return JSON.stringify([s.id,s.page,s.total,s.blocks,s.toc]);}
function pngFrom(source){
 const w=source.naturalWidth||source.width,h=source.naturalHeight||source.height;
 if(!w||!h||w*h>24000000)throw Error(L.msg('The_image_is_empty_or_too_large'));
 const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(source,0,0);
 const base64=c.toDataURL('image/png').split(',')[1];
 if(base64.length>14000000)throw Error(L.msg('The_image_exceeds_the_MB_limit'));
 return {base64,mime:'image/png'};
}
async function loadImage(item){
 const live=[...document.querySelectorAll('#virtual-content img, [data-testid="virtualContent"] img')].find(i=>(i.currentSrc||i.src)===item.src);
 if(live?.complete&&live.naturalWidth){try{return pngFrom(live);}catch{}}
 let blob;
 if(/^(data:image\/|blob:)/i.test(item.src)){
  const r=await fetch(item.src,{signal:AbortSignal.timeout(15000)});blob=await r.blob();
 }else{
  const response=await browser.runtime.sendMessage({type:'IMAGE',id:bookId,src:item.src});
  if(!response.ok)throw Error(response.error);
  blob=new Blob([Uint8Array.from(atob(response.base64),c=>c.charCodeAt(0))],{type:response.mime});
 }
 if(blob.size>10000000)throw Error(L.msg('The_image_exceeds_the_MB_limit'));
 const bitmap=await createImageBitmap(blob);
 try{return pngFrom(bitmap);}finally{bitmap.close();}
}
async function capture(strict=false,token=run){
 while(pending){try{await pending;}catch{}}
 ensure(token);
 const task=(async()=>{
  const snapshot=frame(),before=signature(snapshot);
  snapshot.assets={};
  const failed=[];
  for(const item of snapshot.blocks.flatMap(b=>b.images||[])){
   ensure(token);
   const cacheKey=bookId+':'+item.key;
   if(!cache.has(cacheKey)){
    try{cache.set(cacheKey,await loadImage(item));}catch(e){failed.push(item.key+': '+e.message);}
   }
   if(cache.has(cacheKey)&&!sentAssets.has(cacheKey))snapshot.assets[item.key]=cache.get(cacheKey);
  }
  ensure(token);
  if(signature(frame())!==before)throw Error(L.msg('The_page_changed_while_saving_Capture_this_page_again'));
  if(before!==last||Object.keys(snapshot.assets).length){
   const result=await browser.runtime.sendMessage({type:'SAVE',snapshot});
   if(!result.ok)throw Error(result.error);
   last=before;
   for(const key of Object.keys(snapshot.assets))sentAssets.add(bookId+':'+key);
  }
  ensure(token);
  if(failed.length){
   error=L.msg('Images_not_loaded')+failed.length+'. '+failed[0];
   if(strict)throw Error(error);
  }else error='';
  return snapshot;
 })();
 pending=task;
 try{return await task;}finally{if(pending===task)pending=null;}
}
function slider(){return document.querySelector('[data-testid="readerProgressBar"]');}
function visibleTextReady(){
 const root=document.querySelector('[data-testid="virtualContent"]')||document.querySelector('#virtual-content');
 if(!root)return false;
 const viewport=document.querySelector('[data-testid="readerContent"]')||document.documentElement;
 if(viewport.getAttribute('aria-busy')==='true'||viewport.querySelector('[aria-busy="true"]'))return false;
 const v=viewport.getBoundingClientRect();
 return [...root.querySelectorAll('[id]')].some(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>Math.max(0,v.left)&&r.left<Math.min(innerWidth,v.right)&&r.bottom>Math.max(0,v.top)&&r.top<Math.min(innerHeight,v.bottom);});
}
async function stable(token,expected,total){
 let previous='',quiet=Date.now(),start=Date.now();
 while(Date.now()-start<20000){
  ensure(token);
  if(document.visibilityState==='hidden')throw Error(L.msg('The_tab_is_hidden_Return_to_the_book_and_resume_automatic_capture'));
  let s;
  if(!visibleTextReady()){previous='';quiet=Date.now();await sleep(100);continue;}
  try{s=frame();}catch{await sleep(100);continue;}
  if(total&&s.total!==total)throw Error(L.msg('The_page_count_changed_Restore_the_original_settings_and_restart_'));
  if(expected && s.page!==expected){previous='';quiet=Date.now();await sleep(100);continue;}
  const sig=signature(s);
  if(sig!==previous){previous=sig;quiet=Date.now();}
  if(Date.now()-start>=speeds[speed].min && Date.now()-quiet>=speeds[speed].quiet)return s;
  await sleep(100);
 }
 throw Error(L.msg('The_page_did_not_load_within_seconds_Check_the_reader_and_resume_'));
}
async function auto(token,fromStart){
 try{
  ensure(token);
  const initial=frame(),total=initial.total;
  if(!total||!initial.page||!slider())throw Error(L.msg('Page_counter_not_found'));
  if(fromStart&&initial.page!==1){
   const control=slider();
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(control,'1');
   control.dispatchEvent(new Event('input',{bubbles:true}));
   control.dispatchEvent(new Event('change',{bubbles:true}));
  }
  let s=await stable(token,fromStart?1:initial.page,total);
  for(let steps=0;steps<total;steps++){
   ensure(token);
   status=L.msg('Automatic_capture_page')+s.page+L.msg('of')+total+'.';
   const expectedPage=s.page;
   s=await capture(true,token);
   if(s.page!==expectedPage||s.total!==total)throw Error(L.msg('The_reading_position_changed_manually_Resume_capture_from_the_cur'));
   ensure(token);
   if(s.page>=total){
    active=false;status=L.msg('Last_page_reached_Check_the_report_before_exporting');return;
   }
   const next=document.querySelector('[data-testid="flipForward"]');
   if(!next||next.disabled||next.getAttribute('aria-disabled')==='true')throw Error(L.msg('The_next_page_button_is_unavailable'));
   const target=s.page+1;
   next.click();
   s=await stable(token,target,total);
  }
  throw Error(L.msg('Page_transition_limit_exceeded_Capture_paused'));
 }catch(e){
  if(token!==run||e.message==='CANCELLED')return;
  error=e.message;stop();status=L.msg('Automatic_capture_paused_due_to_an_error');
 }
}
async function manualTick(token){
 try{await capture(false,token);}catch(e){if(token===run&&e.message!=='CANCELLED')error=e.message;}
}
browser.runtime.onMessage.addListener(async message=>{
 if(['START','AUTO'].includes(message.type)){
  stop();bookId=currentId();
  if(!/^\d+$/.test(bookId||''))return{active:false,error:L.msg('The_URL_has_no_book_identifier')};
  active=true;error='';const token=run;
  if(message.type==='AUTO'){speed=Object.hasOwn(speeds,message.speed)?message.speed:'normal';mode='auto';status=L.msg('Preparing_automatic_capture');void auto(token,!!message.fromStart);}
  else{
   mode='manual';status=L.msg('Manual_capture_enabled');
   observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>manualTick(token),800);});
   observer.observe(document.body,{childList:true,subtree:true,characterData:true});
   interval=setInterval(()=>{if(!pending)void manualTick(token);},3000);
   void manualTick(token);
  }
 }else if(message.type==='STOP')stop();
 else if(message.type!=='STATE')return;
 return{active,error,id:currentId(),mode,status,speed,version:'0.4.0'};
});
addEventListener('pagehide',stop);
})();
