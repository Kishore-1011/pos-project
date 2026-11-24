import {
  Coffee, CupSoda, IceCreamCone, Cake, Cookie, Soup, UtensilsCrossed, Pizza, Croissant, ShoppingBasket, Pill,
  Shirt, Smartphone, Wrench, Scissors, Package, Utensils, Sandwich, Salad, Milk, Wheat, Apple, Gem, BookOpen, Sprout
} from 'lucide-react';

// Designed look for items without a photo: a category colour and an icon picked from the item
// name/category (food, retail and services). A category always gets the same colour.

const PALETTES = [
  'from-amber-100 to-orange-200 text-orange-700',
  'from-rose-100 to-pink-200 text-rose-700',
  'from-emerald-100 to-teal-200 text-emerald-700',
  'from-sky-100 to-blue-200 text-blue-700',
  'from-violet-100 to-purple-200 text-violet-700',
  'from-lime-100 to-green-200 text-green-700',
  'from-yellow-100 to-amber-200 text-amber-700',
  'from-cyan-100 to-teal-200 text-teal-700'
];

const ICON_RULES = [
  [/coffee|chai|tea|espresso|latte/, Coffee],
  [/milk|lassi|shake|badam/, Milk],
  [/juice|soda|drink|beverage|cola|water|lime/, CupSoda],
  [/ice ?cream|kulfi|sundae/, IceCreamCone],
  [/dessert|sweet|jamun|kesari|halwa|payasam|cake|mithai/, Cake],
  [/biscuit|cookie|snack|samosa|puff|bajji|pakora|vada|chips/, Cookie],
  [/soup|rasam|sambar|pongal|idli|dosa|breakfast|tiffin|upma/, Soup],
  [/pizza/, Pizza],
  [/bread|bun|bakery|croissant|pastry/, Croissant],
  [/sandwich|burger|roll|wrap/, Sandwich],
  [/salad|fruit bowl/, Salad],
  [/thali|meal|rice|biryani|curry|lunch|dinner|combo/, UtensilsCrossed],
  [/grocery|grocer|kirana|staple|dal|atta|flour|grain/, Wheat],
  [/fruit|vegetable|produce/, Apple],
  [/medicine|pharma|tablet|syrup|health/, Pill],
  [/cloth|apparel|shirt|saree|garment|wear/, Shirt],
  [/mobile|phone|electronic|charger|cable/, Smartphone],
  [/repair|service|install|fix/, Wrench],
  [/salon|hair|cut|beauty|spa|groom/, Scissors],
  [/jewel|gold|silver|gem/, Gem],
  [/book|stationery|pen|notebook/, BookOpen],
  [/plant|seed|garden/, Sprout],
  [/basket|general|household/, ShoppingBasket]
];

function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** { palette: tailwind gradient+text classes, Icon: lucide component } for an item or a category. */
export function itemTileStyle(item) {
  const key = (item.category_name || item.name || '').toLowerCase();
  const palette = PALETTES[hash(key) % PALETTES.length];
  const text = `${item.name || ''} ${item.category_name || ''}`.toLowerCase();
  const rule = ICON_RULES.find(([re]) => re.test(text));
  return { palette, Icon: rule ? rule[1] : item.category_name ? Package : Utensils };
}
