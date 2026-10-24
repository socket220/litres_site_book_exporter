'use strict';
L.localize();
const printButton=document.getElementById('print'),statusElement=document.getElementById('status');
printButton.addEventListener('click',()=>window.print());
(async()=>{
 const id=new URL(location.href).searchParams.get('id');
 if(!/^\d+$/.test(id||''))throw Error(L.msg('Invalid_book_identifier'));
 const key='book:'+id,book=(await browser.storage.local.get(key))[key];
 if(!book)throw Error(L.msg('Capture_some_text_first'));
 document.title=book.title;
 document.getElementById('book').append(ReaderFormats.printable(book,document));
 await Promise.all([...document.querySelectorAll('#book img')].map(img=>img.decode()));
 await document.fonts.ready;
 statusElement.textContent='';printButton.disabled=false;
})().catch(e=>{statusElement.textContent=L.msg('printError')+' '+e.message;});
