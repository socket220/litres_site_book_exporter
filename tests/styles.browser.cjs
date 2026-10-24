const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),output=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'litres-styles-test-'));
function entries(bytes){const b=Buffer.from(bytes),files=new Map();let o=0;while(o+30<=b.length&&b.readUInt32LE(o)===0x04034b50){const size=b.readUInt32LE(o+18),n=b.readUInt16LE(o+26),x=b.readUInt16LE(o+28),name=b.subarray(o+30,o+30+n).toString(),start=o+30+n+x;files.set(name,b.subarray(start,start+size));o=start+size;}return files;}
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true});
 try{
 const page=await browser.newPage();
 await page.route('http://localhost/**',route=>route.fulfill({body:'<!doctype html><html></html>',contentType:'text/html'}));await page.goto('http://localhost/');
 await page.setContent(`<style>
 body{font-size:16px}#virtual-content{font:20px/1.6 serif;color:rgb(240,240,240);background:rgb(20,20,20)}
 .paragraph{text-align:justify;text-indent:30px;margin-bottom:10px}.heavy{font-weight:700}.slant{font-style:italic}.plain{font-weight:400;font-style:normal}.under{text-decoration:underline}.strike{text-decoration:line-through}.accent{color:rgb(180,20,40);background-color:rgb(255,240,0)}.larger{font-size:24px}.title{font-size:28px;text-align:center}.mono{font-family:monospace}
 </style><div id="virtual-content">
 <p id="/1/1.0" class="paragraph">${'Body text to establish the base font size. '.repeat(3)}<span class="heavy">Bold <span class="slant">Both <span class="plain">Plain</span></span></span> <span class="under">Underline</span> <span class="strike">Strike</span> <span class="accent">Accent</span> <span class="larger">Large</span> <span class="mono">Code</span></p>
 <p id="/1/2.0"><span class="slant">First<br>Second</span><br><br>Fourth <sup>2</sup></p>
 <p id="/1/3.0" class="title">1. <em>Styled chapter</em></p>
 <ol id="/1/4.0" start="4"><li>Four</li><li>Five</li></ol>
 <pre id="/1/5.0">  indented\nnext</pre>
 </div>`);
 await page.evaluate(()=>{globalThis.L={msg:k=>k};});
 for(const name of ['core.js','formats.js','epub.js'])await page.addScriptTag({path:path.join(root,name)});
 const result=await page.evaluate(async()=>{
  document.title='Typography test';globalThis.book=ReaderCore.merge(null,ReaderCore.extract(document,'123'));
  const source=Object.values(book.blocks).map(b=>b.html).join('');
  const fb2=await ReaderFormats.fb2(book).text(),xml=new DOMParser().parseFromString(fb2,'application/xml');
  const bytes=[...new Uint8Array(await ReaderEpub.build(book).arrayBuffer())];
  document.querySelector('style').remove();document.body.replaceChildren(ReaderFormats.printable(book,document));
  const byText=text=>[...document.querySelectorAll('span')].find(el=>el.textContent===text);
  const plain=getComputedStyle(byText('Plain')),accent=getComputedStyle(byText('Accent'));
  const p=document.querySelector('p');
  return {source,fb2,bytes,xmlErrors:xml.querySelectorAll('parsererror').length,plain:{weight:plain.fontWeight,style:plain.fontStyle},accent:{color:accent.color,background:accent.backgroundColor},align:getComputedStyle(p).textAlign,indent:p.style.textIndent,heading:document.querySelector('h1').innerHTML,styleSafe:ReaderCore.safeStyle('position:fixed;background-image:url(https://example.com/track);color:rgb(1, 2, 3);font-size:1.2em')};
 });
 assert.equal(result.xmlErrors,0);assert.match(result.source,/font-weight:700/);assert.match(result.source,/text-indent:1.5em/);assert.doesNotMatch(result.source,/color:rgb\(240/);
 assert.equal(result.plain.weight,'400');assert.equal(result.plain.style,'normal');assert.equal(result.align,'justify');assert.equal(result.indent,'1.5em');
 assert.equal(result.accent.color,'rgb(180, 20, 40)');assert.equal(result.accent.background,'rgb(255, 240, 0)');
 assert.match(result.heading,/<em[^>]*>Styled chapter<\/em>/);
 assert.match(result.fb2,/<p[^>]*><emphasis>First<\/emphasis><\/p><p><emphasis>Second<\/emphasis><\/p><empty-line\/>/);
 assert.match(result.fb2,/<strikethrough>Strike<\/strikethrough>/);assert.match(result.fb2,/<code>Code<\/code>/);assert.match(result.fb2,/<sup>2<\/sup>/);
 assert.match(result.fb2,/<p>4\. Four<\/p><p>5\. Five<\/p>/);assert.match(result.fb2,/Styled chapter<\/emphasis>/);
 assert.match(result.fb2,/<code>  indented<\/code>/);
 assert.doesNotMatch(result.styleSafe,/position|url|background-image/);
 const files=entries(result.bytes);assert.match(files.get('EPUB/book.xhtml').toString(),/text-align:justify/);assert.match(files.get('EPUB/chapter1.xhtml').toString(),/<em[^>]*>Styled chapter<\/em>/);
 fs.writeFileSync(path.join(output,'styles.epub'),Buffer.from(result.bytes));fs.writeFileSync(path.join(output,'styles.fb2'),result.fb2);
 await page.addStyleTag({path:path.join(root,'print.css')});
 await page.pdf({path:path.join(output,'styles.pdf'),preferCSSPageSize:true});await page.screenshot({path:path.join(output,'styles.png'),fullPage:true});
 console.log('PASS: computed CSS, nested normal overrides, accent colors, relative sizes, heading markup, EPUB styles, FB2 line breaks, lists, preformatted text, safe print styles. Artifacts: '+output);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

