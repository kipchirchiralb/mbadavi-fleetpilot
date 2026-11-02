import subprocess, time, os
from playwright.sync_api import sync_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
h=open(ROOT+'/index.html').read().replace('<script type="module" src="/src/main.js"></script>','<script type="module" src="/test/harness-persist.js"></script>')
open(ROOT+'/test/harness-persist.html','w').write(h)
srv=subprocess.Popen(['python3','-m','http.server','8796','--directory',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); 
    pg=b.new_page(); pg.goto('http://localhost:8796/test/harness-persist.html'); pg.wait_for_timeout(1500)
    print('fresh profile banner:', pg.inner_text('#storageBanner')[:90] if pg.locator('#storageBanner').count() else 'NONE')
    pg2=b.new_page(); pg2.add_init_script("Object.defineProperty(window,'indexedDB',{value:undefined});"); pg2.goto('http://localhost:8796/test/harness-persist.html'); pg2.wait_for_timeout(1500)
    print('storage blocked banner:', pg2.inner_text('#storageBanner')[:90] if pg2.locator('#storageBanner').count() else 'NONE')
finally:
  srv.terminate(); os.remove(ROOT+'/test/harness-persist.html')
