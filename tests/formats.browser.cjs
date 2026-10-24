const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const output=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'litres-exporter-test-'));
const chrome=process.env.CHROME_PATH;
(async()=>{
 const browser=await chromium.launch({...(chrome?{executablePath:chrome}:{}),headless:true});
 try{
 const page=await browser.newPage();
 const en=JSON.parse(fs.readFileSync(path.join(root,'_locales/en/messages.json'),'utf8'));
 await page.goto('about:blank');
 await page.evaluate(messages=>{globalThis.L={msg:k=>{if(!messages[k])throw Error(k);return messages[k].message;}}},en);
 for(const file of ['core.js','formats.js'])await page.addScriptTag({path:path.join(root,file)});
 const result=await page.evaluate(async()=>{
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=';
 const data=[['h1','<h1 id="heading">Глава &amp; Chapter</h1>'],['p','<p id="note">Привет <strong>World</strong> <a href="#heading">up</a><img src="images/pic.png" alt="test" /></p>'],['ul','<ul><li>One</li><li>Two</li></ul>'],['table','<table><tbody><tr><td>Cell</td></tr></tbody></table>']];
 globalThis.book={id:'123',title:'Автор - Test & Book',blocks:Object.fromEntries(data.map(([tag,html],i)=>['/1/'+i+'.0',{id:'/1/'+i+'.0',tag,html,text:'Test',images:[]} ])),assets:{'pic.png':{base64:png,mime:'image/png'}}};
 const xml=await ReaderFormats.fb2(book).text(),doc=new DOMParser().parseFromString(xml,'application/xml');
 document.body.append(ReaderFormats.printable(book,document));
 await Promise.all([...document.images].map(i=>i.decode()));
 return {xml,errors:doc.querySelectorAll('parsererror').length,binary:doc.querySelector('binary')?.textContent,images:doc.getElementsByTagName('image').length,title:doc.querySelector('book-title')?.textContent,printText:document.body.textContent,loaded:document.images[0].naturalWidth};
 });
 assert.equal(result.errors,0);assert.equal(result.images,1);assert.equal(result.title,'Автор - Test & Book');assert(result.loaded>0);assert.match(result.printText,/Привет World/);assert.match(result.xml,/<strong>World<\/strong>/);assert.match(result.xml,/<p>One<\/p><p>Two<\/p>/);
 fs.writeFileSync(path.join(output,'formats.fb2'),result.xml);
 const safety=await page.evaluate(()=>{
 const bad={...book,blocks:{'/1/0.0':{id:'/1/0.0',text:'safe',html:'<p onclick="alert(1)">safe<script>alert(1)</script><img src="https://example.com/tracker" /><a href="javascript:alert(1)">link</a></p>'}}};
 const div=document.createElement('div');div.append(ReaderFormats.printable(bad,document));return div.innerHTML;
 });
 assert.doesNotMatch(safety,/onclick|<script|javascript:|src="https:/);
 for(const locale of ['en','ru']){
 const ctx=await browser.newContext();
 const messages=JSON.parse(fs.readFileSync(path.join(root,'_locales',locale,'messages.json'),'utf8'));
 await ctx.route('http://extension.test/**',route=>{
 const filename=new URL(route.request().url()).pathname.slice(1)||'popup.html';
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
 return route.fulfill({body:fs.readFileSync(path.join(root,filename)),contentType:types[path.extname(filename)]||'application/octet-stream'});
 });
 await ctx.addInitScript(({messages,locale})=>{
 globalThis.sent=[];
 globalThis.browser={i18n:{getMessage:k=>messages[k]?.message||'',getUILanguage:()=>locale},storage:{local:{get:async()=>({}),set:async()=>{}}},tabs:{query:async()=>[{id:1,url:'https://www.litres.ru/static/reader/text/?art=123'}],sendMessage:async()=>({version:'0.4.0',active:false})},runtime:{sendMessage:async m=>{sent.push(m);return m.type==='REPORT'?{ok:true,title:'Test Book',report:{count:2,characters:20,pages:[1],total:2,imagesSaved:1,imageCount:1,missing:[],conflicts:0,issues:[]}}:{ok:true};}}};
 },{messages,locale});
 const p=await ctx.newPage();await p.goto('http://extension.test/popup.html');await p.waitForFunction(()=>document.getElementById('stats').textContent);
 assert.equal(await p.locator('h1').textContent(),'litres book exporter');
 assert.equal(await p.locator('#auto').textContent(),messages.auto.message);
 await p.locator('#format').selectOption('pdf');assert(await p.locator('#pdfHelp').isVisible());
 await p.locator('#ack').check();await p.locator('#export').click();
 assert.equal(await p.evaluate(()=>sent.find(m=>m.type==='EXPORT').format),'pdf');
 await p.screenshot({path:path.join(output,'popup-'+locale+'.png'),fullPage:true});
 const fixture=await page.evaluate(()=>book);
 await ctx.addInitScript(book=>{browser.storage.local.get=async()=>({'book:123':book});window.print=()=>{globalThis.printed=true;};},fixture);
 const printPage=await ctx.newPage();await printPage.goto('http://extension.test/print.html?id=123');
 await printPage.waitForFunction(()=>!document.getElementById('print').disabled);
 await printPage.locator('#print').click();assert(await printPage.evaluate(()=>printed));
 assert.match(await printPage.locator('#book').textContent(),/Привет/);
 await printPage.emulateMedia({media:'print'});assert(!await printPage.locator('header').isVisible());
 await ctx.close();
 }
 await page.addStyleTag({path:path.join(root,'print.css')});
 await page.pdf({path:path.join(output,'print.pdf'),preferCSSPageSize:true});
 await page.screenshot({path:path.join(output,'print.png'),fullPage:true});
 console.log('PASS: FB2 XML, Unicode, embedded images, formatting, printable DOM safety, English/Russian popup, PDF selection, PDF render');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
