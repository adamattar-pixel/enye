// Ajoute des tags thématiques aux mots de mobile/src/data/words.json qui
// n'en ont pas encore (tags: []) — demandé explicitement le 20/08/2026,
// voir AUDIT.md pour le détail de la méthode et ses limites.
//
// Heuristique par mots-clés sur la glose anglaise (`word.english`),
// PAS une vraie compréhension sémantique : chaque thème est une liste de
// mots-clés anglais, match par limite de mot (regex \b), insensible à la
// casse. Un mot peut recevoir 0, 1 ou plusieurs tags. Les mots déjà tagués
// (les 36 écrits à la main) ne sont jamais touchés.
//
// Usage : node generate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORDS_PATH = path.join(__dirname, '..', '..', 'src', 'data', 'words.json');

// Chaque thème : une liste de mots-clés anglais. Choisis pour repérer des
// mots de vocabulaire concrets et thématiquement clairs — volontairement
// PAS exhaustif sur les mots grammaticaux (prépositions, pronoms,
// conjonctions), qui n'ont pas de thème naturel et restent sans tag,
// cohérent avec ce qu'avaient déjà les 36 mots écrits à la main.
//
// `verbAmbiguous` : mots-clés retirés spécifiquement pour les verbes —
// détecté après un premier essai (voir AUDIT.md) : "hand"/"back"/"fall"
// causaient de faux positifs sur des verbes à sens phrasal ("to hand"
// = donner, "to get back" = revenir, "to fall" confondu avec la saison
// "fall"/automne), alors qu'ils restent de bons indices pour un nom
// ("mano" = hand, "espalda" = back).
const THEMES = {
  nourriture: [
    'food', 'eat', 'drink', 'fruit', 'vegetable', 'meat', 'bread', 'cook', 'cooking', 'kitchen',
    'restaurant', 'meal', 'breakfast', 'lunch', 'dinner', 'cheese', 'wine', 'beer', 'coffee', 'tea',
    'sugar', 'salt', 'pepper', 'rice', 'soup', 'egg', 'milk', 'butter', 'oil', 'fruit', 'apple',
    'orange', 'banana', 'potato', 'tomato', 'onion', 'garlic', 'chicken', 'beef', 'pork', 'fish',
    'seafood', 'dessert', 'cake', 'candy', 'chocolate', 'juice', 'water', 'flavor', 'taste', 'recipe',
    'plate', 'spoon', 'fork', 'knife', 'cup', 'bottle', 'hungry', 'thirsty', 'bakery', 'grocery',
  ],
  casa: [
    'house', 'home', 'room', 'bedroom', 'bathroom', 'kitchen', 'door', 'window', 'wall', 'roof',
    'floor', 'ceiling', 'furniture', 'table', 'chair', 'sofa', 'couch', 'bed', 'garden', 'yard',
    'key', 'lock', 'stairs', 'garage', 'apartment', 'neighbor', 'neighborhood', 'rent', 'lamp',
    'mirror', 'shelf', 'closet', 'curtain', 'carpet',
  ],
  familia: [
    'mother', 'father', 'parent', 'brother', 'sister', 'sibling', 'son', 'daughter', 'family',
    'child', 'children', 'husband', 'wife', 'spouse', 'grandmother', 'grandfather', 'grandparent',
    'uncle', 'aunt', 'cousin', 'nephew', 'niece', 'baby', 'infant', 'twin', 'relative', 'marriage',
    'wedding', 'divorce',
  ],
  cuerpo: {
    keywords: [
      'body', 'leg', 'foot', 'feet', 'eye', 'ear', 'nose', 'mouth', 'hair',
      'heart', 'blood', 'skin', 'finger', 'toe', 'tooth', 'teeth', 'stomach', 'chest', 'neck',
      'shoulder', 'knee', 'brain', 'bone', 'muscle', 'lip', 'tongue', 'nail', 'voice',
    ],
    // "head" ("to head out" = partir), "face" ("to face" = affronter),
    // "arm" ("to arm" = armer) rejoignent la même liste pour la même
    // raison.
    verbAmbiguous: ['hand', 'back', 'head', 'face', 'arm'],
  },
  salud: [
    'health', 'healthy', 'sick', 'sickness', 'illness', 'ill', 'doctor', 'hospital', 'medicine',
    'medical', 'pain', 'hurt', 'disease', 'injury', 'wound', 'pill', 'drug', 'nurse', 'patient',
    'surgery', 'therapy', 'fever', 'cough', 'cure', 'heal', 'treatment', 'symptom', 'infection',
  ],
  ropa: [
    'clothes', 'clothing', 'shirt', 'dress', 'shoe', 'shoes', 'hat', 'coat', 'pants', 'trousers',
    'skirt', 'jacket', 'sock', 'socks', 'glove', 'sweater', 'suit', 'tie', 'belt', 'scarf', 'boot',
    'wear', 'fabric', 'cotton', 'wool', 'button', 'pocket', 'sleeve',
  ],
  naturaleza: [
    'nature', 'tree', 'flower', 'forest', 'wood', 'mountain', 'river', 'sea', 'ocean', 'sky',
    'sun', 'moon', 'star', 'rain', 'snow', 'wind', 'earth', 'plant', 'grass', 'stone', 'rock',
    'lake', 'beach', 'sand', 'island', 'leaf', 'root', 'branch', 'seed', 'field', 'valley', 'hill',
    'desert', 'jungle', 'cloud', 'storm', 'thunder', 'lightning', 'ice', 'fire', 'smoke',
  ],
  animales: [
    'animal', 'dog', 'cat', 'bird', 'fish', 'horse', 'cow', 'pig', 'chicken', 'lion', 'tiger',
    'bear', 'insect', 'bug', 'snake', 'mouse', 'rat', 'rabbit', 'wolf', 'fox', 'deer', 'monkey',
    'elephant', 'sheep', 'goat', 'duck', 'frog', 'spider', 'bee', 'butterfly', 'fly', 'ant',
    'turtle', 'shark', 'whale', 'goose', 'owl', 'eagle', 'pet',
  ],
  tiempo_clima: [
    'weather', 'rain', 'sunny', 'cloud', 'cloudy', 'wind', 'windy', 'snow', 'hot', 'cold', 'warm',
    'cool', 'season', 'winter', 'summer', 'autumn', 'temperature', 'climate',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january',
    'february', 'april', 'june', 'july', 'august', 'september', 'october',
    'november', 'december',
    // "march"/"may" (mois) et "fall"/"spring" (saisons) retirés
    // entièrement, y compris pour les noms : trop souvent d'autres mots
    // anglais courants sans rapport (ex. "marcha" → "march" au sens de
    // "défilé", "fuente" → "spring" au sens de "source d'eau"), pas
    // seulement des verbes homonymes comme pour hand/back/head/face/arm.
  ],
  viaje_transporte: [
    'travel', 'trip', 'journey', 'car', 'bus', 'train', 'plane', 'airplane', 'airport', 'ticket',
    'road', 'street', 'bicycle', 'bike', 'boat', 'ship', 'station', 'drive', 'driver', 'traffic',
    'passenger', 'luggage', 'suitcase', 'map', 'tourist', 'vacation', 'hotel', 'passport', 'border',
    'highway', 'taxi', 'subway', 'flight',
  ],
  trabajo: [
    'work', 'job', 'office', 'business', 'company', 'employee', 'employer', 'boss', 'salary',
    'career', 'meeting', 'factory', 'colleague', 'coworker', 'interview', 'resume', 'contract',
    'manager', 'profession', 'industry', 'client', 'customer', 'project', 'task', 'deadline',
  ],
  escuela: [
    'school', 'student', 'teacher', 'class', 'classroom', 'book', 'study', 'university', 'college',
    'lesson', 'exam', 'test', 'homework', 'education', 'learn', 'learning', 'grade', 'degree',
    'professor', 'pupil', 'lecture', 'library', 'notebook', 'pencil', 'pen',
  ],
  tecnologia: [
    'computer', 'phone', 'telephone', 'internet', 'technology', 'screen', 'software', 'machine',
    'device', 'email', 'camera', 'website', 'app', 'application', 'digital', 'online', 'network',
    'battery', 'keyboard', 'password', 'download', 'upload', 'robot', 'video',
  ],
  dinero: [
    'money', 'price', 'buy', 'sell', 'pay', 'payment', 'cost', 'bank', 'dollar', 'euro', 'peso',
    'expensive', 'cheap', 'coin', 'rich', 'poor', 'cash', 'credit', 'debt', 'loan', 'tax', 'salary',
    'wealth', 'budget', 'invest', 'savings', 'currency',
  ],
  emociones: [
    'happy', 'happiness', 'sad', 'sadness', 'angry', 'anger', 'afraid', 'fear', 'love', 'hate',
    'joy', 'feeling', 'emotion', 'worry', 'worried', 'surprise', 'surprised', 'proud', 'pride',
    'shame', 'ashamed', 'jealous', 'nervous', 'calm', 'excited', 'excitement', 'bored', 'boredom',
    'lonely', 'anxious', 'grateful', 'hope', 'hopeful',
  ],
  deportes: {
    keywords: [
      'sport', 'team', 'ball', 'swim', 'swimming', 'football', 'soccer',
      'tennis', 'basketball', 'winner', 'race', 'player', 'coach', 'match', 'goal',
      'championship', 'gym', 'athlete', 'stadium',
      // "win"/"lose"/"game"/"run"/"running" retirés : trop génériques
      // (gagner/perdre/jeu/courir s'utilisent constamment hors contexte
      // sportif : "perdre ses clés", "jeu de mots", "courir un risque").
    ],
    // "exercise" ("ejercer" = exercer un droit, verbe) vs "ejercicio"
    // (exercice physique, nom) — même mécanisme que cuerpo.
    verbAmbiguous: ['exercise'],
  },
  ciudad: [
    'city', 'town', 'street', 'building', 'park', 'market', 'shop', 'store', 'church', 'bridge',
    'square', 'downtown', 'avenue', 'corner', 'sidewalk', 'traffic light', 'mall', 'museum',
    'library', 'hospital', 'police', 'government', 'mayor', 'citizen', 'population',
  ],
  colores: [
    'red', 'blue', 'green', 'yellow', 'black', 'white', 'color', 'colour', 'purple', 'orange',
    'pink', 'brown', 'gray', 'grey', 'silver', 'gold', 'golden',
  ],
  comunicacion: [
    'talk', 'speak', 'say', 'tell', 'word', 'language', 'conversation', 'message', 'letter', 'call',
    'write', 'writing', 'read', 'reading', 'news', 'newspaper', 'question', 'answer', 'ask',
    'listen', 'hear', 'explain', 'discuss', 'argument',
  ],
  arte_musica: [
    'music', 'song', 'sing', 'singer', 'dance', 'dancing', 'art', 'artist', 'paint', 'painting',
    'film', 'movie', 'theater', 'theatre', 'instrument', 'guitar', 'piano', 'drum', 'concert',
    'actor', 'actress', 'photo', 'photograph', 'picture', 'draw', 'drawing',
  ],
};

// Cherche chaque mot-clé comme mot entier (limites \b) dans la glose,
// insensible à la casse — évite les faux positifs grossiers (ex. "cat"
// dans "category"), sans être un vrai tokenizer linguistique.
function matchesKeyword(gloss, keyword) {
  const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return pattern.test(gloss);
}

// Locutions repérées comme sources de faux positifs lors d'une première
// passe (voir AUDIT.md) : si la glose contient la locution, le mot-clé
// correspondant est ignoré pour cette glose précise, sans le retirer du
// thème pour les autres mots où il est légitime.
const PHRASE_EXCLUSIONS = [{ phrase: 'pay attention', excludeKeyword: 'pay' }];

function themesForGloss(gloss, partOfSpeech) {
  const lowerGloss = gloss.toLowerCase();
  const excludedKeywords = new Set(
    PHRASE_EXCLUSIONS.filter((rule) => lowerGloss.includes(rule.phrase)).map((rule) => rule.excludeKeyword)
  );

  const matched = [];
  for (const [theme, definition] of Object.entries(THEMES)) {
    const keywords = Array.isArray(definition) ? definition : definition.keywords;
    const verbAmbiguous = Array.isArray(definition) ? [] : definition.verbAmbiguous ?? [];

    const usableKeywords =
      partOfSpeech === 'verbe' ? keywords : [...keywords, ...verbAmbiguous];

    if (usableKeywords.some((kw) => !excludedKeywords.has(kw) && matchesKeyword(gloss, kw))) {
      matched.push(theme);
    }
  }
  return matched;
}

function main() {
  const words = JSON.parse(fs.readFileSync(WORDS_PATH, 'utf8'));

  let untaggedCount = 0;
  let taggedCount = 0;
  const themeCounts = {};

  for (const word of words) {
    if (word.tags.length > 0) continue; // ne touche jamais un mot déjà tagué
    untaggedCount++;

    const themes = themesForGloss(word.english, word.partOfSpeech);
    if (themes.length > 0) {
      word.tags = themes;
      taggedCount++;
      for (const t of themes) themeCounts[t] = (themeCounts[t] ?? 0) + 1;
    }
  }

  fs.writeFileSync(WORDS_PATH, JSON.stringify(words, null, 2) + '\n', 'utf8');

  console.log(`${untaggedCount} mots étaient sans tag.`);
  console.log(`${taggedCount} ont reçu au moins un tag thématique (${((taggedCount / untaggedCount) * 100).toFixed(1)}%).`);
  console.log(`${untaggedCount - taggedCount} restent sans tag (mots grammaticaux/abstraits sans thème clair).`);
  console.log('');
  console.log('Répartition par thème :');
  for (const [theme, count] of Object.entries(themeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${theme.padEnd(20)} ${count}`);
  }
}

main();
