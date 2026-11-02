# Close the window and reopen: is the imported + edited data still there? (real IndexedDB, same browser profile)
import subprocess, time, os, tempfile
from playwright.sync_api import sync_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
h=open(ROOT+'/index.html').read().replace('<script type="module" src="/src/main.js"></script>','<script type="module" src="/test/harness-persist.js"></script>')
open(ROOT+'/test/harness-persist.html','w').write(h)
srv=subprocess.Popen(['python3','-m','http.server','8795','--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
prof=tempfile.mkdtemp(); URL='http://localhost:8795/test/harness-persist.html'
errs=[]
def launch(p): 
    c=p.chromium.launch_persistent_context(prof, headless=True, viewport={'width':1400,'height':1200}); pg=c.pages[0] if c.pages else c.new_page()
    pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None); pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e))); pg.on('dialog',lambda d: d.accept('1234'))
    pg.add_init_script("new MutationObserver(()=>{const i=document.getElementById('askInput');if(i&&!i.dataset.d){i.dataset.d=1;i.value='1234';document.getElementById('askOk').click();}}).observe(document,{childList:true,subtree:true});")
    return c,pg
try:
  with sync_playwright() as p:
    c,pg=launch(p); pg.goto(URL); pg.wait_for_timeout(1500)
    pg.click('#btnFileMenu'); pg.click('#btnImport')
    pg.set_input_files('input[type=file][style*="display: none"]',{'name':'P.xlsx','mimeType':'application/octet-stream','buffer':b'x'})
    pg.wait_for_selector('#importOverlay.show',timeout=20000); pg.wait_for_timeout(1500)
    pg.check('#impOk'); pg.click('#impGo'); pg.wait_for_timeout(2500)
    pg.click('.nav button[data-panel="drivers"]'); pg.wait_for_timeout(400)
    pg.fill('#d_name','PERSIST TEST DRIVER'); pg.click('#btnAddDriver'); pg.wait_for_timeout(1500)
    n1=pg.evaluate("document.querySelectorAll('#driverTable tbody tr').length"); print('drivers before close:',n1)
    print('status text:', pg.inner_text('#fmStatus')[:120] if pg.locator('#fmStatus').count() else '(no #fmStatus)')
    c.close()
    c,pg=launch(p); pg.goto(URL); pg.wait_for_timeout(2500)
    pg.click('.nav button[data-panel="drivers"]'); pg.wait_for_timeout(400)
    n2=pg.evaluate("document.querySelectorAll('#driverTable tbody tr').length")
    print('drivers after reopen:',n2, '| has test driver:', 'PERSIST TEST DRIVER' in pg.inner_text('#driverTable'))
    print('vehicles after reopen:', pg.evaluate("document.querySelectorAll('#vehicleTable tbody tr').length"))
    c.close()
  print('errors:',errs[:4])
finally:
  srv.terminate(); os.remove(ROOT+'/test/harness-persist.html')
