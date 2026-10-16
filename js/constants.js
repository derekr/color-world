/* Fixed numbers and shapes the map uses: colours, bounds, continents, label spots, fit overrides. Needs Leaflet (L) loaded first. */
export const INK = '#1E1B18';
export const US_BOUNDS = L.latLngBounds([24.3, -125.2], [49.6, -66.6]);
export const MAX_BOUNDS = [[-86, -200], [85, 200]];
export const WORLD_BOUNDS = L.latLngBounds([-56, -190], [78, 192]);
export const FULL_BOUNDS = L.latLngBounds([-84, -190], [83, 192]);
export const STATE_Z = 4;
export const CONTS = [['Africa', 'cAfrica'], ['Antarctica', 'cAntarctica'], ['Asia', 'cAsia'], ['Europe', 'cEurope'], ['North America', 'cNorthAmerica'], ['Oceania', 'cOceania'], ['South America', 'cSouthAmerica']];
export const NA = 'North America';
/* rough extents (lat/lng) per continent, used to fit the view to whatever is switched on */
export const CONT_BOUNDS = { Africa: [[-35, -18], [38, 52]], Antarctica: [[-85, -180], [-62, 180]], Asia: [[-11, 26], [56, 146]], Europe: [[35, -25], [78, 192]], 'North America': [[7, -170], [84, -10]], Oceania: [[-48, 110], [0, 192]], 'South America': [[-56, -82], [13, -34]] };
/* fixed spots for the big continent names and the ocean names */
export const CONT_LABELS = [['Africa', 5, 21], ['Antarctica', -80, 0], ['Asia', 46, 95], ['Europe', 56, 24], ['North America', 47, -102], ['Oceania', -25, 134], ['South America', -13, -60]];
export const OCEAN_LABELS = [['North Pacific', 28, -150], ['South Pacific', -30, -125], ['North Atlantic', 32, -42], ['South Atlantic', -22, -18], ['Indian Ocean', -18, 80], ['Southern Ocean', -62, 40], ['Arctic Ocean', 80, 75]];
export const PROV_CONT = { A: 'Asia', E: 'Europe', F: 'Africa', N: NA, O: 'Oceania', S: 'South America', T: 'Antarctica' };
export const FIT = {
  'France': [[41.2, -5.5], [51.2, 9.8]], 'Spain': [[35.9, -9.5], [43.9, 4.5]], 'Portugal': [[36.8, -9.6], [42.2, -6.1]],
  'Norway': [[57.9, 4.5], [71.3, 31.5]], 'Netherlands': [[50.7, 3.2], [53.6, 7.3]], 'Denmark': [[54.5, 8], [57.8, 15.2]],
  'Chile': [[-56, -76], [-17.5, -66]], 'Ecuador': [[-5.1, -81.1], [1.5, -75.2]], 'United States of America': [[24.3, -125.2], [49.6, -66.6]]
};
export const FIT_OPTS = { 'Russia': { minLng: 0 }, 'Fiji': { minLng: 0 } };
export const STAR = '<svg class="cap" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.8 5.8 6.4.9-4.6 4.4 1.1 6.3L12 16.9l-5.7 3 1.1-6.3-4.6-4.4 6.4-.9z" fill="#ffffff" stroke="#1E1B18" stroke-width="2.2" stroke-linejoin="round"/></svg>';
