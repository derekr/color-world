/* Entry point: build the app, wire the UI, start the data load, then do the first sync and fit. */
import { map } from './map.js';
import { app } from './app.js';
import { loadData } from './data.js';
import { root } from '../vendor/datastar-rocket.js';

import './ui.js';

loadData();

/* the Datastar effect ran before the component built the map: seed the first sync from the current signals */
app.sync(Object.fromEntries(['showCountries','wCountry','showStates','wState','showCounties','wCounty','wNation','names','capitals','tornado','mine','hollow','contNames','oceanNames','grid','equator','cAfrica','cAntarctica','cAsia','cEurope','cNorthAmerica','cOceania','cSouthAmerica','orient','tool'].map((k) => [k, root[k]])));

/* initial frame + fit */
app.layoutFrame(true);
requestAnimationFrame(() => { map.invalidateSize({ animate: false }); app.layoutFrame(true); });
