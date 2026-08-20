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
    'wedding', 'divorce', 'dad', 'mum', 'mom', 'boy', 'girl',
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

  // --- Quatre thèmes ajoutés le 20/08/2026, demande explicite de couvrir
  // les 6002 mots (pas seulement les mots "concrets" facilement
  // catégorisables). Les 20 thèmes ci-dessus laissaient ~4900 mots sans
  // tag — pas des oublis, mais des verbes/adjectifs/noms très génériques
  // ("avoir", "voir", "même", "chose", "plus") qui n'appartiennent à
  // aucun domaine concret par nature. Plutôt que de forcer ces mots dans
  // des thèmes auxquels ils n'appartiennent pas vraiment, quatre
  // nouveaux thèmes plus larges couvrent ces champs sémantiques
  // fréquents mais transversaux — toujours de l'appariement par
  // mot-clé, pas une vraie compréhension du sens.
  cualidades: [
    'same', 'different', 'better', 'best', 'worse', 'worst', 'good', 'bad', 'great', 'true', 'false',
    'real', 'clear', 'obvious', 'possible', 'impossible', 'difficult', 'hard', 'easy', 'simple',
    'strong', 'weak', 'fast', 'quick', 'slow', 'rapid', 'young', 'old', 'new', 'ancient', 'tall',
    'short', 'long', 'wide', 'narrow', 'deep', 'high', 'low', 'big', 'small', 'large', 'little',
    'huge', 'tiny', 'heavy', 'light', 'soft', 'hard', 'sharp', 'smooth', 'rough', 'clean', 'dirty',
    'safe', 'dangerous', 'useful', 'useless', 'comfortable', 'capable', 'able', 'unable', 'ready',
    'tired', 'awake', 'calm', 'quiet', 'loud', 'bright', 'dark', 'wet', 'dry', 'empty', 'full',
    'open', 'closed', 'free', 'busy', 'careful', 'careless', 'kind', 'cruel', 'gentle', 'strict',
    'honest', 'brave', 'shy', 'proud', 'humble', 'generous', 'selfish', 'polite', 'rude', 'friendly',
    'wise', 'foolish', 'clever', 'smart', 'stupid', 'idiotic', 'crazy', 'sane', 'normal', 'strange',
    'unusual', 'weird', 'odd', 'special', 'ordinary', 'common', 'rare', 'perfect', 'necessary',
    'sufficient', 'enough', 'important', 'main', 'principal', 'particular', 'certain', 'various',
    'exact', 'natural', 'typical', 'usual', 'wrong', 'correct', 'right', 'united', 'equal', 'similar',
    'beautiful', 'pretty', 'gorgeous', 'handsome', 'lovely', 'ugly', 'cursed', 'blessed', 'sacred',
    'public', 'private', 'official', 'personal', 'social', 'national', 'international', 'local',
    'general', 'specific', 'total', 'complete', 'incomplete', 'final', 'first', 'second', 'last',
    'next', 'previous', 'following', 'current', 'former', 'alive', 'dead', 'human', 'physical',
    'mental', 'emotional', 'spiritual', 'legal', 'illegal', 'moral', 'ethical', 'fair', 'unfair',
    // Ajoutés lors d'une deuxième passe (échantillon du "divers" trop
    // gros, voir AUDIT.md) : adjectifs fréquents encore manqués.
    'economic', 'married', 'divorced', 'engaged', 'superior', 'inferior', 'external', 'internal',
    'commercial', 'original', 'plain', 'firm', 'recent', 'electoral', 'democratic', 'ideal',
    'disgusting', 'independent', 'collective', 'intellectual', 'continual', 'constant', 'urban',
    'rural', 'voluntary', 'delicate', 'learned', 'educated', 'significant', 'divine', 'universal',
    'intimate', 'literary', 'diplomatic', 'humid', 'tender', 'affectionate', 'tragic', 'outstanding',
    'specialized', 'unhappy', 'homosexual', 'obsessed', 'realistic', 'vulnerable', 'trained', 'tight',
    'considerable', 'absent', 'ardent', 'potent', 'portable', 'integral', 'fierce', 'competitive',
    'elemental', 'celebrated', 'tropical', 'exotic', 'provisional', 'salty', 'distracted', 'legendary',
    'talented', 'formidable', 'hypocritical', 'restricted', 'thematic', 'systematic', 'continental',
    'humiliated', 'informal', 'formal', 'prestigious', 'eminent', 'famous', 'technical', 'maximum',
    'minimum', 'presented', 'beloved', 'protected', 'covered', 'invited', 'adjusted', 'guaranteed',
    'located', 'wanted', 'honored', 'domestic', 'foreign',
  ],
  acciones_comunes: [
    'have', 'be', 'see', 'know', 'believe', 'think', 'feel', 'seem', 'look', 'watch', 'give', 'take',
    'get', 'put', 'set', 'leave', 'pass', 'need', 'want', 'wish', 'meet', 'return', 'come', 'go',
    'arrive', 'depart', 'enter', 'exit', 'follow', 'lead', 'understand', 'realize', 'kill', 'die',
    'live', 'seek', 'search', 'find', 'lose', 'win', 'help', 'assist', 'finish', 'end', 'begin',
    'start', 'continue', 'stop', 'wait', 'try', 'attempt', 'achieve', 'succeed', 'fail', 'bring',
    'carry', 'matter', 'remember', 'forget', 'change', 'switch', 'alter', 'use', 'keep', 'hold',
    'count', 'gain', 'obtain', 'open', 'close', 'play', 'happen', 'occur', 'allow', 'permit',
    'forbid', 'receive', 'accept', 'refuse', 'reject', 'sleep', 'wake', 'fall', 'rise', 'send',
    'deliver', 'make', 'do', 'create', 'produce', 'build', 'construct', 'destroy', 'break', 'fix',
    'repair', 'cut', 'hit', 'push', 'pull', 'throw', 'catch', 'drop', 'save', 'spend', 'waste',
    'show', 'hide', 'appear', 'disappear', 'turn', 'move', 'stand', 'sit', 'lie', 'walk', 'run',
    'jump', 'climb', 'fly', 'swim', 'stay', 'remain', 'exist', 'become', 'let', 'call', 'name',
    'decide', 'choose', 'select', 'prefer', 'agree', 'disagree', 'accept', 'deny', 'admit', 'confess',
    'promise', 'guarantee', 'warn', 'suggest', 'recommend', 'advise', 'offer', 'invite', 'thank',
    'apologize', 'forgive', 'blame', 'punish', 'reward', 'protect', 'defend', 'attack', 'fight',
    'compete', 'cooperate', 'share', 'divide', 'join', 'separate', 'connect', 'combine', 'mix',
    'add', 'remove', 'increase', 'decrease', 'grow', 'reduce', 'improve', 'worsen', 'affect',
    'influence', 'control', 'manage', 'organize', 'plan', 'prepare', 'arrange', 'solve', 'cause',
    // Ajoutés lors d'une deuxième passe (verbes fréquents encore manqués).
    'owe', 'lift', 'report', 'prove', 'reach', 'signal', 'mention', 'commit', 'cover', 'smell',
    'celebrate', 'survive', 'breathe', 'constitute', 'doubt', 'conquer', 'mount', 'greet', 'drag',
    'install', 'acquire', 'insert', 'shine', 'transmit', 'broadcast', 'bury', 'provide', 'supply',
    'imply', 'implicate', 'tour', 'block', 'lament', 'regret', 'rescue', 'kick', 'found', 'justify',
    'criticize', 'tire', 'transport', 'program', 'subdue', 'arm', 'dictate', 'entertain', 'distract',
    'condemn', 'distribute', 'displace', 'tolerate', 'inhale', 'spread', 'disseminate', 'formulate',
    'design', 'inscribe', 'triumph', 'abuse', 'betray', 'spill', 'leak', 'detach', 'detest', 'loathe',
    'proclaim', 'remit', 'pardon', 'reside', 'settle', 'inhabit', 'whisper', 'accommodate', 'expand',
    'sigh', 'generalize', 'poison', 'imprison', 'incarcerate', 'resuscitate', 'plough', 'plow',
    'update', 'relate', 'diagnose', 'appeal', 'subscribe', 'stamp', 'envy', 'peel', 'whip', 'flog',
    'encourage', 'animate', 'collect', 'raise', 'invoke', 'replicate', 'scare', 'spook', 'frighten',
    'coordinate', 'blackmail', 'hook', 'pretend', 'feign', 'medicate', 'double', 'assign', 'award',
    'grant', 'preach', 'confront', 'face', 'ruin', 'spoil', 'sprinkle', 'touch', 'teach', 'discover',
    'marry', 'wed', 'rob', 'detain', 'seat', 'signify', 'lift',
  ],
  pensamiento_sociedad: [
    'time', 'thing', 'truth', 'agreement', 'people', 'person', 'problem', 'issue', 'place', 'kind',
    'type', 'sort', 'case', 'name', 'shape', 'reason', 'idea', 'thought', 'mind', 'past', 'present',
    'future', 'country', 'nation', 'history', 'way', 'manner', 'point', 'end', 'reality', 'group',
    'relation', 'relationship', 'right', 'fact', 'situation', 'condition', 'system', 'process',
    'method', 'purpose', 'meaning', 'value', 'quality', 'level', 'form', 'part', 'side', 'world',
    'life', 'death', 'war', 'peace', 'power', 'freedom', 'justice', 'law', 'rule', 'order', 'society',
    'culture', 'government', 'politics', 'religion', 'belief', 'faith', 'opinion', 'decision', 'plan',
    'goal', 'dream', 'memory', 'experience', 'knowledge', 'information', 'news', 'story', 'example',
    'result', 'effect', 'cause', 'difference', 'similarity', 'comparison', 'opportunity', 'chance',
    'risk', 'danger', 'security', 'responsibility', 'duty', 'permission', 'promise', 'secret',
    'mystery', 'question', 'answer', 'solution', 'challenge', 'success', 'failure', 'effort',
    'attempt', 'progress', 'development', 'change', 'growth', 'crisis', 'conflict', 'peace', 'unity',
    'community', 'population', 'generation', 'tradition', 'custom', 'habit', 'behavior', 'attitude',
    'personality', 'character', 'identity', 'status', 'role', 'position', 'rank', 'title', 'honor',
    'respect', 'pride', 'shame', 'guilt', 'blame', 'praise', 'criticism', 'advantage', 'disadvantage',
    'benefit', 'harm', 'damage', 'loss', 'gain', 'profit',
    // Ajoutés lors d'une deuxième passe (noms abstraits/sociaux fréquents
    // encore manqués — professions, institutions, évènements de vie).
    'advice', 'counsel', 'confidence', 'trust', 'recognition', 'creation', 'discovery', 'probability',
    'formula', 'perfection', 'innovation', 'diversity', 'victory', 'accident', 'birthday', 'suicide',
    'pregnancy', 'terrorism', 'exile', 'fraud', 'reflection', 'provision', 'legislation', 'restriction',
    'correction', 'complaint', 'invention', 'insecurity', 'inquietude', 'restlessness', 'force',
    'proof', 'sense', 'step', 'footstep', 'service', 'director', 'candidate', 'investment', 'executive',
    'license', 'patrol', 'embassy', 'commissioner', 'organizer', 'militant', 'foreigner', 'farmer',
    'painter', 'champion', 'friend', 'boyfriend', 'girlfriend', 'introduction', 'suggestion', 'tactic',
    'maneuver', 'homage', 'tribute', 'shelter', 'refuge', 'hearing', 'announcement', 'rumor', 'design',
    'scenario', 'province', 'volume', 'metal', 'fuel', 'smell', 'scent', 'odor', 'receipt', 'launch',
  ],
  cantidad_tiempo: [
    'more', 'less', 'much', 'many', 'little', 'few', 'most', 'least', 'all', 'some', 'none', 'every',
    'each', 'several', 'both', 'either', 'neither', 'enough', 'here', 'there', 'now', 'then', 'today',
    'yesterday', 'tomorrow', 'tonight', 'later', 'earlier', 'before', 'after', 'soon', 'already',
    'still', 'yet', 'never', 'always', 'sometimes', 'often', 'rarely', 'usually', 'again', 'once',
    'twice', 'forever', 'meanwhile', 'suddenly', 'immediately', 'finally', 'eventually', 'recently',
    'currently', 'nowadays', 'when', 'where', 'how', 'why', 'above', 'below', 'behind', 'inside',
    'outside', 'near', 'far', 'close', 'around', 'forward', 'backward', 'up', 'down', 'ahead',
    'beyond', 'within', 'throughout', 'during', 'while', 'until', 'since', 'quite', 'rather', 'fairly',
    'almost', 'nearly', 'barely', 'scarcely', 'exactly', 'totally', 'completely', 'entirely', 'partly',
    'perhaps', 'maybe', 'probably', 'certainly', 'definitely', 'possibly', 'week', 'month', 'year',
    'hour', 'minute', 'second', 'day', 'night', 'morning', 'afternoon', 'evening', 'moment', 'instant',
    'period', 'century', 'decade', 'number', 'million', 'thousand', 'hundred', 'half', 'quarter',
    'pair', 'dozen',
  ],
};

// Catégories grammaticales pures (prépositions, pronoms, articles,
// déterminants, conjonctions, contractions, interjections) — aucun
// mot-clé ne peut leur donner un thème "concret" par nature (ce ne sont
// pas des mots de vocabulaire au sens topique du terme), donc tagués
// directement par `partOfSpeech` plutôt que par correspondance de glose.
// Les "nombres" (un/deux/premier...) suivent la même logique : leur
// glose est le chiffre lui-même, pas un mot-clé thématique à chercher.
const PART_OF_SPEECH_THEMES = {
  préposition: 'grammaire',
  pronom: 'grammaire',
  article: 'grammaire',
  déterminant: 'grammaire',
  conjonction: 'grammaire',
  contraction: 'grammaire',
  interjection: 'grammaire',
  nombre: 'nombres',
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

  // Repli par suffixe pour les adverbes de manière en "-ly" (quickly,
  // seriously, publicly...) — dérivés d'un adjectif, donc rattachés à
  // "cualidades" plutôt qu'énumérés un par un (il y en a des centaines
  // dans le vocabulaire généré). Repéré lors d'une deuxième passe :
  // l'immense majorité du "divers" restant chez les adverbes suivait ce
  // seul motif. `\w+ly\b` sur le premier mot de la glose seulement (pas
  // toute la glose, pour éviter de matcher un synonyme accessoire après
  // une virgule qui ne serait pas un adverbe en -ly).
  if (matched.length === 0 && partOfSpeech === 'adverbe') {
    const firstWord = lowerGloss.split(/[ ,(]/)[0];
    if (/^\w+ly$/.test(firstWord) && firstWord.length > 3) {
      matched.push('cualidades');
    }
  }

  return matched;
}

function main() {
  const words = JSON.parse(fs.readFileSync(WORDS_PATH, 'utf8'));

  let untaggedCount = 0;
  let taggedByKeyword = 0;
  let taggedByPartOfSpeech = 0;
  let taggedByFallback = 0;
  const themeCounts = {};

  for (const word of words) {
    if (word.tags.length > 0) continue; // ne touche jamais un mot déjà tagué
    untaggedCount++;

    // 1. Catégorie grammaticale pure → thème direct, pas de mot-clé à chercher.
    const posTheme = PART_OF_SPEECH_THEMES[word.partOfSpeech];
    if (posTheme) {
      word.tags = [posTheme];
      taggedByPartOfSpeech++;
      themeCounts[posTheme] = (themeCounts[posTheme] ?? 0) + 1;
      continue;
    }

    // 2. Correspondance par mot-clé sur la glose anglaise (24 thèmes).
    const themes = themesForGloss(word.english, word.partOfSpeech);
    if (themes.length > 0) {
      word.tags = themes;
      taggedByKeyword++;
      for (const t of themes) themeCounts[t] = (themeCounts[t] ?? 0) + 1;
      continue;
    }

    // 3. Dernier recours — demandé explicitement le 20/08/2026 ("les 6002
    // mots doivent avoir un thème") : les ~24 thèmes ci-dessus, même
    // élargis, ne couvrent pas historiquement 100% du vocabulaire (des
    // gloses très spécifiques ou composées peuvent n'y matcher aucun
    // mot-clé). `divers` garantit qu'AUCUN mot ne reste sans tag, mais ce
    // n'est PAS un vrai thème sémantique — juste un filet de sécurité,
    // documenté comme tel plutôt que caché. Voir AUDIT.md pour le nombre
    // réel de mots concernés : si ce nombre est élevé, c'est un signal
    // qu'il faudrait élargir encore les listes de mots-clés plutôt que
    // s'appuyer sur ce filet.
    word.tags = ['divers'];
    taggedByFallback++;
    themeCounts.divers = (themeCounts.divers ?? 0) + 1;
  }

  fs.writeFileSync(WORDS_PATH, JSON.stringify(words, null, 2) + '\n', 'utf8');

  const totalTagged = taggedByKeyword + taggedByPartOfSpeech + taggedByFallback;
  console.log(`${untaggedCount} mots étaient sans tag.`);
  console.log(`${totalTagged} ont maintenant un tag (${((totalTagged / untaggedCount) * 100).toFixed(1)}%) — ${taggedByKeyword} par mot-clé, ${taggedByPartOfSpeech} par catégorie grammaticale, ${taggedByFallback} par le filet de sécurité "divers".`);
  console.log('');
  console.log('Répartition par thème :');
  for (const [theme, count] of Object.entries(themeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${theme.padEnd(20)} ${count}`);
  }
}

main();
