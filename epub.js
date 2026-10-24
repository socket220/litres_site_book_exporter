(function(g) {
'use strict';
const enc=new TextEncoder();
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
// ZIP STORE. EPUB requires mimetype first and uncompressed.
function zip(files) {
 const parts=[],central=[];let offset=0,centralSize=0;
 for(const [name,text] of files) {
  const n=enc.encode(name),data=typeof text==='string'?enc.encode(text):text,crc=crc32(data),h=new Uint8Array(30+n.length),v=new DataView(h.buffer);
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,0x21,true);
  v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,n.length,true);h.set(n,30);
  parts.push(h,data);
  const c=new Uint8Array(46+n.length),cv=new DataView(c.buffer);
  cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,0x21,true);
  cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);c.set(n,46);
  central.push(c);centralSize+=c.length;offset+=h.length+data.length;
 }
 const end=new Uint8Array(22),ev=new DataView(end.buffer);
 ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
 return new Blob([...parts,...central,end],{type:'application/epub+zip'});
}
function build(book) {
 const C=g.ReaderCore,E=C.escape,m=C.metadata(book),blocks=C.exportBlocks(book);
 if(!blocks.length)throw Error(L.msg('No_saved_text'));
 const page=(name,body)=>'<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="'+E(m.language)+'" lang="'+E(m.language)+'"><head><title>'+E(name)+'</title><link rel="stylesheet" href="style.css" /></head><body>'+body+'</body></html>';
 const chapters=[];
 for(const b of blocks){
  if(!chapters.length||(b.chapter&&chapters.at(-1).blocks.length))chapters.push({id:chapters.length?'chapter'+chapters.length:'book',blocks:[]});
  chapters.at(-1).blocks.push(b);
 }
 const targets=new Map();
 for(const c of chapters)for(const b of c.blocks)for(const match of b.html.matchAll(/\bid="([^"]+)"/g))targets.set(match[1],c.id+'.xhtml');
 const imageHtml=b=>b.html.replace(/<img src="images\/([^"]+)"[^>]*\/>/g,(tag,k)=>book.assets?.[k]?tag:'<span>['+E(L.msg('imageMissing'))+']</span>').replace(/href="#([^"]+)"/g,(tag,id)=>targets.has(id)?'href="'+targets.get(id)+'#'+id+'"':tag);
 const nav=page(L.msg('contents'),'<nav epub:type="toc" id="toc"><h1>'+E(L.msg('contents'))+'</h1><ol>'+blocks.filter(b=>/^h[1-6]$/.test(b.tag)).map(b=>'<li><a href="'+(targets.get(C.anchor(b.id))||'book.xhtml')+'#'+C.anchor(b.id)+'">'+E(b.text)+'</a></li>').join('')+'</ol></nav>');
 const usedImages=[...new Set(blocks.flatMap(b=>(b.images||[]).map(i=>i.key)))].filter(k=>book.assets?.[k]);
 const cover=book.cover?.base64;
 const coverManifest=cover?'<item id="cover-image" href="cover.png" media-type="image/png" properties="cover-image"/><item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>':'';
 const extra=[['creator',m.author],['publisher',m.publisher],['date',m.year],['description',m.description]].filter(([,value])=>value).map(([key,value])=>'<dc:'+key+'>'+E(value)+'</dc:'+key+'>').join('');
 const opf='<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:'+crypto.randomUUID()+'</dc:identifier><dc:title>'+E(m.title)+'</dc:title><dc:language>'+E(m.language)+'</dc:language>'+extra+(cover?'<meta name="cover" content="cover-image"/>':'')+'<meta property="dcterms:modified">'+new Date().toISOString().replace(/\.\d{3}Z$/,'Z')+'</meta></metadata><manifest>'+coverManifest+chapters.map(c=>'<item id="'+c.id+'" href="'+c.id+'.xhtml" media-type="application/xhtml+xml"/>').join('')+'<item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/><item id="style" href="style.css" media-type="text/css"/>'+usedImages.map((k,i)=>'<item id="image'+i+'" href="images/'+E(k)+'" media-type="image/png"/>').join('')+'</manifest><spine>'+(cover?'<itemref idref="cover-page"/>':'')+chapters.map(c=>'<itemref idref="'+c.id+'"/>').join('')+'</spine>'+(cover?'<guide><reference type="cover" title="Cover" href="cover.xhtml"/></guide>':'')+'</package>';
 const files=[['mimetype','application/epub+zip'],['META-INF/container.xml','<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml" /></rootfiles></container>'],['EPUB/package.opf',opf],['EPUB/nav.xhtml',nav],['EPUB/style.css','img{max-width:100%;height:auto}body{line-height:1.45}p{margin:0 0 .6em}h1,h2{page-break-before:always;break-before:page}h1,h2,h3,h4{page-break-after:avoid;break-after:avoid}blockquote{margin:1em 1.5em}table{border-collapse:collapse}td,th{border:1px solid;padding:.3em}.cover{text-align:center}.cover img{max-height:95vh}']];
 for(const c of chapters)files.push(['EPUB/'+c.id+'.xhtml',page(m.title,c.blocks.map(imageHtml).join('\n'))]);
 const binary=base64=>Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
 if(cover){files.push(['EPUB/cover.png',binary(cover)],['EPUB/cover.xhtml',page(m.title,'<div class="cover" epub:type="cover"><img src="cover.png" alt="'+E(m.title)+'" /></div>')]);}
 for(const k of usedImages)files.push(['EPUB/images/'+k,binary(book.assets[k].base64)]);
 return zip(files);
}
g.ReaderEpub={build};
})(globalThis);
