# run (after a vite build into $DIST):  python3 test/browser-db.py $DIST
import sys, os, json, subprocess, tempfile, time, threading, http.server, functools
from playwright.sync_api import sync_playwright
DIST = sys.argv[1]; ROOT = tempfile.mkdtemp(prefix='fpdb-'); fails = 0
def ok(n, c):
    global fails; print(('PASS ' if c else 'FAIL ') + n); fails += (0 if c else 1)
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8791), functools.partial(http.server.SimpleHTTPRequestHandler, directory=DIST)); srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
rpc = subprocess.Popen(['node', os.path.join(os.path.dirname(__file__), 'dbrpc.mjs'), ROOT, '8792'], stdout=subprocess.PIPE); rpc.stdout.readline()
BRIDGE = """
(() => { const call = (fn, args) => { const x = new XMLHttpRequest(); x.open('POST', 'http://127.0.0.1:8792/rpc', false); x.send(JSON.stringify({ fn, args })); return JSON.parse(x.responseText); };
  const wrap = fn => (...a) => Promise.resolve(call(fn, a)); let flush = null;
  window.fleetDesktop = { dbSettings: wrap('dbSettings'), dbSetSettings: wrap('dbSetSettings'), dbLoad: wrap('dbLoad'), dbSave: wrap('dbSave'), dbCreate: wrap('dbCreate'), dbCopies: wrap('dbCopies'), dbReadCopy: wrap('dbReadCopy'), dbShowFolder: wrap('dbShowFolder'),
    dbSaveSync: (n, d) => call('dbSaveSync', [n, d]), onFlush: cb => { flush = cb; window.__flush = cb; } }; })();
"""
SEED = """
(() => { if(localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1');
  const d = { vehicles: [{ id: 1, reg: 'KAA 111A', make: '', model: '', year: '', rate: 5000, owner: '', status: 'Available' }, { id: 2, reg: 'KBB 222B', make: '', model: '', year: '', rate: 6000, owner: '', status: 'Available' }], drivers: [], clients: [], bookings: [], rentals: [], expenses: [], payments: [], settings: { adminPin: null, chartType: 'pie' }, nextId: 3 };
  const text = JSON.stringify(d); let h = 0x811c9dc5; for(let i = 0; i < text.length; i++){ h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  localStorage.setItem('fleetpilot.mirror.v1', JSON.stringify({ savedAt: '2026-10-20T10:00:00.000Z', data: text, check: h.toString(16) + ':' + text.length, records: 2 })); })();
"""
dbfile = lambda: os.path.join(ROOT, 'databases', 'Main.fpdb.json')
with sync_playwright() as p:
    b = p.chromium.launch()
    def page(seed):
        ctx = b.new_context(); ctx.add_init_script(BRIDGE)
        if seed: ctx.add_init_script(SEED)
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.goto('http://127.0.0.1:8791/index.html'); pg.wait_for_function("!document.body.classList.contains('fp-loading')", timeout=20000); pg.wait_for_timeout(600); return ctx, pg, errs
    # 1. first start after the update: the old browser storage moves into the file once
    c1, pg, errs = page(True)
    ok('first start: the file exists, made from the old browser storage', os.path.exists(dbfile()) and len(json.load(open(dbfile()))['data']['vehicles']) == 2)
    ok('first start: settings remember the database and that the move is done', json.load(open(os.path.join(ROOT, 'settings.json'))) == {'startWith': 'last', 'lastUsed': 'Main', 'migrated': True})
    ok('first start: this month has its safety copy', any('monthly' in n for n in os.listdir(os.path.join(ROOT, 'copies'))))
    ok('no red/amber Excel message in the status line', 'Excel' not in pg.inner_text('#fileStatus') and 'saved' in pg.inner_text('#fileStatus'))
    ok('Today section is drawn with its four boxes', pg.locator('#todayBoxes > div').count() == 4)
    # 2. add a record: it is in the file within about a second, no 30-second wait
    pg.click('.nav button[data-panel="vehicles"]'); pg.fill('#v_reg', 'KCC 333C'); pg.fill('#v_rate', '7000'); pg.click('#btnAddVehicle'); pg.wait_for_timeout(1500)
    ok('a new record is in the database file about a second later', any(v['reg'] == 'KCC 333C' for v in json.load(open(dbfile()))['data']['vehicles']))
    ok('no page errors so far', not errs)
    c1.close()
    # 3. close and reopen (fresh browser storage, plus a STALE seed that must be ignored now)
    c2, pg2, errs2 = page(True)
    pg2.click('.nav button[data-panel="vehicles"]'); pg2.wait_for_timeout(300)
    regs = pg2.locator('#vehicleTable tbody tr').all_inner_texts()
    ok('reopened: the added car is there (the file wins over stale browser storage)', any('KCC 333C' in r for r in regs) and len(regs) == 3)
    ok('reopened: no page errors', not errs2)
    # 4. closing: a change made just before closing is written
    pg2.fill('#v_reg', 'KDD 444D'); pg2.fill('#v_rate', '1'); pg2.click('#btnAddVehicle'); pg2.evaluate('window.__flush && window.__flush()'); pg2.wait_for_timeout(200)
    ok('closing writes the pending change', any(v['reg'] == 'KDD 444D' for v in json.load(open(dbfile()))['data']['vehicles']))
    c2.close()
    # 5. a file from a newer format is refused and left alone
    d = json.load(open(dbfile())); d['formatVersion'] = 9; open(dbfile(), 'w').write(json.dumps(d)); before = open(dbfile()).read()
    c3, pg3, errs3 = page(False)
    ok('a newer file: the app says so plainly', 'newer version of FleetPilot' in pg3.inner_text('#dbBlocked'))
    pg3.wait_for_timeout(1200); ok('and never writes to it', open(dbfile()).read() == before)
    c3.close(); b.close()
rpc.kill(); srv.shutdown(); print(f'{fails} FAILED' if fails else 'browser db tests passed'); sys.exit(1 if fails else 0)
