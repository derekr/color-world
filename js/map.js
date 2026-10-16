import { rocket } from '../vendor/datastar-rocket.js';

/* The map lifecycle belongs to <color-map>: it creates Leaflet in onFirstRender and removes it on disconnect.
   Layer/style state still flows from the Datastar signals through app.sync(). */
let resolveMap;
const mapReady = new Promise((r) => { resolveMap = r; });
rocket('color-map', {
  mode: 'light',
  props: ({ json }) => ({ center: json.default(() => [20, 0]), zoom: json.default(() => 2) }),
  renderOnPropChange: false,
  render: ({ html }) => html`<div id="map" role="application" aria-label="World map" data-ref:container></div>`,
  onFirstRender: ({ refs, props, cleanup }) => {
    const m = L.map(refs.container, {
      zoomControl: false, attributionControl: false, zoomSnap: 0, zoomDelta: 0.5,
      wheelPxPerZoomLevel: 120, minZoom: 1, maxZoom: 12, renderer: L.svg({ padding: 0.5 }),
      worldCopyJump: false, doubleClickZoom: false
    });
    m.setView(props.center, props.zoom);
    cleanup(() => m.remove());
    resolveMap(m);
  }
});
export const map = await mapReady;
