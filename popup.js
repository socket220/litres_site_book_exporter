'use strict';
L.localize();
const $=id=>document.getElementById(id);
let tab,id,ready=false,count=0,refreshing=false,exporting=false;
function controls(active){$('editMetadata').disabled=!count;$('speed').disabled=active;$('auto').disabled=!ready||active;$('fromStart').disabled=active;$('start').disabled=!ready||active;$('stop').disabled=!ready||!active;$('export').disabled=exporting||!count;}
async function refresh() {
 if(refreshing||!id)return;refreshing=true;
 try {
  let state;
  try{state=await browser.tabs.sendMessage(tab.id,{type:'STATE'});if(state?.version!=='0.6.1')throw Error(L.msg('Outdated_version'));ready=true;if(state.active)$('speed').value=state.speed||'normal';}
  catch{ready=false;state={active:false,error:L.msg('Reload_the_book_tab_after_installing_the_extension')};}
  const result=await browser.runtime.sendMessage({type:'REPORT',id});if(!result.ok)throw Error(result.error);
  const r=result.report;count=r.count;
  $('title').textContent=result.title||L.msg('Book')+id;
  $('state').textContent=state.status||(state.active?L.msg('Capture_enabled_You_can_close_this_panel'):L.msg('Capture_stopped'));
  $('error').textContent=state.error||'';
  $('stats').textContent=L.msg('Blocks')+r.count+L.msg('characters')+r.characters.toLocaleString(browser.i18n.getUILanguage())+'\n'+L.msg('pages')+r.pages.length+(r.total?L.msg('of')+r.total:'')+'\n'+L.msg('images')+(r.imagesSaved||0)+L.msg('of')+(r.imageCount||0);
  $('details').replaceChildren();
  for(const text of [L.msg('Missing_headings')+r.missing.length,L.msg('Text_conflicts')+r.conflicts,...r.issues,...r.missing]){
   const p=document.createElement('p');p.textContent=text;$('details').append(p);
  }
  controls(state.active);
 }catch(e){$('error').textContent=e.message;}finally{refreshing=false;}
}
for(const [button,type] of [['start','START'],['stop','STOP'],['auto','AUTO']])$(button).addEventListener('click',async()=>{
 try{await browser.tabs.sendMessage(tab.id,{type,fromStart:$('fromStart').checked,speed:$('speed').value});await refresh();}catch(e){$('error').textContent=e.message;}
});
$('export').addEventListener('click',async()=>{
 exporting=true;$('export').disabled=true;
 try{const r=await browser.runtime.sendMessage({type:'EXPORT',id,format:$('format').value});if(!r.ok)throw Error(r.error);}
 catch(e){$('error').textContent=e.message;}
 finally{exporting=false;$('export').disabled=exporting||!count;}
});
(async()=>{
 [tab]=await browser.tabs.query({active:true,currentWindow:true});
 const url=new URL(tab?.url||'about:blank');id=url.searchParams.get('art');
 if(url.origin!=='https://www.litres.ru'||!url.pathname.startsWith('/static/reader/text/')||!/^\d+$/.test(id||'')){
  id=null;$('state').textContent=L.msg('Switch_to_the_Litres_reader_tab_and_reopen_this_panel');return;
 }
 const preferences=await browser.storage.local.get(['speed','format']);
 if(['epub','fb2','pdf'].includes(preferences.format))$('format').value=preferences.format;
 const updateFormat=()=>{$('pdfHelp').hidden=$('format').value!=='pdf';};updateFormat();
 $('format').addEventListener('change',()=>{updateFormat();browser.storage.local.set({format:$('format').value}).catch(e=>{$('error').textContent=e.message;});});if(['fast','normal','careful'].includes(preferences.speed))$('speed').value=preferences.speed;
 $('speed').addEventListener('change',()=>browser.storage.local.set({speed:$('speed').value}).catch(e=>{$('error').textContent=e.message;}));
 await refresh();setInterval(refresh,1500);
})().catch(e=>{$('error').textContent=e.message;});


$('editMetadata').addEventListener('click',async()=>{try{const r=await browser.runtime.sendMessage({type:'OPEN_METADATA',id});if(!r.ok)throw Error(r.error);}catch(e){$('error').textContent=e.message;}});
