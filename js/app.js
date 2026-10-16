/* The app object: shared state plus the method groups from the other modules. window.app is what the
   Datastar attributes in index.html and datasets.js talk to. */
import { CONTS } from './constants.js';
import { map } from './map.js';
import { frame } from './frame.js';
import { layers } from './layers.js';
import { labels } from './labels.js';
import { tags } from './tags.js';
import { search } from './search.js';
import { printing } from './print.js';

export const app = window.app = Object.assign({
  map, s: null, data: {}, placeLayers: {}, labelMarkers: {}, capMarkers: [], places: [], words: {}, freeTags: [],
  selected: null, countyLayer: null, countiesLoading: false, frameRect: null, printing: false, saved: null,
  layers: {}, fills: [], vis: new Set(CONTS.map((c) => c[0])), contMarkers: [], oceanMarkers: []
}, frame, layers, labels, tags, search, printing);
