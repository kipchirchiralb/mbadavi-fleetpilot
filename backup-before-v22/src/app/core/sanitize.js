export function installSafeInnerHTML(){
  /* Stored-XSS hardening: every dynamic innerHTML write is passed through a small DOM sanitizer.
     Existing application markup is preserved, while executable elements, inline event handlers,
     dangerous URL schemes and srcdoc are removed before the browser inserts the markup. */
  (function installSafeInnerHTML(){
    const proto=Element.prototype, desc=Object.getOwnPropertyDescriptor(proto,'innerHTML');
    if(!desc || !desc.set || window.__fleetSafeInnerHTMLInstalled) return;
    window.__fleetSafeInnerHTMLInstalled=true;
    const nativeSet=desc.set, nativeGet=desc.get;
    const blockedTags=new Set(['SCRIPT','IFRAME','OBJECT','EMBED','APPLET','BASE','META','LINK']);
    function sanitize(html){
      const tpl=document.createElement('template');
      nativeSet.call(tpl, String(html));
      tpl.content.querySelectorAll('*').forEach(el=>{
        if(blockedTags.has(el.tagName)){el.remove();return;}
        [...el.attributes].forEach(a=>{
          const n=a.name.toLowerCase(), v=a.value.trim().toLowerCase();
          if(n.startsWith('on') || n==='srcdoc' || (['href','src','xlink:href','formaction'].includes(n) && /^(javascript:|vbscript:|data:text\/html)/i.test(v))) el.removeAttribute(a.name);
        });
      });
      return tpl.innerHTML;
    }
    Object.defineProperty(proto,'innerHTML',{get:nativeGet,set:function(value){nativeSet.call(this,sanitize(value));},configurable:desc.configurable,enumerable:desc.enumerable});
  })();
}
