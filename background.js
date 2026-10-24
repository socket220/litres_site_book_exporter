'use strict';
let queue=Promise.resolve();
const key=id=>'book:'+id;
const get=async id=>(await browser.storage.local.get(key(id)))[key(id)]||null;
const downloads=new Map();
function checkId(id){if(!/^\d+$/.test(id||''))throw Error(L.msg('Invalid_book_identifier'));}

function sourceAllowed(sender,id){
 const u=new URL(sender.url||'about:blank');
 return u.origin==='https://www.litres.ru' && u.pathname.startsWith('/static/reader/text/') && u.searchParams.get('art')===id;
}
async function imageRequest(m,sender){
 if(!sourceAllowed(sender,m.id))throw Error(L.msg('Invalid_image_request_source'));
 const u=new URL(m.src);
 if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!/(^|\.)litres\.(ru|com)$/.test(u.hostname))throw Error(L.msg('Unsupported_image_domain')+u.hostname);
 const r=await fetch(u.href,{credentials:'include',redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error(L.msg('Image_HTTP')+r.status);
 const limit=10000000;
 if(Number(r.headers.get('content-length'))>limit)throw Error(L.msg('The_image_exceeds_MB'));
 const reader=r.body.getReader(),chunks=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit)throw Error(L.msg('The_image_exceeds_MB'));chunks.push(value);}}
 catch(e){await reader.cancel();throw e;}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let mime='';
 if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)mime='image/png';
 else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';
 else if(String.fromCharCode(...bytes.slice(0,3))==='GIF')mime='image/gif';
 else if(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')mime='image/webp';
 if(!mime)throw Error(L.msg('The_response_is_not_a_supported_raster_image'));
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return{ok:true,mime,base64:btoa(binary)};
}

async function dispatch(m,sender) {
 if(m.type==='SAVE') {
  const url=new URL(sender.url||'about:blank');
  if(url.origin!=='https://www.litres.ru' || !url.pathname.startsWith('/static/reader/text/') || url.searchParams.get('art')!==m.snapshot.id)throw Error(L.msg('The_text_source_does_not_match_the_book'));
  checkId(m.snapshot.id);
  const b=ReaderCore.merge(await get(m.snapshot.id),m.snapshot);
  await browser.storage.local.set({[key(b.id)]:b});return {ok:true};
 }
 if(sender.tab)throw Error(L.msg('This_command_is_only_available_to_extension_pages'));
 checkId(m.id);const b=await get(m.id);
 if(m.type==='REPORT')return {ok:true,title:b?.title,report:ReaderCore.report(b)};
 if(m.type==='EXPORT') {
  if(!b)throw Error(L.msg('Capture_some_text_first'));
  const format=m.format||'epub';
  if(!['epub','fb2','pdf'].includes(format))throw Error(L.msg('invalidFormat'));
  if(format==='pdf'){
   await browser.tabs.create({url:browser.runtime.getURL('print.html')+'?id='+encodeURIComponent(m.id)});
   return {ok:true};
  }
  const blob=format==='fb2'?ReaderFormats.fb2(b):ReaderEpub.build(b),url=URL.createObjectURL(blob);
  try {
   const filename=(b.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,110)||'Book')+'.'+format;
   const id=await browser.downloads.download({url,filename,saveAs:true});downloads.set(id,url);
  }catch(e){URL.revokeObjectURL(url);throw e;}
  return {ok:true};
 }
 throw Error(L.msg('Unknown_command'));
}
browser.runtime.onMessage.addListener((m,sender)=>{
 if(m.type==='IMAGE')return imageRequest(m,sender).catch(e=>({ok:false,error:e.message}));
 const result=queue.then(()=>dispatch(m,sender)).catch(e=>({ok:false,error:e.message}));
 queue=result.then(()=>undefined);return result;
});
browser.downloads.onChanged.addListener(delta=>{
 if(['complete','interrupted'].includes(delta.state?.current) && downloads.has(delta.id)){
  URL.revokeObjectURL(downloads.get(delta.id));downloads.delete(delta.id);
 }
});
