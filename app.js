// ── Firebase setup ───────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDTZsK4MbpdJ_VkfaVp6goeHVuABHKJicM",
  authDomain: "colorado-hikes.firebaseapp.com",
  databaseURL: "https://colorado-hikes-default-rtdb.firebaseio.com",
  projectId: "colorado-hikes",
  storageBucket: "colorado-hikes.firebasestorage.app",
  messagingSenderId: "176919509057",
  appId: "1:176919509057:web:666eb605e2dd6663816ec0"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Firebase keys can't contain . # $ [ ] /  — sanitize trail names used as keys
function fbKey(str) {
  return str.replace(/[.#$[\]/]/g, '_');
}

// ── State ─────────────────────────────────────────────────────────────────────
let allHikes = [];
let activeFilter = 'all';
let searchQuery = '';
let personStatus = {};   // { trailName: { leah: '', mac: '', robin: '' } }
let customHikes  = {};   // { region: [ {...hike} ] }
let trailUrls    = {};   // { fbKey(name): 'url' }  — user-edited URL overrides
let hikeNotes    = {};   // { fbKey(name): { notes: '', tips: '', parking: '' } }

// ── Firebase read/write ───────────────────────────────────────────────────────
async function loadFromFirebase() {
  const snap = await db.ref('/').once('value');
  const data = snap.val() || {};
  personStatus = data.personStatus || {};
  customHikes  = data.customHikes  || {};
  trailUrls    = data.trailUrls    || {};
  hikeNotes    = data.hikeNotes    || {};
}

function savePersonStatus() {
  db.ref('personStatus').set(personStatus).catch(console.error);
}

function saveCustomHikes() {
  db.ref('customHikes').set(customHikes).catch(console.error);
}

function saveTrailUrls() {
  db.ref('trailUrls').set(trailUrls).catch(console.error);
}

function saveHikeNotes() {
  db.ref('hikeNotes').set(hikeNotes).catch(console.error);
}

// Real-time listener: when another user makes a change, update locally
db.ref('/').on('value', snap => {
  const data = snap.val() || {};
  const newPS = data.personStatus || {};
  const newCH = data.customHikes  || {};
  const newTU = data.trailUrls    || {};
  const newHN = data.hikeNotes    || {};

  // Update person status buttons in-place (no full re-render needed)
  // newPS keys are fbKeys (safe Firebase keys)
  for (const [key, statuses] of Object.entries(newPS)) {
    for (const person of ['leah', 'mac', 'robin']) {
      const newVal = statuses[person] || '';
      const curVal = personStatus[key]?.[person] || '';
      if (curVal !== newVal) {
        if (!personStatus[key]) personStatus[key] = {};
        personStatus[key][person] = newVal;
        const btn = document.querySelector(
          `[data-fbkey="${CSS.escape(key)}"][data-person="${person}"]`
        );
        if (btn) applyPersonBtn(btn, newVal);
      }
    }
  }

  // If trail URLs changed, update links in-place
  if (JSON.stringify(newTU) !== JSON.stringify(trailUrls)) {
    trailUrls = newTU;
    // re-render is simplest here since URLs affect link href
    allHikes = buildHikeList();
    applyFilters();
  }

  // If hike notes changed, update note fields in-place
  if (JSON.stringify(newHN) !== JSON.stringify(hikeNotes)) {
    hikeNotes = newHN;
    for (const [key, noteObj] of Object.entries(newHN)) {
      for (const field of ['notes', 'tips', 'parking']) {
        const el = document.getElementById(`log-${field}-${key}`);
        if (el && document.activeElement !== el) el.value = noteObj[field] || '';
      }
    }
  }

  // If custom hikes changed, re-render
  if (JSON.stringify(newCH) !== JSON.stringify(customHikes)) {
    customHikes = newCH;
    allHikes = buildHikeList();
    applyFilters();
  }
});

// ── Person status helpers ─────────────────────────────────────────────────────
// personStatus is keyed by fbKey(name) to avoid Firebase errors with / . # $ [ ]
function getPersonStatus(name, person) {
  return personStatus[fbKey(name)]?.[person] || '';
}

function cycleStatus(name, person) {
  const key  = fbKey(name);
  const cur  = personStatus[key]?.[person] || '';
  const next = cur === '' ? 'done' : cur === 'done' ? 'want' : '';
  if (!personStatus[key]) personStatus[key] = {};
  personStatus[key][person] = next;
  savePersonStatus();

  const btn = document.querySelector(
    `[data-fbkey="${CSS.escape(key)}"][data-person="${person}"]`
  );
  if (btn) applyPersonBtn(btn, next);
}

function applyPersonBtn(btn, status) {
  btn.className = 'person-btn' +
    (status === 'done' ? ' ps-done' : status === 'want' ? ' ps-want' : '');
  btn.textContent = status === 'done' ? '✓ Done' : status === 'want' ? '★ Want' : '—';
}

// ── Custom hike helpers ───────────────────────────────────────────────────────
function addCustomHike(region, name, distMi, elevFt, status, url) {
  if (!customHikes[region]) customHikes[region] = [];
  customHikes[region].push({
    region, name,
    distance_miles: distMi || null,
    elevation_ft:   elevFt || null,
    status:         status || 'want',
    alltrails_url:  url || '',
    custom: true,
  });
  saveCustomHikes();
  allHikes = buildHikeList();
  applyFilters();
}

function deleteCustomHike(region, name) {
  if (!customHikes[region]) return;
  customHikes[region] = customHikes[region].filter(h => h.name !== name);
  saveCustomHikes();
  allHikes = buildHikeList();
  applyFilters();
}

// ── Hike data ─────────────────────────────────────────────────────────────────
const HIKES_DATA = [{"region": "James Peak Wilderness", "name": "Heart Lake via South Boulder Creek", "status": "want", "distance_miles": 9, "elevation_ft": 2194, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/heart-lake-via-south-boulder-creek-trail"}, {"region": "James Peak Wilderness", "name": "James Peak", "status": "want", "distance_miles": 8.2, "elevation_ft": 2952, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/james-peak-trail"}, {"region": "James Peak Wilderness", "name": "Upper Forest Lakes", "status": "want", "distance_miles": 8, "elevation_ft": 1811, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/upper-forest-lakes-trail"}, {"region": "James Peak Wilderness", "name": "Crater Lakes via South Boulder Creek", "status": "done", "distance_miles": 7.1, "elevation_ft": 1870, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/crater-lakes-via-south-boulder-creek-and-crater-lakes-trail"}, {"region": "James Peak Wilderness", "name": "St Mary's Glacier", "status": "done", "distance_miles": 1.7, "elevation_ft": 508, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/st-mary-s-glacier"}, {"region": "Eagles Nest Wilderness", "name": "Willow Lakes", "status": "want", "distance_miles": 12.2, "elevation_ft": 2762, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/willow-lakes-via-gore-range-trail"}, {"region": "Eagles Nest Wilderness", "name": "Pitkin Lake", "status": "want", "distance_miles": 9.9, "elevation_ft": 2982, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/pitkin-lake-trail"}, {"region": "Eagles Nest Wilderness", "name": "Gore Lake", "status": "want", "distance_miles": 12.9, "elevation_ft": 2900, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/gore-lake"}, {"region": "Eagles Nest Wilderness", "name": "Upper Cataract Lake", "status": "done", "distance_miles": 12.5, "elevation_ft": 2490, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/upper-cataract-lake-trail"}, {"region": "Eagles Nest Wilderness", "name": "Booth Lake", "status": "done", "distance_miles": 9.3, "elevation_ft": 3067, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/booth-lake--2"}, {"region": "Eagles Nest Wilderness", "name": "Wheeler Lakes", "status": "done", "distance_miles": 6.6, "elevation_ft": 1263, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/wheeler-lake"}, {"region": "Eagles Nest Wilderness", "name": "Upper Piney River Falls", "status": "done", "distance_miles": 5.9, "elevation_ft": 692, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/upper-piney-river-falls-trail"}, {"region": "Eagles Nest Wilderness", "name": "Deluge Lake", "status": "done", "distance_miles": 8.6, "elevation_ft": 3398, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/deluge-lake-trail"}, {"region": "Eagles Nest Wilderness", "name": "Booth Falls", "status": "done", "distance_miles": 4, "elevation_ft": 1325, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/booth-falls-trail"}, {"region": "Eagles Nest Wilderness", "name": "Shrine Ridge", "status": "done", "distance_miles": 4.6, "elevation_ft": 1043, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/shrine-ridge-trail"}, {"region": "Indian Peaks Wilderness", "name": "Crater Lake + Mirror Lake / Lone Eagle Peak", "status": "want", "distance_miles": 17.4, "elevation_ft": 4767, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/crater-lake-and-lone-eagle-from-long-lake-trailhead"}, {"region": "Indian Peaks Wilderness", "name": "Pawnee and Buchanan Loop", "status": "planned", "distance_miles": 1.6, "elevation_ft": 88, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/buchanan-park-loop"}, {"region": "Indian Peaks Wilderness", "name": "Caribou Lake via Arapaho Pass", "status": "planned", "distance_miles": 9.1, "elevation_ft": 2608, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/caribou-lake-via-arapaho-pass-trail"}, {"region": "Indian Peaks Wilderness", "name": "King Lake", "status": "done", "distance_miles": 11.8, "elevation_ft": 2509, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/king-lake-trail"}, {"region": "Indian Peaks Wilderness", "name": "Jasper Lake", "status": "done", "distance_miles": 9.8, "elevation_ft": 1942, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/jasper-lake-trail"}, {"region": "Indian Peaks Wilderness", "name": "Devils Thumb Lake", "status": "done", "distance_miles": 15.5, "elevation_ft": 3438, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/devils-thumb-pass-and-king-lake-trail"}, {"region": "Indian Peaks Wilderness", "name": "Mt Audubon", "status": "done", "distance_miles": 7.8, "elevation_ft": 2680, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mt-audubon-trail"}, {"region": "Indian Peaks Wilderness", "name": "Monarch Lake Loop", "status": "done", "distance_miles": 4.1, "elevation_ft": 216, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/monarch-lake-loop-trail"}, {"region": "Indian Peaks Wilderness", "name": "Woodland Trail to Skyscraper Reservoir", "status": "done", "distance_miles": 10.7, "elevation_ft": 2273, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/woodland-trail-to-skyscraper-reservoir"}, {"region": "Indian Peaks Wilderness", "name": "Lost Lake", "status": "done", "distance_miles": 4.2, "elevation_ft": 833, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/lost-lake-via-hessie-trail"}, {"region": "Indian Peaks Wilderness", "name": "Diamond Lake", "status": "done", "distance_miles": 5.5, "elevation_ft": 1217, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/diamond-lake-trail"}, {"region": "Indian Peaks Wilderness", "name": "Lake Dorothy via Arapaho Pass", "status": "done", "distance_miles": 9.1, "elevation_ft": 2608, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/caribou-lake-via-arapaho-pass-trail"}, {"region": "Indian Peaks Wilderness", "name": "Blue Lake via Mitchell Lake Trail", "status": "done", "distance_miles": 5.7, "elevation_ft": 977, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/blue-lake-via-mitchell-lake-trail"}, {"region": "Indian Peaks Wilderness", "name": "Lake Isabelle", "status": "done", "distance_miles": 6.6, "elevation_ft": 675, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/lake-isabelle-via-pawnee-pass-trail--2"}, {"region": "Holy Cross Wilderness", "name": "Lake Charles via Mystic Island Lake", "status": "want", "distance_miles": 12.8, "elevation_ft": 2936, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mystic-island-lake-and-lake-charles-via-ironedge-trail"}, {"region": "Holy Cross Wilderness", "name": "Lake Constantine and Tuhare Lakes", "status": "want", "distance_miles": 8.1, "elevation_ft": 1669, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/lake-constantine-via-fall-creek-trail"}, {"region": "Holy Cross Wilderness", "name": "Mystic Island Lake and Lake Charles via Ironedge Trail", "status": "want", "distance_miles": 12.8, "elevation_ft": 2936, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mystic-island-lake-and-lake-charles-via-ironedge-trail"}, {"region": "Holy Cross Wilderness", "name": "Surprise Lake via Cross Creek Trail", "status": "done", "distance_miles": 5.1, "elevation_ft": 702, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/surprise-lake-via-cross-creek-trail"}, {"region": "Holy Cross Wilderness", "name": "Fall Creek Pass", "status": "done", "distance_miles": 16, "elevation_ft": 4209, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/fall-creek-pass-trail"}, {"region": "Holy Cross Wilderness", "name": "Savage Lakes", "status": "done", "distance_miles": 4, "elevation_ft": 1299, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/savage-lakes-trail"}, {"region": "Holy Cross Wilderness", "name": "Notch Mountain", "status": "done", "distance_miles": 6.8, "elevation_ft": 2887, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/notch-mountain-via-north-ridge"}, {"region": "Holy Cross Wilderness", "name": "Seven Sisters Lakes", "status": "done", "distance_miles": 2.1, "elevation_ft": 498, "alltrails_url": "https://www.alltrails.com/trail/canada/british-columbia/seven-sisters-trail"}, {"region": "Holy Cross Wilderness", "name": "Hunky Dory Lake / Harvey Lake", "status": "done", "distance_miles": 8.2, "elevation_ft": 144, "alltrails_url": "https://www.alltrails.com/trail/us/pennsylvania/harvey-s-lake-loop"}, {"region": "Holy Cross Wilderness", "name": "Lonesome Lake", "status": "done", "distance_miles": 10.6, "elevation_ft": 1748, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/lonesome-lake-trail"}, {"region": "Holy Cross Wilderness", "name": "Missouri Lakes and Fancy Pass Loop", "status": "done", "distance_miles": 8.8, "elevation_ft": 2604, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/missouri-lakes-and-fancy-lakes-loop-trail"}, {"region": "Loveland Pass / I-70 / Montezuma", "name": "Grizzly and Cupid Peaks", "status": "want", "distance_miles": 5.8, "elevation_ft": 2837, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/grizzly-peak-and-cupid-peak-via-mount-sniktau-trail-and-loveland-pass"}, {"region": "Loveland Pass / I-70 / Montezuma", "name": "Bard Peak", "status": "done", "distance_miles": 9, "elevation_ft": 4333, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mount-parnassus-and-bard-peak"}, {"region": "Loveland Pass / I-70 / Montezuma", "name": "Mt Edwards via Argentine Pass", "status": "done", "distance_miles": 7.6, "elevation_ft": 2782, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mount-edwards-via-upper-creek-and-argentine-pass-trail"}, {"region": "Loveland Pass / I-70 / Montezuma", "name": "Mt Sniktau", "status": "done", "distance_miles": 3.7, "elevation_ft": 1591, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/sniktau-mountain-trail"}, {"region": "Loveland Pass / I-70 / Montezuma", "name": "West Ridge Trail", "status": "done", "distance_miles": 2.9, "elevation_ft": 652, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/west-ridge-trail-from-loveland-pass"}, {"region": "Loveland Pass / I-70 / Montezuma", "name": "Herman Gulch", "status": "done", "distance_miles": 6.6, "elevation_ft": 1758, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/herman-gulch-trail"}, {"region": "Loveland Pass / I-70 / Montezuma", "name": "Watrous Gulch / Mt Parnassus", "status": "done", "distance_miles": 6.9, "elevation_ft": 3261, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mount-parnassus-via-watrous-gulch"}, {"region": "Loveland Pass / I-70 / Montezuma", "name": "Chihuahua Lake", "status": "done", "distance_miles": 7.5, "elevation_ft": 1906, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/chihuahua-lake-trail"}, {"region": "Collegiate Peaks / Leadville / Buena Vista", "name": "Lake Ann", "status": "want", "distance_miles": 7.4, "elevation_ft": 1397, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/lake-ann-trail"}, {"region": "Collegiate Peaks / Leadville / Buena Vista", "name": "Ptarmigan Lake", "status": "want", "distance_miles": 6.3, "elevation_ft": 1469, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/ptarmigan-lake-trail"}, {"region": "Collegiate Peaks / Leadville / Buena Vista", "name": "Hope Pass", "status": "want", "distance_miles": 9.1, "elevation_ft": 3241, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/hope-pass-via-willis-gulch-trail"}, {"region": "Collegiate Peaks / Leadville / Buena Vista", "name": "Windsor Lake", "status": "done", "distance_miles": 2.1, "elevation_ft": 839, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/windsor-lake"}, {"region": "Collegiate Peaks / Leadville / Buena Vista", "name": "Native Lake", "status": "done", "distance_miles": 8.1, "elevation_ft": 1738, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/native-lake-trail"}, {"region": "Collegiate Peaks / Leadville / Buena Vista", "name": "Browns Pass Hartenstein Lake Trail", "status": "done", "distance_miles": 6.1, "elevation_ft": 1584, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/browns-pass-hartenstein-lake-trail"}, {"region": "Collegiate Peaks / Leadville / Buena Vista", "name": "Hagerman Tunnel", "status": "done", "distance_miles": 7, "elevation_ft": 679, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/douglass-city-and-hagerman-tunnel-via-windsor-lake-trailhead"}, {"region": "Collegiate Peaks / Leadville / Buena Vista", "name": "Lost Lake (Cottonwood Pass)", "status": "done", "distance_miles": 11.3, "elevation_ft": 2234, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/swampy-to-beckwith-pass-to-lost-lake-slough"}, {"region": "Collegiate Peaks / Leadville / Buena Vista", "name": "Harvard Lakes", "status": "done", "distance_miles": 5.2, "elevation_ft": 1515, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/harvard-lakes-trail"}, {"region": "Collegiate Peaks / Leadville / Buena Vista", "name": "Mayflower Gulch", "status": "done", "distance_miles": 6.5, "elevation_ft": 1722, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mayflower-gulch-grand-traverse"}, {"region": "Collegiate Peaks / Leadville / Buena Vista", "name": "Timberline Lake", "status": "done", "distance_miles": 4.4, "elevation_ft": 869, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/timberline-lake-trail"}, {"region": "Collegiate Peaks / Leadville / Buena Vista", "name": "Kroenke Lake", "status": "done", "distance_miles": 8.7, "elevation_ft": 1676, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/kroenke-lake"}, {"region": "Mt Blue Sky / Guanella Pass", "name": "Beartrack Lakes", "status": "done", "distance_miles": 10.9, "elevation_ft": 2539, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/beartrack-lakes-trail"}, {"region": "Mt Blue Sky / Guanella Pass", "name": "Roosevelt Lakes", "status": "done", "distance_miles": 12.4, "elevation_ft": 1945, "alltrails_url": "https://www.alltrails.com/trail/canada/ontario/roosevelt-lake-and-bryan-lake-loop"}, {"region": "Mt Blue Sky / Guanella Pass", "name": "Rosalie Peak via Tanglewood Trail", "status": "done", "distance_miles": 11, "elevation_ft": 4235, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/rosalie-peak-via-tanglewood-trail"}, {"region": "Mt Blue Sky / Guanella Pass", "name": "Chicago Lakes", "status": "done", "distance_miles": 10.9, "elevation_ft": 3274, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/chicago-lakes-trail"}, {"region": "Mt Blue Sky / Guanella Pass", "name": "Shelf Lake", "status": "done", "distance_miles": 7, "elevation_ft": 1942, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/shelf-lake-trail"}, {"region": "Mt Blue Sky / Guanella Pass", "name": "Abyss Trail to Helms Lake", "status": "done", "distance_miles": 12, "elevation_ft": 2417, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/abyss-trail-to-helms-lake"}, {"region": "Mt Blue Sky / Guanella Pass", "name": "Square Top Lakes", "status": "done", "distance_miles": 4.8, "elevation_ft": 938, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/south-park-600-to-square-top-lakes"}, {"region": "Mt Blue Sky / Guanella Pass", "name": "Silver Dollar Lake / Murray Lake", "status": "done", "distance_miles": 4.3, "elevation_ft": 1082, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/silver-dollar-lake-ad-murray-lake-trail"}, {"region": "Berthoud / Empire / Vasquez Peaks", "name": "Vasquez Peak from Jones Pass", "status": "done", "distance_miles": 7.3, "elevation_ft": 2007, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/jones-pass"}, {"region": "Berthoud / Empire / Vasquez Peaks", "name": "Jones Pass and CDT", "status": "done", "distance_miles": 7.3, "elevation_ft": 2007, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/jones-pass"}, {"region": "Berthoud / Empire / Vasquez Peaks", "name": "Parry Peak", "status": "done", "distance_miles": 13.8, "elevation_ft": 4858, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/parry-peak-and-mount-bancroft"}, {"region": "Berthoud / Empire / Vasquez Peaks", "name": "Ruby Gulch", "status": "done", "distance_miles": 4.7, "elevation_ft": 1492, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/ruby-gulch"}, {"region": "Berthoud / Empire / Vasquez Peaks", "name": "Loch Lomond", "status": "done", "distance_miles": 4.7, "elevation_ft": 898, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/loch-lomond"}, {"region": "Berthoud / Empire / Vasquez Peaks", "name": "Butler Gulch", "status": "done", "distance_miles": 5.6, "elevation_ft": 1794, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/butler-gulch"}, {"region": "Berthoud / Empire / Vasquez Peaks", "name": "Mt Flora", "status": "done", "distance_miles": 6.4, "elevation_ft": 1791, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mount-flora-trail"}, {"region": "Berthoud / Empire / Vasquez Peaks", "name": "Stanley Mountain", "status": "done", "distance_miles": 7.5, "elevation_ft": 1856, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/stanley-mountain-trail"}, {"region": "Berthoud / Empire / Vasquez Peaks", "name": "Second Creek to Twin Cones", "status": "done", "distance_miles": 5.3, "elevation_ft": 1466, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/second-creek-trail-to-twin-cones"}, {"region": "Summit County / Tenmile / Breckenridge", "name": "Hoosier Ridge", "status": "done", "distance_miles": 1.6, "elevation_ft": 324, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/hoosier-ridge-hike"}, {"region": "Summit County / Tenmile / Breckenridge", "name": "Buffalo Mountain", "status": "done", "distance_miles": 6, "elevation_ft": 3021, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/buffalo-mountain-trail--2"}, {"region": "Summit County / Tenmile / Breckenridge", "name": "Willow Creek Falls via South Willow Creek", "status": "done", "distance_miles": 6.5, "elevation_ft": 1076, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/willow-creek-falls-via-south-willow-creek"}, {"region": "Summit County / Tenmile / Breckenridge", "name": "Ptarmigan Trail", "status": "done", "distance_miles": 4.9, "elevation_ft": 1164, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/ptarmigan-trail"}, {"region": "Summit County / Tenmile / Breckenridge", "name": "Peaks Trail (Frisco to Breck)", "status": "done", "distance_miles": 12.5, "elevation_ft": 2742, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/copper-to-frisco-via-wheeler-and-peaks-trail"}, {"region": "Summit County / Tenmile / Breckenridge", "name": "Uneva Pass", "status": "done", "distance_miles": 12.6, "elevation_ft": 2618, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/uneva-pass-trail"}, {"region": "Summit County / Tenmile / Breckenridge", "name": "Upper Blue Lake via Monte Cristo Gulch", "status": "done", "distance_miles": 4.5, "elevation_ft": 853, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/monte-cristo-gulch-trail"}, {"region": "Summit County / Tenmile / Breckenridge", "name": "McCullough Gulch", "status": "done", "distance_miles": 6.5, "elevation_ft": 1591, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mccullough-gulch-trail"}, {"region": "Summit County / Tenmile / Breckenridge", "name": "Mohawk Lakes", "status": "done", "distance_miles": 9.2, "elevation_ft": 2168, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/spruce-lakes-trail-to-mohawk-lakes-trail"}, {"region": "Summit County / Tenmile / Breckenridge", "name": "Crystal Lakes", "status": "done", "distance_miles": 3, "elevation_ft": 285, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/crystal-lake--3"}, {"region": "Summit County / Tenmile / Breckenridge", "name": "Lilypad Lake", "status": "done", "distance_miles": 3.4, "elevation_ft": 413, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/lily-pad-lake-trail"}, {"region": "Summit County / Tenmile / Breckenridge", "name": "North Tenmile", "status": "done", "distance_miles": 7, "elevation_ft": 961, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/north-ten-mile-37"}, {"region": "Summit County / Tenmile / Breckenridge", "name": "Black Powder Pass (Boreas Pass)", "status": "done", "distance_miles": 3.5, "elevation_ft": 1003, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/black-power-pass-summit"}, {"region": "Hunter Fryingpan / Independence Pass", "name": "Lost Man Loop", "status": "want", "distance_miles": 3.1, "elevation_ft": 731, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/fish-creek-falls-loop-via-skyline-trail"}, {"region": "Hunter Fryingpan / Independence Pass", "name": "Grizzly Lake", "status": "want", "distance_miles": 7.5, "elevation_ft": 1984, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/grizzly-lake-trail"}, {"region": "Hunter Fryingpan / Independence Pass", "name": "North Fork Lake Creek / Fryingpan Pass", "status": "done", "distance_miles": 7.5, "elevation_ft": 1610, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/north-fork-lake-creek-trail"}, {"region": "Hunter Fryingpan / Independence Pass", "name": "Midway Pass", "status": "done", "distance_miles": 7.9, "elevation_ft": 1919, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/midway-pass"}, {"region": "Hunter Fryingpan / Independence Pass", "name": "The Grottos / Cascades", "status": "done", "distance_miles": 0.5, "elevation_ft": 29, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/the-grottos-trail"}, {"region": "Hunter Fryingpan / Independence Pass", "name": "Linkins Lake", "status": "done", "distance_miles": 1.4, "elevation_ft": 505, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/linkins-lake-trail"}, {"region": "Aspen / Snowmass / Carbondale", "name": "Cathedral Lake (to Electric Pass)", "status": "want", "distance_miles": 5.5, "elevation_ft": 2066, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/cathedral-lake-trail"}, {"region": "Aspen / Snowmass / Carbondale", "name": "American Lake", "status": "want", "distance_miles": 6.3, "elevation_ft": 2034, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/american-lake-trail"}, {"region": "Aspen / Snowmass / Carbondale", "name": "Thomas Lakes (Mt Sopris approach)", "status": "want", "distance_miles": 8.2, "elevation_ft": 1650, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/thomas-lakes-trail"}, {"region": "Aspen / Snowmass / Carbondale", "name": "Crater Lake from Maroon Lake", "status": "done", "distance_miles": 3.7, "elevation_ft": 695, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/crater-lake-trail"}, {"region": "Crested Butte", "name": "Conundrum Hot Springs", "status": "want", "distance_miles": 17.1, "elevation_ft": 2762, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/conundrum-creek-trail-to-conundrum-hot-springs"}, {"region": "Crested Butte", "name": "West Maroon Pass", "status": "done", "distance_miles": 7.9, "elevation_ft": 2063, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/west-maroon-bells-pass"}, {"region": "Crested Butte", "name": "Trail 401", "status": "done", "distance_miles": 16.3, "elevation_ft": 3185, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/trail-401"}, {"region": "Crested Butte", "name": "Oh Be Joyful", "status": "done", "distance_miles": 13.2, "elevation_ft": 2162, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/oh-be-joyful--3"}, {"region": "Crested Butte", "name": "Copper Lake via Judd Falls", "status": "done", "distance_miles": 10.6, "elevation_ft": 2506, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/tuhare-lakes-via-fall-creek-trail"}, {"region": "Crested Butte", "name": "Scarp Ridge", "status": "done", "distance_miles": 8.3, "elevation_ft": 2585, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/scarp-ridge-to-mt-emmons"}, {"region": "Crested Butte", "name": "Rustler Gulch", "status": "done", "distance_miles": 9.1, "elevation_ft": 1801, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/rustlers-gulch"}, {"region": "Crested Butte", "name": "Snodgrass", "status": "done", "distance_miles": 8.1, "elevation_ft": 2096, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/snodgrass-mountain-trail"}, {"region": "Crested Butte", "name": "Upper and Lower Loop", "status": "done", "distance_miles": 4.5, "elevation_ft": 347, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/crested-butte-upper-and-lower-loop"}, {"region": "Rocky Mountain National Park", "name": "Sky Pond", "status": "want", "distance_miles": 9, "elevation_ft": 1771, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/sky-pond-via-glacier-gorge-trail"}, {"region": "Rocky Mountain National Park", "name": "Mt Ida", "status": "done", "distance_miles": 9.6, "elevation_ft": 2398, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mount-ida-trail"}, {"region": "Rocky Mountain National Park", "name": "Hallett Peak", "status": "done", "distance_miles": 10, "elevation_ft": 3274, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/hallett-peak"}, {"region": "Rocky Mountain National Park", "name": "Mills Lake", "status": "done", "distance_miles": 5.4, "elevation_ft": 836, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mills-lake-via-glacier-gorge-trail"}, {"region": "Rocky Mountain National Park", "name": "Chasm Lake", "status": "done", "distance_miles": 8.4, "elevation_ft": 2539, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/chasm-lake"}, {"region": "Rocky Mountain National Park", "name": "Emerald Lake / Dream Lake / Lake Haiyaha", "status": "done", "distance_miles": 3.3, "elevation_ft": 715, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/emerald-lake-trail"}, {"region": "San Juans", "name": "Columbine Lake", "status": "want", "distance_miles": 6.9, "elevation_ft": 2542, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/columbine-lake-trail-509"}, {"region": "San Juans", "name": "Highland Mary Lakes", "status": "done", "distance_miles": 5.2, "elevation_ft": 1400, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/highland-mary-lake-trail"}, {"region": "San Juans", "name": "Hope Lake", "status": "done", "distance_miles": 4.9, "elevation_ft": 1364, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/hope-lake-trail--5"}, {"region": "San Juans", "name": "Lizard Head Trail", "status": "done", "distance_miles": 19, "elevation_ft": 5479, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/lizard-head-trail"}, {"region": "San Juans", "name": "Ice Lake and Island Lake", "status": "done", "distance_miles": 7.5, "elevation_ft": 2647, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/island-lake-and-ice-lake-via-ice-lakes-trail"}, {"region": "San Juans", "name": "Blue Lakes", "status": "done", "distance_miles": 13.6, "elevation_ft": 5488, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mount-sneffels-via-blue-lakes-trail"}, {"region": "San Juans", "name": "Bridal Veil Falls", "status": "done", "distance_miles": 6.2, "elevation_ft": 1010, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/bridal-veil-falls-trail"}, {"region": "San Juans", "name": "Bear Creek Trail", "status": "done", "distance_miles": 7.1, "elevation_ft": 1220, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/penrose-trail"}, {"region": "Sangre de Cristos", "name": "Willow Lake (Challenger / Kit Carson)", "status": "done", "distance_miles": 14.1, "elevation_ft": 6364, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/kit-carson-mountain-via-willow-lake-trail"}, {"region": "Sangre de Cristos", "name": "South Colony Lakes (Humboldt approach)", "status": "done", "distance_miles": 9.2, "elevation_ft": 2309, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/south-colony-lakes-trail"}, {"region": "Sangre de Cristos", "name": "Venable-Comanche Loop", "status": "done", "distance_miles": 18.6, "elevation_ft": 6584, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/greater-venable-comanche-loop"}, {"region": "Sangre de Cristos", "name": "Lake of the Clouds", "status": "done", "distance_miles": 11.8, "elevation_ft": 2604, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/lakes-of-the-clouds"}, {"region": "Zirkel Wilderness / Steamboat", "name": "Mica Lake", "status": "done", "distance_miles": 103.7, "elevation_ft": 18641, "alltrails_url": "https://www.alltrails.com/trail/ecuador/pichincha/quito-a-laguna-de-la-mica"}, {"region": "Zirkel Wilderness / Steamboat", "name": "Three Island Lake", "status": "done", "distance_miles": 6.9, "elevation_ft": 1538, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/three-island-lake-trail"}, {"region": "Zirkel Wilderness / Steamboat", "name": "Fish Creek Falls", "status": "done", "distance_miles": 4.7, "elevation_ft": 1427, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/fish-creek-falls-trail"}, {"region": "Zirkel Wilderness / Steamboat", "name": "Mt Zirkel Loop", "status": "done", "distance_miles": 10.8, "elevation_ft": 2437, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mount-zirkel-loop-trail"}, {"region": "Northern Colorado / Rawah / State Forest", "name": "Blue Lake and Hang Lake (Rawah)", "status": "done", "distance_miles": 5.7, "elevation_ft": 977, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/blue-lake-via-mitchell-lake-trail"}, {"region": "Northern Colorado / Rawah / State Forest", "name": "Twin Crater Lakes (Rawah)", "status": "done", "distance_miles": 23.9, "elevation_ft": 4776, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/twin-crater-lakes-via-rawah-trail"}, {"region": "Northern Colorado / Rawah / State Forest", "name": "Island Lake / Carey Lake (Rawah)", "status": "done", "distance_miles": 2.1, "elevation_ft": 75, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/island-lake-trail"}, {"region": "Northern Colorado / Rawah / State Forest", "name": "American Lakes + Snow Lake + Thunder Pass", "status": "done", "distance_miles": 8.8, "elevation_ft": 1791, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/thunder-pass-via-american-lakes-trail"}, {"region": "Northern Colorado / Rawah / State Forest", "name": "Lake Agnes", "status": "done", "distance_miles": 2.3, "elevation_ft": 446, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/lake-agnes-loop-trail"}, {"region": "Northern Colorado / Rawah / State Forest", "name": "Kelly Lake / Clear Lake", "status": "done", "distance_miles": 13.7, "elevation_ft": 2693, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/kelly-lake-trail"}, {"region": "Northern Colorado / Rawah / State Forest", "name": "Emmaline Lake", "status": "done", "distance_miles": 11.6, "elevation_ft": 2106, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/emmaline-lake-trail"}, {"region": "Northern Colorado / Rawah / State Forest", "name": "Mirror Lake / Mummy Pass", "status": "done", "distance_miles": 21.6, "elevation_ft": 4143, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mummy-pass-trail-937"}, {"region": "Backpacking", "name": "Rawah Wilderness Loop", "status": "done", "distance_miles": 20.4, "elevation_ft": 3579, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/link-medicine-bow-mcintyre-creek-trails-loop"}, {"region": "Backpacking", "name": "Vestal Basin", "status": "done", "distance_miles": 20, "elevation_ft": 5770, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/vestal-basin-via-colorado-and-elk-creek-trail"}, {"region": "Backpacking", "name": "Chicago Basin", "status": "done", "distance_miles": 18.2, "elevation_ft": 5882, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/chicago-basin-to-mount-eolus"}, {"region": "Backpacking", "name": "Pawnee Buchanan Loop", "status": "planned", "distance_miles": 1.6, "elevation_ft": 88, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/buchanan-park-loop"}, {"region": "Backpacking", "name": "Titcomb Basin", "status": "done", "distance_miles": 31.2, "elevation_ft": 4176, "alltrails_url": "https://www.alltrails.com/trail/us/wyoming/titcomb-lakes-via-pole-creek-seneca-lake-and-indian-pass-trail"}, {"region": "Backpacking", "name": "4 Pass Loop", "status": "done", "distance_miles": 26.9, "elevation_ft": 7801, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/four-pass-loop--5"}, {"region": "Backpacking", "name": "Sawtooth Range", "status": "done", "distance_miles": 36.3, "elevation_ft": 8248, "alltrails_url": "https://www.alltrails.com/trail/us/california/matterhorn-canyon-and-the-sawtooth-range-trail"}, {"region": "Backpacking", "name": "Teton Crest Trail", "status": "done", "distance_miles": 39.8, "elevation_ft": 9045, "alltrails_url": "https://www.alltrails.com/trail/us/wyoming/teton-crest-trail--3"}, {"region": "Backpacking", "name": "Beaten Path", "status": "done", "distance_miles": 26.3, "elevation_ft": 3307, "alltrails_url": "https://www.alltrails.com/trail/us/montana/the-beaten-path-trail"}, {"region": "Backpacking", "name": "Cirque of the Towers", "status": "done", "distance_miles": 15.4, "elevation_ft": 2257, "alltrails_url": "https://www.alltrails.com/trail/us/wyoming/big-sandy-lake-and-arrowhead-lake-via-fremont-and-big-sandy-trail"}, {"region": "Backpacking", "name": "Colorado Trail San Juans", "status": "done", "distance_miles": 16, "elevation_ft": 3444, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/colorado-trail-segment-23-carson-saddle-to-stony-pass-trailhead"}, {"region": "14ers", "name": "Mt Holy Cross", "status": "done", "distance_miles": 11.3, "elevation_ft": 5495, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mount-of-the-holy-cross-trail"}, {"region": "14ers", "name": "Shavano / Tabeguache", "status": "done", "distance_miles": 11.8, "elevation_ft": 5288, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mount-shavano--2"}, {"region": "14ers", "name": "Mt Antero", "status": "done", "distance_miles": 15.5, "elevation_ft": 4875, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mount-antero-trail"}, {"region": "14ers", "name": "Sunshine / Redcloud", "status": "done", "distance_miles": 11.8, "elevation_ft": 4599, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/redcloud-and-sunshine-peaks"}, {"region": "14ers", "name": "Uncompaghre Peak", "status": "done", "distance_miles": 18, "elevation_ft": 6437, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/wetterhorn-peak-and-uncompaghre-peak"}, {"region": "14ers", "name": "Humboldt Peak", "status": "done", "distance_miles": 11.1, "elevation_ft": 4222, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/humboldt-peak-trail"}, {"region": "14ers", "name": "San Luis Peak", "status": "done", "distance_miles": 13.2, "elevation_ft": 3549, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/san-luis-peak-via-stewart-creek-trail"}, {"region": "14ers", "name": "Pikes Peak", "status": "done", "distance_miles": 24.2, "elevation_ft": 7444, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/pikes-peak-via-barr-trail--2"}, {"region": "14ers", "name": "Longs Peak", "status": "done", "distance_miles": 13.6, "elevation_ft": 4934, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/the-keyhole-and-longs-peak-trail"}, {"region": "14ers", "name": "Wetterhorn Peak", "status": "done", "distance_miles": 9.3, "elevation_ft": 3625, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/wetterhorn-peak-via-ridge-stock-driveway-trail"}, {"region": "14ers", "name": "Mt Sneffels", "status": "done", "distance_miles": 13.6, "elevation_ft": 5488, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mount-sneffels-via-blue-lakes-trail"}, {"region": "14ers", "name": "Quandary Peak", "status": "done", "distance_miles": 7.1, "elevation_ft": 3428, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/quandary-peak-trail"}, {"region": "14ers", "name": "Mt Bierstadt", "status": "done", "distance_miles": 7.3, "elevation_ft": 2739, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mount-bierstadt-trail"}, {"region": "14ers", "name": "Mt Massive", "status": "done", "distance_miles": 13.5, "elevation_ft": 4550, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mount-massive-trail-via-south-east"}, {"region": "14ers", "name": "Grays and Torreys Peaks", "status": "done", "distance_miles": 8.3, "elevation_ft": 3605, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/grays-and-torreys-peak"}, {"region": "14ers", "name": "Mt Sherman", "status": "done", "distance_miles": 4.7, "elevation_ft": 2014, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mount-sherman-trail-via-four-mile-creek-road"}, {"region": "14ers", "name": "Mt Elbert", "status": "done", "distance_miles": 11.5, "elevation_ft": 5118, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mount-elbert-southeast-ridge-trail"}, {"region": "14ers", "name": "Democrat / Cameron / Bross / Lincoln", "status": "done", "distance_miles": 8.4, "elevation_ft": 3789, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/the-decalibron-mounts-democrat-cameron-lincoln-and-bross-trail"}, {"region": "14ers", "name": "La Plata Peak", "status": "done", "distance_miles": 9.3, "elevation_ft": 4350, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/la-plata-peak-trail-1474"}, {"region": "14ers", "name": "Huron Peak", "status": "done", "distance_miles": 6.7, "elevation_ft": 3412, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/huron-peak-via-north-huron-trail"}, {"region": "14ers", "name": "Mt Blue Sky (Evans)", "status": "done", "distance_miles": 5.6, "elevation_ft": 2063, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mount-evans-and-mount-spalding-loop-trail"}, {"region": "14ers", "name": "Mt Yale", "status": "done", "distance_miles": 9.3, "elevation_ft": 4265, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mount-yale-via-browns-pass-and-mount-yale-trail"}, {"region": "14ers", "name": "Mt Missouri", "status": "done", "distance_miles": 10.7, "elevation_ft": 4468, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/missouri-mountain-trail--2"}, {"region": "14ers", "name": "Mt Harvard", "status": "done", "distance_miles": 13.5, "elevation_ft": 4481, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mount-harvard-trail"}, {"region": "14ers", "name": "Mt Columbia", "status": "done", "distance_miles": 12.1, "elevation_ft": 4156, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mount-columbia-via-horn-fork-basin-trail"}, {"region": "14ers", "name": "Mt Princeton", "status": "done", "distance_miles": 7.2, "elevation_ft": 3320, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/mount-princeton-trail"}, {"region": "14ers", "name": "Belford and Oxford", "status": "done", "distance_miles": 15.1, "elevation_ft": 7217, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/missouri-belford-and-oxford-mountains"}, {"region": "14ers", "name": "Handies Peak", "status": "done", "distance_miles": 5.4, "elevation_ft": 2431, "alltrails_url": "https://www.alltrails.com/trail/us/colorado/handies-peak"}];

function buildHikeList() {
  return [...HIKES_DATA, ...Object.values(customHikes).flat()];
}

// ── Region order ──────────────────────────────────────────────────────────────
const REGION_ORDER = [
  'James Peak Wilderness',
  'Indian Peaks Wilderness',
  'Eagles Nest Wilderness',
  'Holy Cross Wilderness',
  'Loveland Pass / I-70 / Montezuma',
  'Berthoud / Empire / Vasquez Peaks',
  'Mt Blue Sky / Guanella Pass',
  'Summit County / Tenmile / Breckenridge',
  'Collegiate Peaks / Leadville / Buena Vista',
  'Hunter Fryingpan / Independence Pass',
  'Aspen / Snowmass / Carbondale',
  'Crested Butte',
  'Rocky Mountain National Park',
  'San Juans',
  'Sangre de Cristos',
  'Zirkel Wilderness / Steamboat',
  'Northern Colorado / Rawah / State Forest',
  'Backpacking',
  '14ers',
];

const STATUS_LABEL = { done: 'Done', want: 'Want to Do', planned: 'Planned' };

// ── Render helpers ────────────────────────────────────────────────────────────
function badge(status) {
  return `<span class="badge badge-${status}">${STATUS_LABEL[status] || status}</span>`;
}
function formatDist(miles) {
  return miles != null ? `${miles} mi` : '—';
}
function formatElev(ft) {
  if (ft == null) return '—';
  return ft.toLocaleString() + ' ft';
}
function personBtnHtml(name, person) {
  const status  = getPersonStatus(name, person);
  const cls     = status === 'done' ? ' ps-done' : status === 'want' ? ' ps-want' : '';
  const label   = status === 'done' ? '✓ Done'   : status === 'want' ? '★ Want'   : '—';
  const escaped = name.replace(/"/g, '&quot;');
  const key     = fbKey(name);
  // No inline onclick — handled by event delegation in init()
  return `<button class="person-btn${cls}" data-trail="${escaped}" data-fbkey="${key}" data-person="${person}">${label}</button>`;
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderHikes(hikes) {
  const app = document.getElementById('app');
  if (hikes.length === 0) {
    app.innerHTML = '<p class="no-results">No hikes match your search.</p>';
    return;
  }

  const grouped = {};
  for (const h of hikes) {
    if (!grouped[h.region]) grouped[h.region] = [];
    grouped[h.region].push(h);
  }

  const regionKeys = [
    ...REGION_ORDER.filter(r => grouped[r]),
    ...Object.keys(grouped).filter(r => !REGION_ORDER.includes(r)).sort(),
  ];

  app.innerHTML = regionKeys.map(region => {
    const trails  = grouped[region];
    const regionId = region.replace(/\W+/g, '-');

    const cards = trails.map(h => {
      const nameEsc   = h.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      const key       = fbKey(h.name);
      const effectiveUrl = trailUrls[key] !== undefined ? trailUrls[key] : (h.alltrails_url || '');
      const deleteBtn = h.custom
        ? `<button class="btn-delete" onclick="deleteCustomHike('${region.replace(/'/g,"\\'")}','${nameEsc}')" title="Remove">×</button>`
        : '';
      const noteObj   = hikeNotes[key] || {};
      return `
        <div class="trail-card-wrap" id="wrap-${key}">
          <div class="trail-card">
            <div class="trail-name">
              <span id="name-display-${key}">
                ${effectiveUrl
                  ? `<a href="${effectiveUrl}" target="_blank" rel="noopener">${h.name}</a>`
                  : h.name}
                <button class="btn-edit-url" onclick="startEditUrl('${key}','${nameEsc}')" title="Edit link">✏</button>
              </span>
              <span id="name-edit-${key}" style="display:none" class="url-edit-wrap">
                <input id="url-input-${key}" class="url-input" type="url" value="${effectiveUrl}" placeholder="https://alltrails.com/..." />
                <button class="btn-url-save" onclick="saveUrl('${key}','${nameEsc}')">Save</button>
                <button class="btn-url-cancel" onclick="cancelEditUrl('${key}')">✕</button>
              </span>
            </div>
            <div class="trail-stats">
              <span class="stat">&#128207; ${formatDist(h.distance_miles)}</span>
              <span class="stat">&#11014; ${formatElev(h.elevation_ft)}</span>
            </div>
              <div class="person-col">${personBtnHtml(h.name, 'leah')}</div>
            <div class="person-col">${personBtnHtml(h.name, 'mac')}</div>
            <div class="person-col">${personBtnHtml(h.name, 'robin')}</div>
            <button class="btn-log" onclick="toggleLog('${key}')" title="View / add notes">📝</button>
            ${deleteBtn}
          </div>
          <div class="hike-log" id="log-${key}" style="display:none">
            <div class="log-fields">
              <label class="log-label">Notes
                <textarea id="log-notes-${key}" class="log-textarea" placeholder="How was the hike? What did you see?" onblur="saveNote('${key}','notes',this.value)">${noteObj.notes || ''}</textarea>
              </label>
              <label class="log-label">Tips
                <textarea id="log-tips-${key}" class="log-textarea" placeholder="What should someone know before going?" onblur="saveNote('${key}','tips',this.value)">${noteObj.tips || ''}</textarea>
              </label>
              <label class="log-label">Parking
                <textarea id="log-parking-${key}" class="log-textarea log-textarea--short" placeholder="Where to park, fees, permits, etc." onblur="saveNote('${key}','parking',this.value)">${noteObj.parking || ''}</textarea>
              </label>
            </div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="region-group">
        <div class="region-header" onclick="toggleRegion(this)">
          <h2>${region}</h2>
          <span class="region-count">${trails.length} hike${trails.length !== 1 ? 's' : ''}</span>
          <span class="region-toggle">&#9662;</span>
        </div>
        <div class="trail-col-headers">
          <span class="col-name">Trail</span>
          <span class="col-stats">Distance &amp; Elevation</span>
          <span class="col-person">Leah</span>
          <span class="col-person">Mac</span>
          <span class="col-person">Robin</span>
          <span class="col-actions"></span>
        </div>
        <div class="trail-list">${cards}</div>
        <button class="add-hike-btn" onclick="showAddForm('${regionId}')">+ Add hike to ${region}</button>
        <div class="add-hike-form" id="form-${regionId}" style="display:none">
          <label class="field-name">Trail name
            <input type="text" id="f-name-${regionId}" placeholder="e.g. Blue Lake" />
          </label>
          <label class="field-dist">Distance (mi)
            <input type="number" id="f-dist-${regionId}" placeholder="e.g. 7.5" min="0" step="0.1" />
          </label>
          <label class="field-elev">Elevation (ft)
            <input type="number" id="f-elev-${regionId}" placeholder="e.g. 1800" min="0" step="10" />
          </label>
          <label class="field-status">Status
            <select id="f-status-${regionId}">
              <option value="want">Want to Do</option>
              <option value="done">Done</option>
              <option value="planned">Planned</option>
            </select>
          </label>
          <label class="field-url">AllTrails URL (optional)
            <input type="url" id="f-url-${regionId}" placeholder="https://alltrails.com/..." />
          </label>
          <div class="form-actions">
            <button class="btn-save" onclick="submitAddHike('${regionId}','${region.replace(/'/g,"\'")}')">Add</button>
            <button class="btn-cancel" onclick="hideAddForm('${regionId}')">Cancel</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

function toggleRegion(header) {
  header.closest('.region-group').classList.toggle('collapsed');
}

// ── Add hike form helpers ─────────────────────────────────────────────────────
function showAddForm(regionId) {
  const form = document.getElementById('form-' + regionId);
  if (form) { form.style.display = 'flex'; form.querySelector('input[type="text"]')?.focus(); }
}
function hideAddForm(regionId) {
  const form = document.getElementById('form-' + regionId);
  if (form) {
    form.style.display = 'none';
    form.querySelectorAll('input').forEach(i => i.value = '');
    form.querySelector('select').value = 'want';
  }
}
function submitAddHike(regionId, region) {
  const name = document.getElementById('f-name-' + regionId)?.value.trim();
  if (!name) { alert('Please enter a trail name.'); return; }
  const dist   = parseFloat(document.getElementById('f-dist-' + regionId)?.value)   || null;
  const elev   = parseInt(document.getElementById('f-elev-' + regionId)?.value)     || null;
  const status = document.getElementById('f-status-' + regionId)?.value || 'want';
  const url    = document.getElementById('f-url-' + regionId)?.value.trim()         || '';
  addCustomHike(region, name, dist, elev, status, url);
}

// ── Filtering ─────────────────────────────────────────────────────────────────
function applyFilters() {
  const q = searchQuery.toLowerCase();
  const filtered = allHikes.filter(h => {
    const matchesStatus = activeFilter === 'all' || h.status === activeFilter;
    const matchesSearch = !q ||
      h.name.toLowerCase().includes(q) ||
      h.region.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });
  renderHikes(filtered);
}

// ── Editable URL helpers ──────────────────────────────────────────────────────
function startEditUrl(key, nameEsc) {
  document.getElementById('name-display-' + key).style.display = 'none';
  const editSpan = document.getElementById('name-edit-' + key);
  editSpan.style.display = 'inline-flex';
  editSpan.querySelector('input').focus();
}

function cancelEditUrl(key) {
  document.getElementById('name-display-' + key).style.display = '';
  document.getElementById('name-edit-' + key).style.display = 'none';
}

function saveUrl(key, nameEsc) {
  const input = document.getElementById('url-input-' + key);
  const url   = input ? input.value.trim() : '';
  trailUrls[key] = url;
  saveTrailUrls();
  // Update the displayed link without full re-render
  const displaySpan = document.getElementById('name-display-' + key);
  if (displaySpan) {
    // Find the trail name from the current a or text
    const existingA = displaySpan.querySelector('a');
    const trailName = existingA ? existingA.textContent : nameEsc;
    const editBtn   = `<button class="btn-edit-url" onclick="startEditUrl('${key}','${nameEsc}')" title="Edit link">✏</button>`;
    if (url) {
      displaySpan.innerHTML = `<a href="${url}" target="_blank" rel="noopener">${trailName}</a> ${editBtn}`;
    } else {
      displaySpan.innerHTML = `${trailName} ${editBtn}`;
    }
  }
  cancelEditUrl(key);
}

// ── Hike log helpers ──────────────────────────────────────────────────────────
function toggleLog(key) {
  const panel = document.getElementById('log-' + key);
  if (!panel) return;
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? 'block' : 'none';
  // Highlight the log button when open
  const wrap = document.getElementById('wrap-' + key);
  const btn  = wrap ? wrap.querySelector('.btn-log') : null;
  if (btn) btn.classList.toggle('log-active', isHidden);
  if (isHidden) panel.querySelector('textarea')?.focus();
}

function saveNote(key, field, value) {
  if (!hikeNotes[key]) hikeNotes[key] = {};
  hikeNotes[key][field] = value;
  saveHikeNotes();
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadFromFirebase();
  allHikes = buildHikeList();
  applyFilters();

  // Event delegation for person-status buttons — handles any trail name safely
  document.getElementById('app').addEventListener('click', function(e) {
    const btn = e.target.closest('.person-btn');
    if (!btn) return;
    const name   = btn.dataset.trail;   // raw name (for display/lookup)
    const person = btn.dataset.person;
    if (name && person) cycleStatus(name, person);
  });
}

document.getElementById('search').addEventListener('input', e => {
  searchQuery = e.target.value;
  applyFilters();
});

document.querySelectorAll('.pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    applyFilters();
  });
});

init();
