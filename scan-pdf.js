(function(g){
'use strict';
const encoder=new TextEncoder();
function validPage(p){return Number.isInteger(p.number)&&p.number>0&&p.number<=100000&&Number.isInteger(p.width)&&Number.isInteger(p.height)&&p.width>0&&p.height>0&&p.width*p.height<=32000000;}
// RGB Flate streams preserve rendered pixels without another lossy JPEG conversion.
async function build(pages,read,title=''){
 if(!pages.length)throw Error('No PDF pages captured.');
 const parts=[],offsets=[0];let position=0;
 const add=data=>{const bytes=typeof data==='string'?encoder.encode(data):data;parts.push(bytes);position+=bytes.length;};
 const object=(id,body,stream)=>{offsets[id]=position;add(id+' 0 obj\n'+body);if(stream){add('\nstream\n');add(stream);add('\nendstream');}add('\nendobj\n');};
 add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
 object(1,'<< /Type /Catalog /Pages 2 0 R >>');
 object(2,'<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
 for(let i=0;i<pages.length;i++){
  const p=await read(pages[i].number);if(!p||!validPage(p)||!(p.bytes instanceof Uint8Array))throw Error('Invalid stored PDF page.');
  const id=3+i*3,w=Number((p.width*0.75).toFixed(3)),h=Number((p.height*0.75).toFixed(3));
  object(id,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+w+' '+h+'] /Resources << /XObject << /PageImage '+(id+1)+' 0 R >> >> /Contents '+(id+2)+' 0 R >>');
  object(id+1,'<< /Type /XObject /Subtype /Image /Width '+p.width+' /Height '+p.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length '+p.bytes.length+' >>',p.bytes);
  const commands=encoder.encode('q\n'+w+' 0 0 '+h+' 0 0 cm\n/PageImage Do\nQ\n');
  object(id+2,'<< /Length '+commands.length+' >>',commands);
 }
 const info=3+pages.length*3;
 const utf16='FEFF'+Array.from(String(title).slice(0,1000)).map(ch=>{let out='';for(let i=0;i<ch.length;i++)out+=ch.charCodeAt(i).toString(16).padStart(4,'0');return out;}).join('');
 object(info,'<< /Title <'+utf16+'> /Producer (litres book exporter) >>');
 const start=position;add('xref\n0 '+(info+1)+'\n0000000000 65535 f \n');
 for(let i=1;i<=info;i++)add(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
 add('trailer\n<< /Size '+(info+1)+' /Root 1 0 R /Info '+info+' 0 R >>\nstartxref\n'+start+'\n%%EOF\n');
 return new Blob(parts,{type:'application/pdf'});
}
g.ScanPdf={build,validPage};
})(globalThis);
