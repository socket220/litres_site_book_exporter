(function(g){
'use strict';
let queue=Promise.resolve();
const downloads=new Map();
function source(sender,id){const u=new URL(sender.url||'about:blank');return u.origin==='https://www.litres.ru'&&u.pathname.startsWith('/static/reader/pdf/')&&u.searchParams.get('art')===id;}
async function dispatch(m,sender){
 if(!/^\d+$/.test(m.id||''))throw Error(L.msg('Invalid_book_identifier'));
 if(['PDF_SAVE','PDF_END'].includes(m.type)){
  if(!source(sender,m.id))throw Error(L.msg('The_text_source_does_not_match_the_book'));
 }else if(!(sender.url||'').startsWith(browser.runtime.getURL('')))throw Error(L.msg('This_command_is_only_available_to_extension_pages'));
 if(m.type==='PDF_SAVE'){
  const p=m.page;
  if(!p||!ScanPdf.validPage(p)||typeof p.base64!=='string'||p.base64.length>50000000||!/^[A-Za-z0-9+/]+={0,2}$/.test(p.base64))throw Error(L.msg('pdfLargePage'));
  const bytes=Uint8Array.from(atob(p.base64),c=>c.charCodeAt(0));
  await ScanStore.save(m.id,String(m.title||'').slice(0,1000),{number:p.number,width:p.width,height:p.height,bytes});return {ok:true};
 }
 const book=await ScanStore.get(m.id);
 if(m.type==='PDF_END'){
  if(!book||!Number.isInteger(m.number)||!book.pages.some(p=>p.number===m.number))throw Error(L.msg('pdfMissing'));
  await ScanStore.end(m.id,m.number);return {ok:true};
 }
 const pages=book?.pages||[],end=book?.end;
 const missing=[];if(end){const have=new Set(pages.map(p=>p.number));for(let i=1;i<=end;i++)if(!have.has(i))missing.push(i);}
 if(m.type==='PDF_REPORT')return {ok:true,title:book?.title,report:{count:pages.length,characters:0,pages:pages.map(p=>p.number),total:end||null,imagesSaved:pages.length,imageCount:end||pages.length,missing:[],conflicts:0,issues:[...(!end?[L.msg('pdfNotFinished')]:[]),...(missing.length?[L.msg('pdfMissing')+' '+missing.slice(0,30).join(', ')]:[])],canExport:!!end&&!missing.length}};
 if(m.type==='PDF_EXPORT'){
  if(!end||missing.length)throw Error(L.msg('pdfMissing'));
  const blob=await ScanPdf.build(pages.filter(p=>p.number<=end),n=>ScanStore.get(m.id,n),book.title),url=URL.createObjectURL(blob);
  try{const downloadId=await browser.downloads.download({url,filename:(book.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,110)||'Book')+'.pdf',saveAs:true});downloads.set(downloadId,url);}catch(e){URL.revokeObjectURL(url);throw e;}
  return {ok:true};
 }
 throw Error(L.msg('Unknown_command'));
}
g.scanMessage=(m,sender)=>{const result=queue.then(()=>dispatch(m,sender)).catch(e=>({ok:false,error:e.message}));queue=result.then(()=>{});return result;};
browser.downloads.onChanged.addListener(delta=>{if(['complete','interrupted'].includes(delta.state?.current)&&downloads.has(delta.id)){URL.revokeObjectURL(downloads.get(delta.id));downloads.delete(delta.id);}});
})(globalThis);
