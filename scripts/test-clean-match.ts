import { calculateStringSimilarity, normalizeProductName } from '@pakprice/shared';

// Define the retail noise stripping
function cleanName(name: string): string {
  return normalizeProductName(name);
}

const teleName = 'Samsung Galaxy A07 Dual Sim With Official Warranty';
const poName = 'Samsung Galaxy A07';

console.log('Old normalize teleName:', normalizeProductName(teleName));
console.log('Old normalize poName:', normalizeProductName(poName));
console.log('Old similarity:', calculateStringSimilarity(normalizeProductName(poName), normalizeProductName(teleName)));

// With retail noise cleaned:
const RETAIL_NOISE = [
  /\bdual[\s-]sim\b/gi,
  /\bwith\s+official\s+warranty\b/gi,
  /\bofficial\s+warranty\b/gi,
  /\bwith\s+1\s+year\s+warranty\b/gi,
  /\bwith\s+warranty\b/gi,
  /\b1\s+year\s+warranty\b/gi,
  /\bpta\s+approved\b/gi,
  /\bnon[\s-]pta\b/gi,
];

function newNormalize(name: string): string {
  let cleaned = name;
  for (const pat of RETAIL_NOISE) {
    cleaned = cleaned.replace(pat, ' ');
  }
  return cleaned
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\bsmart[\s-]watch\b/g, 'smartwatch');
}

const newTele = newNormalize(teleName);
const newPo = newNormalize(poName);

console.log('\nNew normalize teleName:', newTele);
console.log('New normalize poName:', newPo);
console.log('New similarity:', calculateStringSimilarity(newPo, newTele));
