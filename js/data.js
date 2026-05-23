// ─── CHAIN CONFIG (used for classification of Overpass API results) ───
const CHAIN_CONFIG = {
  metro:      { label: 'metro',       short: 'METRO',     color: '#E31837', bg: '#E31837' },
  loblaws:    { label: 'loblaws',     short: 'LOBLAWS',   color: '#1B5E20', bg: '#1B5E20' },
  nofrills:   { label: 'NO FRILLS',   short: 'NO FRILLS', color: '#000',    bg: '#FFD600' },
  sobeys:     { label: 'sobeys',      short: 'SOBEYS',    color: '#D62828', bg: '#D62828' },
  farmboy:    { label: 'Farm Boy',    short: 'FARM BOY',  color: '#2E7D32', bg: '#2E7D32' },
  freshco:    { label: 'FreshCo',     short: 'FRESHCO',   color: '#E53935', bg: '#E53935' },
  tandt:      { label: 'T&T',         short: 'T&T',       color: '#C0392B', bg: '#C0392B' },
  wholefoods: { label: 'Whole Foods', short: 'WF',        color: '#00674B', bg: '#00674B' },
  walmart:    { label: 'Walmart',     short: 'WALMART',   color: '#0071CE', bg: '#0071CE' },
  iga:        { label: 'IGA',         short: 'IGA',       color: '#E31837', bg: '#E31837' },
  foodbasics: { label: 'Food Basics', short: 'FB',        color: '#E53935', bg: '#E53935' },
  other:      { label: 'Grocery',     short: 'SHOP',      color: '#555',    bg: '#757575' },
};

function detectChain(name = '', brand = '') {
  const n = (name + ' ' + brand).toLowerCase().trim();
  if (n.includes('metro'))                          return 'metro';
  if (n.includes('loblaws') || n.includes('loblaw')) return 'loblaws';
  if (n.includes('no frills') || n.includes('nofrills')) return 'nofrills';
  if (n.includes('sobeys'))                         return 'sobeys';
  if (n.includes('farm boy'))                       return 'farmboy';
  if (n.includes('freshco'))                        return 'freshco';
  if (n.includes('t&t') || n.includes('t & t'))    return 'tandt';
  if (n.includes('whole foods'))                    return 'wholefoods';
  if (n.includes('walmart') || n.includes('wal-mart')) return 'walmart';
  if (n.includes('food basics'))                    return 'foodbasics';
  if (n.includes('iga'))                            return 'iga';
  return 'other';
}

// ─── PRODUCT CATALOGUE (mock) ───
const PRODUCTS = {
  favourite: [
    { id: 1,  name: 'Nissin Cup Noodle Soup',       emoji: '🍜', price: 4.99,  chain: 'nofrills' },
    { id: 2,  name: 'Blackberries 170g',             emoji: '🫐', price: 1.88,  chain: 'metro',    salePercent: 60,  originalPrice: 4.39 },
    { id: 3,  name: 'Sweet Potato',                  emoji: '🍠', price: 1.32,  chain: 'metro',    salePercent: 29,  originalPrice: 4.39 },
    { id: 4,  name: 'Organic Baby Spinach 142g',     emoji: '🥬', price: 3.49,  chain: 'loblaws' },
    { id: 5,  name: 'Coca-Cola 12×355ml',            emoji: '🥤', price: 7.49,  chain: 'metro',    salePercent: 20,  originalPrice: 9.99 },
  ],
  deals: [
    { id: 3,  name: 'Sweet Potato',                  emoji: '🍠', price: 1.32,  chain: 'metro',    salePercent: 29,  originalPrice: 4.39 },
    { id: 5,  name: 'Coca-Cola 12×355ml',            emoji: '🥤', price: 7.49,  chain: 'metro',    salePercent: 20,  originalPrice: 9.99 },
    { id: 6,  name: 'Sweet Chili Sauce',             emoji: '🌶️', price: 2.49,  chain: 'loblaws',  salePercent: 24,  originalPrice: 3.29 },
    { id: 2,  name: 'Blackberries 170g',             emoji: '🫐', price: 1.88,  chain: 'metro',    salePercent: 60,  originalPrice: 4.39 },
    { id: 7,  name: 'Asparagus',                     emoji: '🌿', price: 7.48,  chain: 'metro',    salePercent: 25,  originalPrice: 9.99 },
  ],
  vegetable: [
    { id: 3,  name: 'Sweet Potato',                  emoji: '🍠', price: 1.32,  chain: 'metro',    salePercent: 29,  originalPrice: 4.39 },
    { id: 7,  name: 'Asparagus',                     emoji: '🌿', price: 7.48,  chain: 'metro' },
    { id: 4,  name: 'Organic Baby Spinach 142g',     emoji: '🥬', price: 3.49,  chain: 'loblaws' },
    { id: 8,  name: 'Broccoli Crown',                emoji: '🥦', price: 1.99,  chain: 'nofrills' },
    { id: 9,  name: 'Grape Tomatoes 1pt',            emoji: '🍅', price: 2.99,  chain: 'loblaws' },
  ],
  meat: [
    { id: 10, name: 'Chicken Breast Boneless 1kg',  emoji: '🍗', price: 8.99,  chain: 'metro' },
    { id: 11, name: 'Lean Ground Beef 1kg',          emoji: '🥩', price: 9.49,  chain: 'loblaws' },
    { id: 12, name: 'Pork Tenderloin',               emoji: '🥓', price: 7.99,  chain: 'nofrills' },
    { id: 13, name: 'Atlantic Salmon Fillet',        emoji: '🐟', price: 14.99, chain: 'metro',    salePercent: 20,  originalPrice: 18.99 },
  ],
  'soft-drinks': [
    { id: 5,  name: 'Coca-Cola 12×355ml',            emoji: '🥤', price: 7.49,  chain: 'metro',    salePercent: 20,  originalPrice: 9.99 },
    { id: 14, name: 'Pepsi 24×355ml',                emoji: '🧃', price: 9.99,  chain: 'nofrills' },
    { id: 15, name: 'San Pellegrino 750ml',           emoji: '💧', price: 2.49,  chain: 'loblaws' },
    { id: 16, name: 'Gatorade 8×591ml',              emoji: '🏃', price: 11.99, chain: 'metro',    salePercent: 20,  originalPrice: 14.99 },
  ],
};

// ─── SEARCH DATA ───
const SEARCH_DATA = {
  eggs: [
    { id: 20, name: 'Grey Ridge Egg Farms Large Eggs',  emoji: '🥚', prices: [
      { chain: 'metro',    price: 3.39, unit: 'ea.', best: false },
      { chain: 'nofrills', price: 3.04, unit: 'ea.', best: true  },
      { chain: 'loblaws',  price: 3.54, unit: 'ea.', best: false },
    ]},
    { id: 21, name: 'No Name Medium Size Eggs 12 Pack', emoji: '🥚', prices: [
      { chain: 'nofrills', price: 3.79, unit: 'ea.', best: true  },
      { chain: 'loblaws',  price: 3.94, unit: 'ea.', best: false },
      { chain: 'metro',    price: 3.54, unit: 'ea.', best: false },
    ]},
    { id: 22, name: 'Selection Medium Eggs',             emoji: '🥚', prices: [
      { chain: 'metro',   price: 3.89, unit: 'ea.', best: true  },
      { chain: 'loblaws', price: 3.99, unit: 'ea.', best: false },
    ]},
  ],
  'sweet potato': [
    { id: 3, name: 'Sweet Potato', emoji: '🍠', salePercent: 29, originalPrice: 4.39, prices: [
      { chain: 'metro',    price: 1.32, unit: 'avg. ea.', best: true  },
      { chain: 'loblaws',  price: 1.45, unit: 'avg. ea.', best: false },
      { chain: 'nofrills', price: 1.55, unit: 'avg. ea.', best: false },
    ]},
  ],
  blackberries: [
    { id: 2, name: 'Blackberries 170g', emoji: '🫐', salePercent: 60, originalPrice: 4.39, prices: [
      { chain: 'metro',    price: 1.88, unit: 'ea.', best: true  },
      { chain: 'loblaws',  price: 2.49, unit: 'ea.', best: false },
      { chain: 'farmboy',  price: 2.99, unit: 'ea.', best: false },
    ]},
  ],
  chicken: [
    { id: 10, name: 'Chicken Breast Boneless 1kg', emoji: '🍗', prices: [
      { chain: 'nofrills', price: 7.99, unit: 'kg', best: true  },
      { chain: 'metro',    price: 8.99, unit: 'kg', best: false },
      { chain: 'loblaws',  price: 9.49, unit: 'kg', best: false },
    ]},
  ],
  coca: [
    { id: 5, name: 'Coca-Cola 12×355ml', emoji: '🥤', salePercent: 20, originalPrice: 9.99, prices: [
      { chain: 'metro',    price: 7.49, unit: 'ea.', best: true  },
      { chain: 'loblaws',  price: 7.99, unit: 'ea.', best: false },
      { chain: 'nofrills', price: 8.49, unit: 'ea.', best: false },
    ]},
  ],
  asparagus: [
    { id: 7, name: 'Asparagus', emoji: '🌿', salePercent: 25, originalPrice: 9.99, prices: [
      { chain: 'metro',   price: 7.48, unit: 'ea.', best: true  },
      { chain: 'farmboy', price: 7.99, unit: 'ea.', best: false },
    ]},
  ],
};

// ─── SHOPPING LIST ───
const SHOPPING_LIST = {
  metro: [
    { name: 'Sweet Potato',      emoji: '🍠', price: 1.32, qty: 2 },
    { name: 'Blackberries 170g', emoji: '🫐', price: 1.00, qty: 1 },
  ],
  nofrills: [
    { name: 'Grade A Large Eggs 12pk', emoji: '🥚', price: 7.00, qty: 1 },
    { name: 'Bananas, Bunch',          emoji: '🍌', price: 1.49, qty: 1 },
  ],
};
