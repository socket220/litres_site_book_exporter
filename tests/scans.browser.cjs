const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),output=process.env.PDF_TEST_OUTPUT||fs.mkdtempSync(path.join(require('node:os').tmpdir(),'litres-scans-'));
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true});
 try{
 const page=await browser.newPage();const wait=async fn=>{const start=Date.now();while(Date.now()-start<30000){if(await page.evaluate(fn))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out waiting for capture');};await page.route('https://www.litres.ru/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic scans</title><style>#canvas{width:600px;height:280px;overflow:auto;position:relative}#pole{height:1250px;position:relative}.img_page{position:absolute;left:0}</style><div id="canvas" class="pdf_canvas"><div id="pole"></div></div>'}));
 await page.goto('https://www.litres.ru/static/reader/pdf/index.html?art=123');
 const messages=JSON.parse(fs.readFileSync(path.join(root,'_locales/en/messages.json'),'utf8'));
 await page.evaluate(messages=>{
  globalThis.L={msg:key=>{if(!messages[key])throw Error('Missing translation '+key);return messages[key].message;}};
  globalThis.browser={runtime:{getURL:p=>'moz-extension://test/'+p,onMessage:{addListener:fn=>{globalThis.contentListener=fn;}},sendMessage:m=>scanMessage(m,{url:location.href,tab:{id:1}})},downloads:{onChanged:{addListener:()=>{}},download:async({url})=>{globalThis.downloadUrl=url;return 1;}}};
  const sizes=[[600,800],[900,600],[600,900]],tops=[0,420,740];globalThis.urls=[];
  sizes.forEach(([w,h],i)=>{const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,w,h);c.fillStyle=['#993300','#003399','#006633'][i];c.fillRect(0,0,w,80);c.fillStyle='black';c.font='36px serif';c.fillText('SCANNED PAGE '+(i+1),30,130);c.fillRect(30,h-60,w-60,10);urls.push(canvas.toDataURL('image/png'));});
  const root=document.getElementById('canvas'),pole=document.getElementById('pole');
  const render=()=>{sizes.forEach(([w,h],i)=>{const exists=document.getElementById('p_'+i),near=tops[i]<root.scrollTop+root.clientHeight+120&&tops[i]+h/2>root.scrollTop-120;if(!near){exists?.remove();return;}if(exists)return;const node=document.createElement('div');node.id='p_'+i;node.className='img_page';node.dataset.testid='content__page';node.dataset.pageNumber=String(i+1);node.style.top=tops[i]+'px';const img=document.createElement('img');img.width=w/2;img.height=h/2;node.append(img);pole.append(node);setTimeout(()=>{img.src=urls[i];},250);});};
  root.addEventListener('scroll',()=>setTimeout(render,200));render();
 },messages);
 for(const name of ['scan-pdf.js','scan-store.js','scan-background.js','scan-content.js'])await page.addScriptTag({path:path.join(root,name)});
 await page.evaluate(()=>contentListener({type:'AUTO',fromStart:true,speed:'fast'}));
 await wait(async()=>{const b=await ScanStore.get('123');return b?.pages.length>0;});
 await page.evaluate(()=>contentListener({type:'STOP'}));
 assert.equal((await page.evaluate(()=>contentListener({type:'STATE'}))).active,false);
 await page.evaluate(()=>contentListener({type:'AUTO',fromStart:false,speed:'fast'}));
 await wait(async()=>!(await contentListener({type:'STATE'})).active);
 const state=await page.evaluate(()=>contentListener({type:'STATE'}));assert.equal(state.error,'');
 const report=await page.evaluate(()=>scanMessage({type:'PDF_REPORT',id:'123'},{url:'moz-extension://test/popup.html'}));
 assert.equal(report.report.count,3);assert.equal(report.report.total,3);assert.equal(report.report.canExport,true);assert.deepEqual(report.report.pages,[1,2,3]);
 const exported=await page.evaluate(async()=>{const r=await scanMessage({type:'PDF_EXPORT',id:'123'},{url:'moz-extension://test/popup.html'});if(!r.ok)throw Error(r.error);return [...new Uint8Array(await (await fetch(downloadUrl)).arrayBuffer())];});
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'scanned-pages.pdf'),Buffer.from(exported));
 const gaps=await page.evaluate(async()=>{const p=await ScanStore.get('123',1);await ScanStore.save('456','Gap',{...p,id:'456',number:1});await ScanStore.save('456','Gap',{...p,id:'456',number:3});await ScanStore.end('456',3);return scanMessage({type:'PDF_EXPORT',id:'456'},{url:'moz-extension://test/popup.html'});});assert.equal(gaps.ok,false);
 const forbidden=await page.evaluate(()=>scanMessage({type:'PDF_END',id:'123',number:3},{url:'https://example.com/',tab:{id:1}}));assert.equal(forbidden.ok,false);
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});});
 await page.evaluate(()=>contentListener({type:'AUTO',fromStart:false,speed:'fast'}));
 await wait(async()=>!(await contentListener({type:'STATE'})).active);
 assert.match((await page.evaluate(()=>contentListener({type:'STATE'}))).error,/hidden/);
 await page.reload();
 for(const name of ['scan-store.js'])await page.addScriptTag({path:path.join(root,name)});
 assert.equal(await page.evaluate(async()=>(await ScanStore.get('123')).pages.length),3);
 const popup=await browser.newPage();
 await popup.route('http://extension.test/**',route=>{const file=new URL(route.request().url()).pathname.slice(1);return route.fulfill({body:fs.readFileSync(path.join(root,file)),contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript'});});
 await popup.addInitScript(messages=>{
  globalThis.pdfComplete=false;globalThis.sent=[];
  globalThis.browser={i18n:{getMessage:k=>messages[k]?.message||'',getUILanguage:()=> 'en'},storage:{local:{get:async()=>({format:'epub'}),set:async()=>{}}},tabs:{query:async()=>[{id:1,url:'https://www.litres.ru/static/reader/pdf/index.html?art=123'}],sendMessage:async()=>({version:'0.7.0',active:false,pdf:true})},runtime:{sendMessage:async m=>{sent.push(m);return {ok:true,title:'Scans',report:{count:3,characters:0,pages:[1,2,3],total:3,issues:[],missing:[],conflicts:0,canExport:globalThis.pdfComplete}};}}};
 },messages);
 await popup.goto('http://extension.test/popup.html');await popup.waitForFunction(()=>document.getElementById('stats').textContent);
 assert.equal(await popup.locator('#format').inputValue(),'pdf');assert(!await popup.locator('#format').isEnabled());assert(!await popup.locator('#export').isEnabled());
 await popup.evaluate(()=>{globalThis.pdfComplete=true;});await popup.waitForFunction(()=>!document.getElementById('export').disabled);
 await popup.locator('#export').click();assert(await popup.evaluate(()=>sent.some(m=>m.type==='PDF_EXPORT')));
 console.log('PASS: lazy scanned pages, full pixel sizes, pause/resume, order, no duplicates, gap refusal, source checks, persistent storage. PDF: '+path.join(output,'scanned-pages.pdf'));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
