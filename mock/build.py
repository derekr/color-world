"""Builds datasets.html (the custom-datasets mockup) from index.html plus mock/datasets.{css,js}."""
s = open('index.html').read()
css = open('mock/datasets.css').read()
js = open('mock/datasets.js').read()
def rep(old, new, count=1):
    global s
    assert s.count(old) >= 1, old[:80]
    s = s.replace(old, new, count)

rep('</style>', css + '</style>')
rep('<title>Coloring Map</title>', '<title>Coloring Map Datasets</title>')
# third features page: My data
rep('<button data-fast class="pill" data-attr:aria-pressed="($featPage == 1) ? \'true\' : \'false\'" data-on:click="$featPage = 1">Map</button>',
    '<button data-fast class="pill" data-attr:aria-pressed="($featPage == 1) ? \'true\' : \'false\'" data-on:click="$featPage = 1">Map</button>\n          <button data-fast class="pill" data-attr:aria-pressed="($featPage == 2) ? \'true\' : \'false\'" data-on:click="$featPage = 2">My data</button>')
rep('data-attr:disabled="$featPage == 0" data-on:click="$featPage = 0"', 'data-attr:disabled="$featPage == 0" data-on:click="$featPage = Math.max(0, $featPage - 1)"')
rep('data-attr:disabled="$featPage == 1" data-on:click="$featPage = 1"', 'data-attr:disabled="$featPage == 2" data-on:click="$featPage = Math.min(2, $featPage + 1)"')
rep('<span data-text="($featPage == 0) ? \'Words\' : \'Map\'">', '<span data-text="[\'Words\', \'Map\', \'My data\'][$featPage]">')
rep('<button data-fast class="dotb" aria-label="Map" data-attr:aria-pressed="($featPage == 1) ? \'true\' : \'false\'" data-on:click="$featPage = 1"><i></i></button>',
    '<button data-fast class="dotb" aria-label="Map" data-attr:aria-pressed="($featPage == 1) ? \'true\' : \'false\'" data-on:click="$featPage = 1"><i></i></button>\n          <button data-fast class="dotb" aria-label="My data" data-attr:aria-pressed="($featPage == 2) ? \'true\' : \'false\'" data-on:click="$featPage = 2"><i></i></button>')
rep('Math.min(1, root.featPage + d)', 'Math.min(2, root.featPage + d)')
ADD_IC = '<svg class="ic" viewBox="0 0 48 48" aria-hidden="true"><g fill="none" stroke="#1E1B18" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6h17l9 9v27H12z" fill="#fff"/><path d="M29 6v9h9"/><path d="M25 22v13M18.5 28.5h13" stroke-width="3.2"/></g></svg>'
MY = ('\n            <div class="page" role="group" aria-label="My data" id="myData">'
      '<button class="tile add" data-on:click="$featView = \'add\'">' + ADD_IC + '<span class="tn">Add data</span></button>'
      '<p class="my-empty">Drop a GeoJSON file on the map, or tap Add data.</p></div>')
rep('            </div>\n          </div>\n        </div>\n        <div class="dots"', '            </div>' + MY + '\n          </div>\n        </div>\n        <div class="dots"')
SUB = '''      <div class="fv-pane fv-sub" data-view="add" data-class:on="$featView == 'add'" data-attr:inert="$featView != 'add'">
        <div class="sub-head"><button data-fast class="btn arw" aria-label="Back" data-on:click="$featView = ''"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E1B18" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button><span>Add data</span></div>
        <button type="button" class="btn pickbtn" id="dsPick">Choose a file</button>
        <input type="file" id="dsFile" accept=".geojson,.json,.topojson,.csv,.tsv,.txt" multiple hidden>
        <p class="sub-note">GeoJSON, TopoJSON, or a CSV with latitude and longitude. Or drop a file on the map.</p>
        <div class="sub-h">Or try one</div>
        <div class="samples" id="dsSamples"></div>
      </div>
'''
rep('    </div>\n  </section>\n </div>\n</aside>', SUB + '    </div>\n  </section>\n </div>\n</aside>')
DROP = '''  <div class="drop" id="dropZone" aria-hidden="true"><div class="drop-in">
    <svg width="64" height="64" viewBox="0 0 48 48"><g fill="none" stroke="#1E1B18" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6h17l9 9v27H12z" fill="#FFC93C"/><path d="M29 6v9h9"/><path d="M25 21v14M19 29l6 6 6-6" stroke-width="3"/></g></svg>
    <b>Drop it on the map!</b><span>We'll draw your places, lines and areas in coloring-page style.</span></div></div>
  <div class="ds" id="dsSheet" role="dialog" aria-label="Your data"></div>

'''
rep('  <div class="tools" role="group"', DROP + '  <div class="tools" role="group"')
rep('</body>', '<script type="module">\n' + js + '</script>\n</body>')
open('datasets.html', 'w').write(s)
print('ok', len(s))
