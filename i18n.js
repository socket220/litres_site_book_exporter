'use strict';
globalThis.L={msg:(key,subs)=>browser.i18n.getMessage(key,subs),localize(){document.documentElement.lang=browser.i18n.getUILanguage();for(const el of document.querySelectorAll('[data-i18n]'))el.textContent=this.msg(el.dataset.i18n);}};
