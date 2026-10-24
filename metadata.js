'use strict';
L.localize();
const $=id=>document.getElementById(id);
const id=new URL(location.href).searchParams.get('id');
const fields={title:'metaTitle',author:'metaAuthor',language:'metaLanguage',publisher:'metaPublisher',year:'metaYear',description:'metaDescription'};
let cover=null;
async function send(message){const r=await browser.runtime.sendMessage({...message,id});if(!r.ok)throw Error(r.error);return r;}
function showCover(){
 $('coverPreview').hidden=!cover;
 if(cover){$('coverPreview').src='data:image/png;base64,'+cover.base64;$('coverPreview').alt=$('metaTitle').value;}
 else $('coverPreview').removeAttribute('src');
 $('coverStatus').textContent=cover?L.msg('coverSaved')+(cover.filename?' — '+cover.filename:''):L.msg('noCover');
}
async function busy(action){
 $('metadataPanel').disabled=true;$('error').textContent='';
 try{await action();}catch(e){$('error').textContent=e.message;showCover();}
 finally{$('metadataPanel').disabled=false;}
}
$('saveMetadata').addEventListener('click',()=>busy(async()=>{
 const metadata=Object.fromEntries(Object.entries(fields).map(([key,field])=>[key,$(field).value.trim()]));
 await send({type:'METADATA_SAVE',metadata});$('metadataStatus').textContent=L.msg('metadataSaved');
}));
$('removeCover').addEventListener('click',()=>busy(async()=>{
 await send({type:'COVER_SAVE',cover:null});cover=null;$('coverFile').value='';showCover();
}));
$('chooseCover').addEventListener('click',()=>$('coverFile').click());
$('coverFile').addEventListener('change',()=>{
 const file=$('coverFile').files[0];if(!file)return;
 void busy(async()=>{
  $('coverStatus').textContent=L.msg('savingCover');
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10000000)throw Error(L.msg('invalidCover'));
  const bitmap=await createImageBitmap(file);let next;
  try{
   if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>24000000)throw Error(L.msg('invalidCover'));
   const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
   next={mime:'image/png',base64:canvas.toDataURL('image/png').split(',')[1],filename:file.name};
  }finally{bitmap.close();}
  await send({type:'COVER_SAVE',cover:next});cover=next;$('coverFile').value='';showCover();
 });
});
(async()=>{
 if(!/^\d+$/.test(id||''))throw Error(L.msg('Invalid_book_identifier'));
 const r=await send({type:'METADATA_GET'});
 for(const [key,field] of Object.entries(fields))$(field).value=r.metadata[key]||'';
 cover=r.cover||null;showCover();$('saveMetadata').disabled=false;$('metadataPanel').disabled=false;
})().catch(e=>{$('error').textContent=e.message;});
