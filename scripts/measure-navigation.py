import json, pathlib, subprocess, time, argparse, re, xml.etree.ElementTree as ET
p=argparse.ArgumentParser();p.add_argument('--label',required=True);p.add_argument('--device',default='6x4hs4uktgamv8ba');p.add_argument('--playlist',default='2');p.add_argument('--validate-routes',action='store_true');p.add_argument('--dwell',type=float,default=3.0);args=p.parse_args()
adb=r'C:\Android\Sdk\platform-tools\adb.exe';root=pathlib.Path('.cache/performance');root.mkdir(parents=True,exist_ok=True)
def run(*cmd):
 return subprocess.run([adb,'-s',args.device,*cmd],capture_output=True,text=True,timeout=15).stdout
routes=['','library','playlist/'+args.playlist,'player','queue','collection/favorites','friends']
def validate_route(route):
 # Navigation must be verified before using automated rounds as evidence.
 run('shell','uiautomator','dump','/sdcard/waveplay-performance.xml')
 raw=run('shell','cat','/sdcard/waveplay-performance.xml')
 try:
  nodes=list(ET.fromstring(raw).iter('node'))
 except ET.ParseError:
  return False
 expected={'':'Inicio','library':'Biblioteca','player':'Reproductor','queue':'Cerrar cola',
           'collection/favorites':'Favoritas','friends':'Cola compartida'}
 marker='Ajustes de playlist' if route.startswith('playlist/') else expected[route]
 for node in nodes:
  text=node.get('text') or node.get('content-desc') or ''
  bounds=[int(value) for value in re.findall(r'\d+',node.get('bounds',''))]
  if (text==marker or (marker=='Cola compartida' and text.startswith(marker))):
   if route in ('','library') and len(bounds)==4 and bounds[1]>700:continue
   return True
 return False

if args.validate_routes:
 for route in routes:
  run('shell','am','start','-W','-a','android.intent.action.VIEW','-d','waveplay:///'+route,'com.waveplay.app')
  time.sleep(args.dwell)
  if not validate_route(route):
   raise SystemExit('Route preflight failed: '+(route or 'home')+'. No benchmark recorded.')
 print('All route identities verified; preflight excluded from gfxinfo.')
run('shell','dumpsys','gfxinfo','com.waveplay.app','reset')
for attempt in range(5):
 for route in routes:
  uri='waveplay:///'+route
  run('shell','am','start','-W','-a','android.intent.action.VIEW','-d',uri,'com.waveplay.app')
  time.sleep(args.dwell)
(root/(args.label+'-gfxinfo.txt')).write_text(run('shell','dumpsys','gfxinfo','com.waveplay.app'),encoding='utf-8')
(root/(args.label+'-memory.txt')).write_text(run('shell','dumpsys','meminfo','com.waveplay.app'),encoding='utf-8')
(root/(args.label+'-protocol.json')).write_text(json.dumps({'device':args.device,'routes':routes,'rounds':5,'dwellSeconds':args.dwell,'preflightValidated':args.validate_routes,'limitations':['Deep-link dwell does not measure input-to-frame latency','Scroll needs real gestures','Compare only identical playback, library and build modes']},indent=2),encoding='utf-8')
print('Saved '+args.label+'; five deep-link rounds. Scroll and playback need separate verification.')
