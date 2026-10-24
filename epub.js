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
 const C=g.ReaderCore,E=C.escape,report=C.report(book);
 const blocks=Object.values(book.blocks).sort((a,b)=>C.compare(a.id,b.id));
 if(!blocks.length)throw Error('Нет сохранённого текста.');
 const hasGaps=report.missing.length>0||report.missingImages.length>0,title=book.title+(hasGaps?' — неполный сбор':' — полнота не проверена');
 const split=book.title.indexOf(' - '),author=split>0?book.title.slice(0,split):'';
 const warnings=['Сборщик EPUB 0.3.0.', 'Изображений встроено: '+report.imagesSaved+' из '+report.imageCount+'.','Это экспорт собранных фрагментов. Полнота книги не подтверждена.','Собрано блоков: '+report.count+'.','Заголовков оглавления без собранного текста: '+report.missing.length+'.','Конфликтов содержимого: '+report.conflicts+'.',...report.issues];
 const page=(name,body)=>'<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ru" lang="ru"><head><title>'+E(name)+'</title><link rel="stylesheet" href="style.css" /></head><body>'+body+'</body></html>';
 const heads=blocks.filter(b=>/^h[1-6]$/.test(b.tag));
 const nav=page('Оглавление','<nav epub:type="toc" id="toc"><h1>Оглавление собранных разделов</h1><ol><li><a href="notice.xhtml">Сведения об экспорте</a></li>'+heads.map(b=>'<li><a href="book.xhtml#'+C.anchor(b.id)+'">'+E(b.text)+'</a></li>').join('')+'</ol></nav>');
 const usedImages=[...new Set(blocks.flatMap(b=>(b.images||[]).map(i=>i.key)))].filter(k=>book.assets?.[k]);
 const imageManifest=usedImages.map((k,i)=>'<item id="image'+i+'" href="images/'+E(k)+'" media-type="image/png"/>').join('');
 const imageHtml=b=>b.html.replace(/<img src="images\/([^"]+)"[^>]*\/>/g,(tag,k)=>book.assets?.[k]?tag:'<span>[Изображение не загружено]</span>');
 const files=[
 ['mimetype','application/epub+zip'],
 ['META-INF/container.xml','<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml" /></rootfiles></container>'],
 ['EPUB/package.opf','<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:'+crypto.randomUUID()+'</dc:identifier><dc:title>'+E(title)+'</dc:title><dc:language>ru</dc:language>'+(author?'<dc:creator>'+E(author)+'</dc:creator>':'')+'<meta property="dcterms:modified">'+new Date().toISOString().replace(/\.\d{3}Z$/,'Z')+'</meta></metadata><manifest><item id="notice" href="notice.xhtml" media-type="application/xhtml+xml"/><item id="book" href="book.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/><item id="style" href="style.css" media-type="text/css"/>'+imageManifest+'</manifest><spine><itemref idref="notice"/><itemref idref="book"/></spine></package>'],
 ['EPUB/notice.xhtml',page('Сведения об экспорте','<h1>Сведения об экспорте</h1>'+warnings.map(w=>'<p>'+E(w)+'</p>').join('')+(hasGaps?'<h2>Не собраны заголовки</h2><ul>'+report.missing.map(t=>'<li>'+E(t)+'</li>').join('')+'</ul>':''))],
 ['EPUB/book.xhtml',page(book.title,blocks.map(imageHtml).join('\n'))],
 ['EPUB/nav.xhtml',nav],
 ['EPUB/style.css','img{max-width:100%;height:auto}body{line-height:1.45}p{margin:0 0 .6em}h1,h2{break-before:page}h1,h2,h3,h4{break-after:avoid}blockquote{margin:1em 1.5em}table{border-collapse:collapse}td,th{border:1px solid;padding:.3em}']
 ];
 for(const k of usedImages)files.push(['EPUB/images/'+k,Uint8Array.from(atob(book.assets[k].base64),c=>c.charCodeAt(0))]);
 return zip(files);
}
g.ReaderEpub={build};
})(globalThis);
