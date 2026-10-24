/* Local DOM extraction. No requests, cookies or execution of page scripts. */
(function(g) {
'use strict';
const clean=s=>String(s||'').replace(/\u00ad/g,'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
const norm=s=>clean(s).replace(/\s+/g,' ').trim();
const escape=s=>clean(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const validId=s=>/^\/\d+(?:\/\d+)*(?:\.\d+)?$/.test(s||'');
const anchor=id=>'n'+id.replace(/\//g,'-').replace(/\./g,'-d-');
function compare(a,b) {
 const x=a.split(/[/.]/).filter(Boolean).map(Number),y=b.split(/[/.]/).filter(Boolean).map(Number);
 for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];
 return x.length-y.length;
}
function textOf(el) {
 if(/^H[1-6]$/.test(el.tagName)) {
  const ps=[...el.children].filter(e=>e.tagName==='P');
  if(ps.length)return norm(ps.map(e=>e.textContent).join(' '));
 }
 return norm(el.textContent);
}

// Only portable typography values are serialized; never copy CSS URLs or layout rules.
function safeStyle(source){
 const rules={
  'font-weight':/^(normal|bold|[1-9]00)$/,
  'font-style':/^(normal|italic|oblique)$/,
  'text-decoration-line':/^(none|underline|line-through|underline line-through)$/,
  'text-align':/^(left|right|center|justify|start|end)$/,
  'white-space':/^(normal|pre|pre-wrap|pre-line|break-spaces)$/,
  'font-family':/^(serif|sans-serif|monospace)$/,
  'vertical-align':/^(baseline|super|sub)$/,
  'font-size':/^\d+(?:\.\d+)?em$/,
  'line-height':/^\d+(?:\.\d+)?$/,
  'text-indent':/^-?\d+(?:\.\d+)?em$/,
  'letter-spacing':/^-?\d+(?:\.\d+)?em$/,
  'margin-top':/^-?\d+(?:\.\d+)?em$/,
  'margin-bottom':/^-?\d+(?:\.\d+)?em$/,
  color:/^(initial|rgb\(\d{1,3}, ?\d{1,3}, ?\d{1,3}\)|rgba\(\d{1,3}, ?\d{1,3}, ?\d{1,3}, ?(?:0|1|0?\.\d+)\))$/,
  'background-color':/^(transparent|rgb\(\d{1,3}, ?\d{1,3}, ?\d{1,3}\)|rgba\(\d{1,3}, ?\d{1,3}, ?\d{1,3}, ?(?:0|1|0?\.\d+)\))$/
 };
 const out={};
 for(const declaration of String(source||'').split(';')){
  const colon=declaration.indexOf(':');if(colon<0)continue;
  const key=declaration.slice(0,colon).trim(),value=declaration.slice(colon+1).trim();
  if(rules[key]?.test(value))out[key]=value;
 }
 return Object.entries(out).map(([k,v])=>k+':'+v).join(';');
}
function typography(el,context){
 const view=el.ownerDocument.defaultView;if(!view)return '';
 const c=view.getComputedStyle(el),parent=el.parentElement?view.getComputedStyle(el.parentElement):c;
 const font=parseFloat(c.fontSize)||context.baseline||16;
 const base=el===context.block?context.baseline:(parseFloat(parent.fontSize)||font);
 const rules={'font-weight':c.fontWeight,'font-style':c.fontStyle,'white-space':c.whiteSpace};
 const em=(n,limit=8)=>Math.max(-limit,Math.min(limit,n)).toFixed(3).replace(/\.?0+$/,'')+'em';
 rules['font-size']=em(Math.max(0.3,Math.min(5,font/base)));
 const decoration=c.textDecorationLine.split(' ').filter(x=>['underline','line-through'].includes(x));
 rules['text-decoration-line']=decoration.length?['underline','line-through'].filter(x=>decoration.includes(x)).join(' '):'none';
 if(['super','sub'].includes(c.verticalAlign))rules['vertical-align']=c.verticalAlign;
 if(['p','div','blockquote','li','td','th','h1','h2','h3','h4','h5','h6','pre'].includes(el.localName)){
  rules['text-align']=c.textAlign;
  rules['text-indent']=em((parseFloat(c.textIndent)||0)/font);
  for(const [key,value] of [['margin-top',c.marginTop],['margin-bottom',c.marginBottom]])rules[key]=em((parseFloat(value)||0)/font);
 }
 if(c.lineHeight!=='normal')rules['line-height']=Math.max(0.8,Math.min(4,parseFloat(c.lineHeight)/font)).toFixed(3);
 if(c.letterSpacing!=='normal')rules['letter-spacing']=em((parseFloat(c.letterSpacing)||0)/font,1);
 const family=c.fontFamily.toLowerCase();
 if(/monospace/.test(family))rules['font-family']='monospace';
 else if(el===context.block||c.fontFamily!==parent.fontFamily)rules['font-family']=/sans-serif/.test(family)?'sans-serif':'serif';
 if(c.color!==context.color)rules.color=c.color;
 else if(el!==context.block&&parent.color!==context.color)rules.color='initial';
 if(c.backgroundColor!=='rgba(0, 0, 0, 0)'&&c.backgroundColor!==context.background)rules['background-color']=c.backgroundColor;
 return safeStyle(Object.entries(rules).map(([k,v])=>k+':'+v).join(';'));
}
function serialize(el,issues,inHeading=false,media=null,context=null) {
 if(el.nodeType===3)return escape(el.nodeValue);
 if(el.nodeType!==1)return '';
 const sourceTag=el.tagName.toLowerCase();
 const tag=({del:'s',ins:'u',small:'span',mark:'span',font:'span'})[sourceTag]||sourceTag;
 if(['script','style','iframe','object','embed','button','input','svg'].includes(tag))return '';
 if(tag==='img' && media) {
 const key=media.prefix+'-'+media.items.length+'.png';
 media.items.push({key,src:el.currentSrc||el.src||el.getAttribute('src')||''});
 return '<img src="images/'+key+'" alt="'+escape(el.getAttribute('alt')||'')+'" />';
}
if(['img','canvas','video','audio'].includes(tag)) {
  issues.push(L.msg('Media_not_included')+tag);
  return '<span>['+L.msg('mediaMissing')+(el.getAttribute('alt')?': '+escape(el.getAttribute('alt')):'')+']</span>';
 }
 const heading=/^h[1-6]$/.test(tag);
 const body=[...el.childNodes].map(n=>serialize(n,issues,inHeading||heading,media,context)).join('');
 if(inHeading && tag==='p')return '<span'+(context?' style="'+escape(typography(el,context))+'"':'')+'>'+body+'</span><br />';
 if(tag==='br')return '<br />';
 if(tag==='hr')return '<hr />';
 if(!['p','h1','h2','h3','h4','h5','h6','blockquote','ul','ol','li','table','thead','tbody','tfoot','tr','td','th','strong','b','em','i','u','s','sup','sub','a','div','span','pre','code'].includes(tag))return body;
 let attrs=validId(el.id)?' id="'+anchor(el.id)+'"':'';
 if(context){const style=typography(el,context);if(style)attrs+=' style="'+escape(style)+'"';}
 if(tag==='ol'&&/^-?\d{1,6}$/.test(el.getAttribute('start')||''))attrs+=' start="'+el.getAttribute('start')+'"';
 if(tag==='a') {
  const href=el.getAttribute('href')||'';
  if(href.startsWith('#') && validId(href.slice(1)))attrs+=' href="#'+anchor(href.slice(1))+'"';
  else if(/^https?:\/\//i.test(href))attrs+=' href="'+escape(href)+'"';
  else if(href)issues.push(L.msg('Link_or_footnote_target_not_included'));
 }
 if(['td','th'].includes(tag))for(const name of ['colspan','rowspan']) {
  const v=el.getAttribute(name);if(/^[1-9]\d{0,2}$/.test(v||''))attrs+=' '+name+'="'+v+'"';
 }
 return '<'+tag+attrs+'>'+body+'</'+tag+'>';
}
function extract(doc,bookId) {
 const root=doc.querySelector('[data-testid="virtualContent"]')||doc.querySelector('#virtual-content');
 if(!root)throw Error(L.msg('Text_container_not_found_Wait_for_the_book_to_load'));
 const candidates=[...root.querySelectorAll('[id]')].filter(e=>validId(e.id));
 const sizes=doc.defaultView?[...root.querySelectorAll('p')].filter(e=>textOf(e).length>80).slice(0,100).map(e=>parseFloat(doc.defaultView.getComputedStyle(e).fontSize)).filter(Number.isFinite).sort((a,b)=>a-b):[];
 const baseline=sizes.length?sizes[Math.floor(sizes.length/2)]:parseFloat(doc.defaultView?.getComputedStyle(root).fontSize||'16');
 const blocks=candidates.filter(el=>{
  for(let p=el.parentElement;p && p!==root;p=p.parentElement)if(validId(p.id))return false;
  return true;
 }).map(el=>{
  const rootStyle=doc.defaultView?.getComputedStyle(root);
  const issues=[],media={prefix:anchor(el.id),items:[]},html=serialize(el,issues,false,media,{block:el,baseline,color:rootStyle?.color,background:rootStyle?.backgroundColor});
  return {id:el.id,tag:el.tagName.toLowerCase(),text:textOf(el),html,issues:[...new Set(issues)],images:media.items,headingHint:headingHint(el,doc,baseline)};
 }).filter(b=>b.text||b.issues.length||b.images.length);
 if(!blocks.length)throw Error(L.msg('The_text_has_not_loaded_yet_or_the_reader_structure_has_changed'));
 const slider=doc.querySelector('[data-testid="readerProgressBar"]');
 const page=Number(slider?.value||slider?.getAttribute('value'))||null,total=Number(slider?.max)||null;
 const toc=[...doc.querySelectorAll('[data-testid="tocItem"]')].map(textOf).filter(Boolean);
 return {id:bookId,title:norm(doc.title),blocks,toc,page,total};
}

function headingHint(el,doc,baseline){
 if(!textOf(el)||textOf(el).length>180||el.querySelector('img,table,li'))return false;
 const view=doc.defaultView;if(!view)return false;
 const child=el.firstElementChild;
 const style=view.getComputedStyle(child&&textOf(child)===textOf(el)?child:el);
 return parseFloat(style.fontSize)>=baseline*1.25;
}
function metadata(book){
 const split=(book.title||'').indexOf(' - ');
 return {title:book.title||'',author:split>0?book.title.slice(0,split):'',language:'ru',publisher:'',year:'',description:'',...(book.metadata||{})};
}
function exportBlocks(book){
 const toc=new Set((book.toc||[]).map(t=>norm(t).toLocaleLowerCase()));
 return Object.values(book.blocks).sort((a,b)=>compare(a.id,b.id)).map(b=>{
  const text=norm(b.text),short=text.length>0&&text.length<=180;
  const named=/^(предисловие|введение|заключение|послесловие|благодарности|foreword|preface|introduction|conclusion|acknowledgements)$/i.test(text);
  const chapter=/^h[12]$/.test(b.tag)||(short&&(toc.has(text.toLocaleLowerCase())||named||b.headingHint===true));
  if(!chapter)return {...b,chapter:false};
  // Promote text-only blocks without flattening media or tables.
  const safe=!(b.images||[]).length&&!/<(?:table|ul|ol)\b/i.test(b.html);
  if(!safe)return {...b,chapter:false};
  const originalId=b.html.match(/\bid="([^"]+)"/)?.[1];
  const id=anchor(b.id);
  const alias=originalId&&originalId!==id?'<span id="'+escape(originalId)+'"></span>':'';
  const outer=b.html.match(/^<(p|div|span|h[1-6])\b([^>]*)>([\s\S]*)<\/\1>$/);
  const style=outer?.[2].match(/\bstyle="([^"]*)"/)?.[1];
  const inner=outer?outer[3].replace(/<(\/?)(?:p|div|h[1-6])\b/g,'<$1span'):escape(text);
  return {...b,tag:'h1',chapter:true,html:alias+'<h1 id="'+id+'"'+(style?' style="'+style+'"':'')+'>'+inner+'</h1>'};
 });
}

function merge(previous,snapshot) {
 if(previous && previous.id!==snapshot.id)throw Error(L.msg('Book_identifiers_do_not_match'));
 const b=previous||{id:snapshot.id,title:snapshot.title,blocks:{},toc:[],pages:[],totals:[],conflicts:[],started:new Date().toISOString()};
 b.assets=b.assets||{}; Object.assign(b.assets,snapshot.assets||{});
 for(const block of snapshot.blocks) {
  const old=b.blocks[block.id];
  if(old && old.html!==block.html && old.text!==block.text)b.conflicts=[...new Set([...b.conflicts,block.id])];
  else b.blocks[block.id]=block;
 }
 if(snapshot.toc.length>b.toc.length)b.toc=snapshot.toc;
 if(snapshot.page)b.pages=[...new Set([...b.pages,snapshot.page])].sort((a,c)=>a-c);
 if(snapshot.total)b.totals=[...new Set([...b.totals,snapshot.total])];
 b.updated=new Date().toISOString();return b;
}
function report(b) {
 if(!b)return {count:0,missing:[],issues:[],conflicts:0,pages:[],total:null,characters:0};
 const blocks=exportBlocks(b),headings=new Set(blocks.filter(x=>/^h[1-6]$/.test(x.tag)).map(x=>norm(x.text)));
 const html=blocks.map(x=>x.html).join(''),ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
 const broken=[...html.matchAll(/href="#([^"]+)"/g)].filter(x=>!ids.has(x[1])).length;
 const issues=[...new Set(blocks.flatMap(x=>x.issues))];
 const imageKeys=[...new Set(blocks.flatMap(x=>(x.images||[]).map(i=>i.key)))];
 const missingImages=imageKeys.filter(k=>!b.assets?.[k]);
 if(missingImages.length)issues.push(L.msg('Images_not_loadedAlt')+missingImages.length);
 if(broken)issues.push(L.msg('Links_to_missing_footnotes_or_blocks')+broken);
 if(b.totals.length>1)issues.push(L.msg('The_page_count_changed_page_coverage_cannot_be_compared'));
 if(!b.toc.length)issues.push(L.msg('Table_of_contents_not_found_open_it_in_the_reader_during_capture'));
 return {imageCount:imageKeys.length,imagesSaved:imageKeys.length-missingImages.length,missingImages, count:blocks.length,characters:blocks.reduce((n,x)=>n+x.text.length,0),missing:b.toc.filter(x=>!headings.has(norm(x))),issues,conflicts:b.conflicts.length,pages:b.pages,total:b.totals.length===1?b.totals[0]:null};
}
g.ReaderCore={clean,norm,escape,anchor,compare,extract,merge,report,metadata,exportBlocks,safeStyle};
})(globalThis);
