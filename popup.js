'use strict';
const $=id=>document.getElementById(id);
let tab,id,ready=false,count=0,refreshing=false,exporting=false;
function controls(active){$('speed').disabled=active;$('auto').disabled=!ready||active;$('fromStart').disabled=active;$('start').disabled=!ready||active;$('stop').disabled=!ready||!active;$('export').disabled=exporting||!count||!$('ack').checked;}
async function refresh() {
 if(refreshing||!id)return;refreshing=true;
 try {
  let state;
  try{state=await browser.tabs.sendMessage(tab.id,{type:'STATE'});if(state?.version!=='0.3.0')throw Error('Старая версия');ready=true;if(state.active)$('speed').value=state.speed||'normal';}
  catch{ready=false;state={active:false,error:'Обновите вкладку книги после установки расширения.'};}
  const result=await browser.runtime.sendMessage({type:'REPORT',id});if(!result.ok)throw Error(result.error);
  const r=result.report;count=r.count;
  $('title').textContent=result.title||'Книга №'+id;
  $('state').textContent=state.status||(state.active?'Сбор включён. Можно закрыть эту панель.':'Сбор остановлен.');
  $('error').textContent=state.error||'';
  $('stats').textContent='Блоков: '+r.count+' · символов: '+r.characters.toLocaleString('ru-RU')+'\nОтмечено страниц: '+r.pages.length+(r.total?' из '+r.total:'')+'\nИзображений: '+(r.imagesSaved||0)+' из '+(r.imageCount||0);
  $('details').replaceChildren();
  for(const text of ['Несобранных заголовков: '+r.missing.length,'Конфликтов текста: '+r.conflicts,...r.issues,...r.missing]){
   const p=document.createElement('p');p.textContent=text;$('details').append(p);
  }
  controls(state.active);
 }catch(e){$('error').textContent=e.message;}finally{refreshing=false;}
}
for(const [button,type] of [['start','START'],['stop','STOP'],['auto','AUTO']])$(button).addEventListener('click',async()=>{
 try{await browser.tabs.sendMessage(tab.id,{type,fromStart:$('fromStart').checked,speed:$('speed').value});await refresh();}catch(e){$('error').textContent=e.message;}
});
$('ack').addEventListener('change',()=>{$('export').disabled=exporting||!count||!$('ack').checked;});
$('export').addEventListener('click',async()=>{
 exporting=true;$('export').disabled=true;
 try{const r=await browser.runtime.sendMessage({type:'EXPORT',id});if(!r.ok)throw Error(r.error);}
 catch(e){$('error').textContent=e.message;}
 finally{exporting=false;$('export').disabled=exporting||!count||!$('ack').checked;}
});
(async()=>{
 [tab]=await browser.tabs.query({active:true,currentWindow:true});
 const url=new URL(tab?.url||'about:blank');id=url.searchParams.get('art');
 if(url.origin!=='https://www.litres.ru'||!url.pathname.startsWith('/static/reader/text/')||!/^\d+$/.test(id||'')){
  id=null;$('state').textContent='Переключитесь на вкладку читалки Литрес и откройте панель снова.';return;
 }
 const preferences=await browser.storage.local.get('speed');if(['fast','normal','careful'].includes(preferences.speed))$('speed').value=preferences.speed;
 $('speed').addEventListener('change',()=>browser.storage.local.set({speed:$('speed').value}).catch(e=>{$('error').textContent=e.message;}));
 await refresh();setInterval(refresh,1500);
})().catch(e=>{$('error').textContent=e.message;});
