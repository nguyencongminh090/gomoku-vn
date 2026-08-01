'use strict';

/**
 * profanity-filter.js — Lightweight VI/EN chat profanity filter.
 *
 * UMD-style module: `require()`-able from server (CommonJS) and side-effect
 * `import`-able from the browser (ES module), attaching to `globalThis` there.
 *
 * Vietnamese dictionary data (VI_BADWORDS below) is vendored from
 * TheQuantumCrew/viet_badwords_filter_python (WTFPL — public domain-equivalent,
 * no attribution/permission required), specifically its
 * `viet_badwords_filter/badwords_list.py`, with a curation pass on top:
 * entries that are common, benign Vietnamese words/phrases on their own —
 * only vulgar as a euphemism in context — were removed: "má" ("mom"/"cheek");
 * "vãi"/"vãi l" (an everyday casual intensifier, "vui vãi"/"đẹp vãi"); "cái
 * lon"/"cai lon" (a can — "cái lon nước ngọt" = "a can of soda", "cái" is
 * the single most common Vietnamese noun classifier); "cái lờ" (a bamboo
 * fish trap); "sấp mặt" (a very ordinary idiom — "ngã sấp mặt" = "fell flat
 * on your face", "làm sấp mặt" = "worked to exhaustion" — not inherently
 * vulgar); "bỏ mẹ"/"thấy mẹ" and their spelling variants (everyday casual
 * intensifiers, "mệt bỏ mẹ"/"mệt thấy mẹ" ~ "damn tired", same family as
 * "vãi" — product decision). "lờ" and "con mẹ" were reviewed and kept
 * deliberately (product decision: skew tục enough on their own to outweigh
 * their benign readings — "lờ" = "to ignore" as a verb; "con mẹ" = neutral
 * "the mother/that woman" as a noun phrase). The genuinely vulgar
 * multi-word phrases these euphemisms originated from ("đù má", "vãi lồn",
 * "vãi cả lồn", "con lon", "con mẹ mày", etc.) are separate array entries
 * and are unaffected. The Telex mapping table (VN_TELEX_MAP) is vendored
 * from hoangnguyennn/vn2telex (ISC license). Only data was
 * reused from either source; the matching algorithm in this file is an
 * original implementation.
 *
 * Pipeline (each stage independently callable/testable):
 *   normalizeToken  → per-token lowercase/diacritic/leet/repeat normalization
 *   toTelex         → encodes an accented word into Telex spelling, used at
 *                     dictionary-build time so literal un-decoded Telex
 *                     typing (IME off — e.g. "loofn" for "lồn") exact-matches
 *   tokenize        → splits raw text into tokens with original-text offsets
 *   buildCandidates → word tokens + overlapping n-grams (multi-word phrases,
 *                     and glued single-letter runs like "c u c" → "cuc")
 *   buildDictionary → indexes a wordlist for fast lookup/scoring
 *   scoreCandidate / scoreToneAware → exact + bounded edit-distance match
 *   classifierSaysReal → optional reject-stage for fuzzy (non-exact) matches
 *                     only, backed by a small char-n-gram linear model
 *                     (see tools/profanity-training/); degrades to a no-op
 *                     if profanity-classifier-model.js isn't loaded
 *   maskMessage     → replaces matched spans with asterisks, same length,
 *                     preserving everything else (whitespace, punctuation,
 *                     total message length)
 *   filterMessage   → orchestrates the full pipeline
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ProfanityFilter = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // ── Dictionaries ────────────────────────────────────────────────────────

  // Vendored verbatim from TheQuantumCrew/viet_badwords_filter_python
  // (viet_badwords_filter/badwords_list.py), WTFPL license.
  var VI_BADWORDS = [
    'địt', 'dit', 'đit', 'địt mẹ', 'dit chi may', 'ditchimay', 'dit me',
    'dit me may', 'dit con me may', 'địtconmẹmày', 'ditconmemay', 'địtconmẹ',
    'ditconme', 'đm', 'dm', 'đmm', 'dmm', 'đcm', 'dcm', 'dkm', 'dkmm', 'đkm',
    'đkmm', 'đờ mờ', 'đê ca mờ', 'đéo', 'cmm', 'con me may', 'conmemay',
    'con mẹ mày', 'con mặt lồn', 'thằng mặt lồn', 'đệch', 'đệt', 'dis', 'diz',
    'đjt', 'djt', 'đis', 'ditmemayconcho', 'ditmemay', 'ditmethangoccho',
    'ditmeconcho', 'dmconcho', 'dmcs', 'ditmecondi', 'ditmecondicho',
    'con cặc', 'cặc', 'cac', 'lon', 'loz', 'lozz', 'cacc', 'concac', 'concu',
    'cailon', 'lồn', 'lồng', 'lờ', 'mọe', 'buồi', 'cu', 'cứt',
    'con mẹ', 'vãi lồn', 'vl', 'vãi cả lồn', 'vcl', 'vãi cặc', 'vãi lồng',
    'vãi lìn', 'vãi con cặc', 'vcc', 'như cái lồn', 'như con cặc',
    'chịch', 'lếu lều', 'liếm lồn', 'bú cu', 'xoạc', 'mặt lồn', 'mặt lờ', 'đầu buồi',
    'đồ khỉ', 'cailonmemay', 'cailonme', 'thangmatlon', 'buoi', 'dau buoi',
    'daubuoi', 'caidaubuoi', 'nhucaidaubuoi', 'dau boi', 'bòi', 'dauboi',
    'caidauboi', 'đầu bòy', 'đầu bùi', 'dau boy', 'dauboy', 'caidauboy', 'b`',
    'cak', 'kak', 'kac', 'concak', 'nungcak', 'bucak', 'caiconcac',
    'caiconcak', 'cặk', 'dái', 'giái', 'zái', 'kiu', 'cuccut', 'cutcut',
    'cứk', 'cuk', 'cười ỉa', 'cười ẻ', 'đếch', 'đếk', 'dek', 'đết', 'đách',
    'dech', "đ'", 'deo', "d'", 'đel', 'đél', 'del', 'dell', 'dellhieukieugi',
    'dellnoinhieu', 'deohieukieugi', 'đụ', 'đụ mẹ', 'đụ mịa', 'đụ mịe',
    'đụ má', 'đụ cha', 'đụ bà', 'đú cha', 'đú con mẹ', 'đú má', 'đú mẹ',
    'đù cha', 'đù má', 'đù mẹ', 'đù mịe', 'đù mịa', 'đủ cha', 'đủ má',
    'đủ mẹ', 'đủ mé', 'đủ mía', 'đủ mịa', 'đủ mịe', 'đủ mie', 'đủ mia', 'đìu',
    'đê mờ', 'đờ ma ma', 'đờ mama', 'đê mama', 'đề mama', 'đê ma ma',
    'đề ma ma', 'dou', 'doma', 'duoma', 'dou má', 'duo má', 'dou ma',
    'đou má', 'đìu má', 'á đù', 'á đìu', 'đậu mẹ', 'đậu má', 'đĩ', 'di~',
    'đuỹ', 'điếm', 'cđĩ', 'cdi~', 'đilol', 'điloz', 'đilon', 'diloz', 'dilol',
    'dilon', 'condi', 'condi~', 'dime', 'di me', 'dimemay', 'condime',
    'condimay', 'condimemay', 'con di cho', "con di cho'", 'condicho',
    'bitch', 'biz', 'bít chi', 'con bích', 'con bic', 'con bíc', 'con bít',
    'phò', '4`', 'l`', 'lìn', 'nulo', 'ml', 'matlon', 'matlol', 'matloz',
    'thml', 'thangml', 'đỗn lì', 'tml', 'diml', 'dml', 'hãm', 'xàm lol',
    'xam lol', 'xạo lol', 'xao lol', 'con lol', 'ăn lol', 'an lol',
    'mát lol', 'mat lol', 'cái lol', 'cai lol', 'lòi lol', 'loi lol',
    'ham lol', 'củ lol', 'cu lol', 'ngu lol', 'tuổi lol', 'tuoi lol',
    'mõm lol', 'mồm lol', 'mom lol', 'như lol', 'nhu lol', 'nứng lol',
    'nung lol', 'nug lol', 'nuglol', 'rảnh lol', 'ranh lol', 'đách lol',
    'dach lol', 'mu lol', 'banh lol', 'tét lol', 'tet lol', 'vạch lol',
    'vach lol', 'cào lol', 'cao lol', 'tung lol', 'mặt lol', 'xàm lon',
    'xam lon', 'xạo lon', 'xao lon', 'con lon', 'ăn lon', 'an lon',
    'mát lon', 'mat lon', 'lòi lon', 'loi lon',
    'ham lon', 'củ lon', 'cu lon', 'ngu lon', 'tuổi lon', 'tuoi lon',
    'mõm lon', 'mồm lon', 'mom lon', 'như lon', 'nhu lon', 'nứng lon',
    'nung lon', 'nug lon', 'nuglon', 'rảnh lon', 'ranh lon', 'đách lon',
    'dach lon', 'mu lon', 'banh lon', 'tét lon', 'tet lon', 'vạch lon',
    'vach lon', 'cào lon', 'cao lon', 'tung lon', 'mặt lon', 'cl',
    'clgt', 'cờ lờ gờ tờ', 'cái lề gì thốn', 'đốn cửa lòng', 'sml',
    'sapmatlol', 'sapmatlon', 'sapmatloz', 'vlon',
    'vloz', 'vlol', 'vailon', 'vai lon', 'vai lol', 'vailol', 'nốn lừng',
    'vleu', 'chich', 'v~', 'nứng', 'nug', 'đút đít', 'chổng mông',
    'banh háng', 'xéo háng', 'xhct', 'xephinh', 'la liếm', 'đổ vỏ', 'xoac',
    'chich choac', 'húp sò', 'fuck', 'fck', 'bỏ bú', 'buscu', 'ngu',
    'óc chó', 'occho', 'lao cho', 'láo chó', 'bố láo', 'chó má', 'cờ hó',
    'sảng', 'thằng chó', "thang cho'", 'thang cho', 'chó điên', 'thằng điên',
    'thang dien', 'đồ điên', 'sủa bậy', 'sủa tiếp', 'sủa đi', 'sủa càn',
    'mẹ bà', 'mẹ cha mày', 'me cha may', 'mẹ cha anh', 'mẹ cha nhà anh',
    'mẹ cha nhà mày', 'me cha nha may', 'mả cha mày', 'mả cha nhà mày',
    'ma cha may', 'ma cha nha may', 'mả mẹ', 'mả cha', 'kệ mẹ', 'kệ mịe',
    'kệ mịa', 'kệ mje', 'kệ mja', 'ke me', 'ke mie', 'ke mia', 'ke mja',
    'ke mje', 'chetme', 'chet me', 'chết mẹ',
    'chết mịa', 'chết mja', 'chết mịe', 'chết mie', 'chet mia', 'chet mie',
    'chet mja', 'chet mje', 'tổ cha', 'bà cha mày', 'cmn', 'cmnl',
  ];

  // Small curated English list (kept short on purpose — see constraint against
  // over-blocking short/common words). Extend independently of the VI list.
  var EN_BADWORDS = [
    'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch',
    'asshole', 'dick', 'pussy', 'cunt', 'bastard', 'slut', 'whore', 'cock',
    'nigger', 'nigga', 'faggot', 'fag', 'retard', 'twat', 'wanker',
    'douchebag', 'douche', 'prick', 'jackass', 'dumbass', 'cocksucker',
    'piss off', 'jerk off', 'skank', 'slutty', 'shithead', 'dipshit',
    'asswipe',
  ];

  // ── Config ──────────────────────────────────────────────────────────────

  var DEFAULT_THRESHOLD = 0.25;     // max normalized edit-distance ratio to count as a match
  // Tokens shorter than this require an EXACT match — no fuzzy. Vietnamese
  // has a dense inventory of short monosyllables sharing a rime (e.g. xong,
  // phong, cong, mong, trong, khong all sit at edit-distance 1 of each
  // other), so a bare rule-based floor had to sit at 6 to avoid flagging
  // ordinary words. Lowered to 4 now that classifierSaysReal() acts as a
  // reject-stage backstop on exactly this zone — see tools/profanity-training/.
  var MIN_TOKEN_LENGTH_FOR_FUZZY = 4;
  var MAX_NGRAM = 3;                // widest multi-word phrase window to build

  // Diacritic-stripped forms that collide with common, everyday Vietnamese
  // words once accents are removed (e.g. "các" → "cac", also a slur; "dài" →
  // "dai"; "phở" → "pho"). Excluding them from the *stripped-form* dictionary
  // avoids flagging ordinary unaccented Vietnamese text — see the
  // `hasVietnameseDiacritics` split below for why this is the only place
  // these collide (a properly-accented "các"/"dài"/"phở" never reaches this
  // index at all). Accepts reduced recall on these specific words when typed
  // *without* accents as the deliberate trade-off for not over-blocking.
  // Also covers plain English words that happen to collide once Vietnamese
  // diacritics are stripped from an unrelated slur ("long" ~ "lồng", "cut" ~
  // "cứt", "sang" ~ "sảng") — this is a bilingual chat, so those are real risk.
  var STRIPPED_DICT_EXCLUDE = new Set([
    'lo', 'me', 'ma', 'di', 'du', 'cu', 'cac', 'lon', 'dai', 'pho', 'boi',
    'ham', 'buoi', 'duy', 'deo', 'long', 'cut', 'sang',
  ]);

  // ── Stage 1: normalize ─────────────────────────────────────────────────

  var LEET_MAP = {
    '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's',
    '7': 't', '8': 'b', '@': 'a', '$': 's', '+': 't', '|': 'l',
  };

  // Per-character Telex mapping, vendored from hoangnguyennn/vn2telex
  // (ISC license). Catches a real, common case: a user typing in Telex
  // (the standard Vietnamese IME scheme) with their IME OFF, so what lands
  // in the chat box is the literal raw key sequence — e.g. "loofn" for
  // "lồn" — which is neither properly accented nor plain diacritic-free
  // ASCII, so it doesn't match either existing path.
  var VN_TELEX_MAP = {
    'á': 'as', 'à': 'af', 'ả': 'ar', 'ã': 'ax', 'ạ': 'aj',
    'ắ': 'aws', 'ằ': 'awf', 'ẳ': 'awr', 'ẵ': 'awx', 'ặ': 'awj', 'ă': 'aw',
    'ấ': 'aas', 'ầ': 'aaf', 'ẩ': 'aar', 'ẫ': 'aax', 'ậ': 'aaj', 'â': 'aa',
    'đ': 'dd',
    'é': 'es', 'è': 'ef', 'ẻ': 'er', 'ẽ': 'ex', 'ẹ': 'ej',
    'ế': 'ees', 'ề': 'eef', 'ể': 'eer', 'ễ': 'eex', 'ệ': 'eej', 'ê': 'ee',
    'í': 'is', 'ì': 'if', 'ỉ': 'ir', 'ĩ': 'ix', 'ị': 'ij',
    'ó': 'os', 'ò': 'of', 'ỏ': 'or', 'õ': 'ox', 'ọ': 'oj',
    'ố': 'oos', 'ồ': 'oof', 'ổ': 'oor', 'ỗ': 'oox', 'ộ': 'ooj', 'ô': 'oo',
    'ớ': 'ows', 'ờ': 'owf', 'ở': 'owr', 'ỡ': 'owx', 'ợ': 'owj', 'ơ': 'ow',
    'ú': 'us', 'ù': 'uf', 'ủ': 'ur', 'ũ': 'ux', 'ụ': 'uj',
    'ứ': 'uws', 'ừ': 'uwf', 'ử': 'uwr', 'ữ': 'uwx', 'ự': 'uwj', 'ư': 'uw',
    'ý': 'ys', 'ỳ': 'yf', 'ỷ': 'yr', 'ỹ': 'yx', 'ỵ': 'yj',
  };

  /**
   * Encode a lowercase, precomposed-accented (NFC) Vietnamese string into
   * its Telex spelling. Non-Vietnamese characters pass through unchanged.
   * @param {string} lowerNFC
   * @returns {string}
   */
  function toTelex(lowerNFC) {
    var out = '';
    for (var i = 0; i < lowerNFC.length; i++) {
      var ch = lowerNFC[i];
      out += VN_TELEX_MAP.hasOwnProperty(ch) ? VN_TELEX_MAP[ch] : ch;
    }
    return out;
  }

  function stripDiacritics(str) {
    return str
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

  function stripPunctuation(str) {
    return str.replace(/[^\p{L}\p{N}]/gu, '');
  }

  function applyLeetMap(str) {
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      out += LEET_MAP.hasOwnProperty(ch) ? LEET_MAP[ch] : ch;
    }
    return out;
  }

  function collapseRepeats(str) {
    return str.replace(/(.)\1+/g, '$1');
  }

  /**
   * True if `str` carries any Vietnamese tone/vowel diacritic (or đ/Đ).
   * Used to decide whether a token was typed with proper accents (compare
   * against the tone-aware dictionary) or typed as plain ASCII (compare
   * against the diacritic-stripped dictionary) — the two paths use different
   * distance models, see decomposeUnits() for why.
   * @param {string} str
   */
  function hasVietnameseDiacritics(str) {
    if (/đ/i.test(str)) return true;
    return /[̀-ͯ]/.test(str.normalize('NFD'));
  }

  // Vietnamese combining marks split into two linguistically distinct groups:
  //  - TONE_CODE: the tone (thanh điệu) — huyền/sắc/hỏi/ngã/nặng. Changing only
  //    this changes the word's MEANING (buổi ≠ buồi), so it must be penalized
  //    heavily when fuzzy-matching, unlike an ordinary typo.
  //  - vowel-identity marks (circumflex/breve/horn: â ă ê ô ơ ư) are treated as
  //    part of the letter itself, not tone — substituting them costs the same
  //    as any other letter substitution.
  var TONE_CODE = {
    '̀': 1, // huyền
    '́': 2, // sắc
    '̉': 3, // hỏi
    '̃': 4, // ngã
    '̣': 5, // nặng
  };
  // Applies both to a tone-only difference (buổi vs buồi) and a
  // vowel-*identity*-only difference within the same base-letter family
  // (ă vs â vs a; ê vs e; ô vs ơ vs o; ư vs u) — both change the word's
  // meaning, unlike an ordinary consonant substitution/typo (cost 1).
  // NOTE: standard edit-distance DP can always route around an expensive
  // substitution as a delete+insert pair (cost 1+1=2), so any value above 2
  // has no additional effect here — 2 is the real, enforced penalty.
  var ACCENT_MARK_PENALTY = 2;

  /**
   * Decompose an already punctuation-stripped, lowercase token into a
   * sequence of {sym, tone} units — one per visible letter, with the tone
   * mark (if any) split out. `sym` keeps vowel-identity marks (â/ă/ê/ô/ơ/ư)
   * composed back in via NFC, and folds đ → d. đ carries no tone.
   * @param {string} accentedToken - output of stripPunctuation(lowerNFC)
   * @returns {Array<{sym: string, tone: number}>}
   */
  function decomposeUnits(accentedToken) {
    var nfd = accentedToken.normalize('NFD');
    var units = [];
    var pendingBase = null;
    var pendingQualifiers = '';
    var pendingTone = 0;

    function flush() {
      if (pendingBase === null) return;
      var sym = pendingBase === 'đ' ? 'd' : (pendingBase + pendingQualifiers).normalize('NFC');
      units.push({ sym: sym, tone: pendingTone });
      pendingBase = null;
      pendingQualifiers = '';
      pendingTone = 0;
    }

    for (var i = 0; i < nfd.length; i++) {
      var ch = nfd[i];
      if (TONE_CODE.hasOwnProperty(ch)) {
        pendingTone = TONE_CODE[ch];
      } else if (/[̛̂̆]/.test(ch)) {
        // circumflex (U+0302), breve (U+0306), horn (U+031B) — vowel identity
        pendingQualifiers += ch;
      } else {
        flush();
        pendingBase = ch;
      }
    }
    flush();
    return units;
  }

  function unitsToneKey(units) {
    return units.map(function (u) { return u.sym + u.tone; }).join('|');
  }

  /**
   * Normalize a single raw token into matchable forms.
   * @param {string} rawToken
   * @returns {{basic: string, tight: string, accented: string, hasDiacritics: boolean, letters: number}}
   */
  function normalizeToken(rawToken) {
    var lowerNFC = rawToken.normalize('NFC').toLowerCase();

    // "accented": letters/digits only, diacritics preserved — used to match
    // a token that was typed with proper Vietnamese accents.
    var accented = stripPunctuation(lowerNFC);
    var hasDiacritics = hasVietnameseDiacritics(accented);

    var strippedLower = applyLeetMap(stripDiacritics(lowerNFC));
    // "basic": letters/digits only, no repeat-collapsing — catches exact
    // and lightly-punctuated ASCII variants (e.g. "d.m" -> "dm").
    var basic = strippedLower.replace(/[^a-z0-9]/g, '');
    // "tight": basic + repeated-character collapsing — catches evasions
    // like "loooz" -> "loz" or "shiiiit" -> "shit".
    var tight = collapseRepeats(basic);

    return {
      basic: basic,
      tight: tight,
      accented: accented,
      hasDiacritics: hasDiacritics,
      letters: basic.length,
    };
  }

  /**
   * Split raw text into whitespace-delimited tokens, keeping each token's
   * offsets in the ORIGINAL string so matches can be masked in place.
   * @param {string} text
   * @returns {Array<{raw: string, start: number, end: number, basic: string, tight: string, accented: string, hasDiacritics: boolean}>}
   */
  function tokenize(text) {
    var tokens = [];
    var re = /\S+/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var raw = m[0];
      var norm = normalizeToken(raw);
      tokens.push({
        raw: raw,
        start: m.index,
        end: m.index + raw.length,
        basic: norm.basic,
        tight: norm.tight,
        accented: norm.accented,
        hasDiacritics: norm.hasDiacritics,
      });
    }
    return tokens;
  }

  // ── Stage 2: candidate generation ──────────────────────────────────────

  /**
   * Build word-level tokens plus overlapping n-grams (2..maxN consecutive
   * tokens) so multi-word phrases and glued-letter evasions (e.g. "c u c")
   * can be scored as a single candidate.
   * @param {Array} tokens - output of tokenize()
   * @param {number} [maxN]
   * @returns {Array<{start:number,end:number,tokenSpan:[number,number],hasDiacritics:boolean,
   *   basicSpaced:string,basicGlued:string,tightGlued:string,accentedSpaced:string,accentedGlued:string}>}
   */
  function buildCandidates(tokens, maxN) {
    maxN = maxN || MAX_NGRAM;
    var candidates = [];
    for (var n = 1; n <= maxN; n++) {
      for (var i = 0; i + n <= tokens.length; i++) {
        var slice = tokens.slice(i, i + n);
        if (slice.some(function (t) { return t.basic.length === 0; })) continue;
        var basicSpaced = slice.map(function (t) { return t.basic; }).join(' ');
        var basicGlued = slice.map(function (t) { return t.basic; }).join('');
        var tightGlued = collapseRepeats(basicGlued);
        var accentedSpaced = slice.map(function (t) { return t.accented; }).join(' ');
        var accentedGlued = slice.map(function (t) { return t.accented; }).join('');
        candidates.push({
          start: slice[0].start,
          end: slice[slice.length - 1].end,
          tokenSpan: [i, i + n - 1],
          hasDiacritics: slice.some(function (t) { return t.hasDiacritics; }),
          basicSpaced: basicSpaced,
          basicGlued: basicGlued,
          tightGlued: tightGlued,
          accentedSpaced: accentedSpaced,
          accentedGlued: accentedGlued,
        });
      }
    }
    return candidates;
  }

  // ── Stage 3: dictionary ─────────────────────────────────────────────────

  function addToIndex(index, form) {
    if (!form || form.length < 2) return; // drop degenerate 0/1-char artifacts
    index.exact.add(form);
    var bucket = index.byLength.get(form.length);
    if (!bucket) {
      bucket = [];
      index.byLength.set(form.length, bucket);
    }
    if (bucket.indexOf(form) === -1) bucket.push(form);
  }

  /**
   * Index a wordlist into two lookup structures:
   *  - `stripped`: diacritic-stripped forms (fuzzy-eligible), for tokens
   *    typed without Vietnamese accents. Skips STRIPPED_DICT_EXCLUDE entries
   *    (there's no tone information left to disambiguate them safely). Also
   *    includes each word's Telex spelling (see toTelex) — exact-match only,
   *    since Telex sequences are distinctive enough that fuzzy tolerance
   *    isn't needed and would just add false-positive surface.
   *  - `toneAware`: {sym,tone}-unit sequences (fuzzy-eligible via
   *    toneAwareDistanceBounded), for tokens typed with proper accents.
   * @param {string[]} words
   */
  function buildDictionary(words) {
    var stripped = { exact: new Set(), byLength: new Map() };
    var toneAware = { exactToneKeys: new Set(), byLength: new Map() };
    words.forEach(function (w) {
      var norm = normalizeToken(w);
      [norm.basic, norm.tight].forEach(function (form) {
        if (STRIPPED_DICT_EXCLUDE.has(form)) return;
        addToIndex(stripped, form);
      });

      if (norm.hasDiacritics) {
        var telex = toTelex(norm.accented);
        // Exact-only: added straight to the exact Set, not the byLength
        // buckets the fuzzy scan iterates — a Telex spelling is already a
        // very literal, distinctive sequence, so there's no obfuscation
        // case left for fuzzy tolerance to catch, only false-positive risk.
        if (telex !== norm.accented && telex.length >= 2 && !STRIPPED_DICT_EXCLUDE.has(telex)) {
          stripped.exact.add(telex);
        }
      }

      // Only entries that themselves carry real Vietnamese diacritics belong
      // in the tone-aware index — an ASCII dict entry (e.g. "buoi", "di")
      // fuzzy-matched against it would collide on vowel-identity/tone-free
      // grounds with an unrelated accented word (e.g. "buổi", "đi"); ASCII
      // input is handled entirely by the `stripped` index above instead.
      if (!norm.hasDiacritics) return;

      var units = decomposeUnits(norm.accented);
      if (units.length < 2) return; // drop degenerate 0/1-letter artifacts
      var toneKey = unitsToneKey(units);
      toneAware.exactToneKeys.add(toneKey);
      var bucket = toneAware.byLength.get(units.length);
      if (!bucket) {
        bucket = [];
        toneAware.byLength.set(units.length, bucket);
      }
      if (!bucket.some(function (b) { return b.toneKey === toneKey; })) {
        bucket.push({ units: units, toneKey: toneKey });
      }
    });
    return { stripped: stripped, toneAware: toneAware };
  }

  // ── Stage 4: bounded edit distance ─────────────────────────────────────

  /**
   * Damerau-Levenshtein distance with an early-exit cutoff: returns
   * Infinity as soon as it's provable the distance exceeds maxDist.
   * @param {string} a
   * @param {string} b
   * @param {number} maxDist
   * @returns {number}
   */
  function levenshteinBounded(a, b, maxDist) {
    if (a === b) return 0;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > maxDist) return Infinity;
    if (maxDist <= 0) return Infinity;

    var prevPrev, prev = new Array(lb + 1);
    var curr = new Array(lb + 1);
    for (var j = 0; j <= lb; j++) prev[j] = j;

    for (var i = 1; i <= la; i++) {
      curr[0] = i;
      var rowMin = curr[0];
      for (j = 1; j <= lb; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        var val = Math.min(
          prev[j] + 1,       // deletion
          curr[j - 1] + 1,   // insertion
          prev[j - 1] + cost // substitution
        );
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          val = Math.min(val, prevPrev[j - 2] + 1); // transposition
        }
        curr[j] = val;
        if (val < rowMin) rowMin = val;
      }
      if (rowMin > maxDist) return Infinity; // early exit
      prevPrev = prev;
      prev = curr;
      curr = new Array(lb + 1);
    }
    return prev[lb];
  }

  /**
   * Damerau-Levenshtein over {sym, tone} unit sequences, with a custom
   * substitution cost:
   *   - same sym, same tone      → 0 (identical)
   *   - same sym, different tone → ACCENT_MARK_PENALTY (e.g. "buổi"/"buồi")
   *   - different sym, same base letter family (e.g. ă/â/a) → ACCENT_MARK_PENALTY
   *     (e.g. "chăn"/"chân" — a vowel-identity swap changes the word too)
   *   - otherwise → 1 (ordinary consonant substitution/typo)
   * This is what lets fuzzy matching stay on for accented text without
   * conflating words that differ only by an accent mark.
   * @param {Array<{sym:string,tone:number}>} a
   * @param {Array<{sym:string,tone:number}>} b
   * @param {number} maxDist
   * @returns {number}
   */
  function toneAwareDistanceBounded(a, b, maxDist) {
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > maxDist) return Infinity;
    if (maxDist <= 0) {
      return (la === lb && a.every(function (u, i) { return u.sym === b[i].sym && u.tone === b[i].tone; }))
        ? 0 : Infinity;
    }

    function unitEq(u, v) { return u.sym === v.sym && u.tone === v.tone; }
    function subCost(u, v) {
      if (u.sym === v.sym) return u.tone === v.tone ? 0 : ACCENT_MARK_PENALTY;
      if (stripDiacritics(u.sym) === stripDiacritics(v.sym)) return ACCENT_MARK_PENALTY;
      return 1;
    }

    var prevPrev, prev = new Array(lb + 1);
    var curr = new Array(lb + 1);
    for (var j = 0; j <= lb; j++) prev[j] = j;

    for (var i = 1; i <= la; i++) {
      curr[0] = i;
      var rowMin = curr[0];
      for (j = 1; j <= lb; j++) {
        var val = Math.min(
          prev[j] + 1,                       // deletion
          curr[j - 1] + 1,                   // insertion
          prev[j - 1] + subCost(a[i - 1], b[j - 1]) // substitution (or match)
        );
        if (i > 1 && j > 1 && unitEq(a[i - 1], b[j - 2]) && unitEq(a[i - 2], b[j - 1])) {
          val = Math.min(val, prevPrev[j - 2] + 1); // transposition
        }
        curr[j] = val;
        if (val < rowMin) rowMin = val;
      }
      if (rowMin > maxDist) return Infinity; // early exit
      prevPrev = prev;
      prev = curr;
      curr = new Array(lb + 1);
    }
    return prev[lb];
  }

  // Tone/vowel-identity mismatches are protected by ACCENT_MARK_PENALTY, but
  // an ordinary *consonant or full-vowel* substitution is still cost 1 —
  // and short Vietnamese syllables come in dense families that differ by
  // exactly one such substitution (lắng/lặng/lẳng/lồng/lộng/lóng all share
  // the "l_ng" frame). Lowered to 4 alongside MIN_TOKEN_LENGTH_FOR_FUZZY —
  // classifierSaysReal() is the backstop for what this floor used to block.
  var MIN_SKELETON_LENGTH_FOR_FUZZY = 4;

  /**
   * Score an already-accented (diacritics preserved) candidate string
   * against the tone-aware dictionary index.
   * @param {string} accentedCandidate
   * @param {{exactToneKeys:Set, byLength:Map}} dict
   * @param {number} threshold
   * @param {boolean} [allowFuzzy]
   * @returns {{matched: boolean, distance: number}}
   */
  function scoreToneAware(accentedCandidate, dict, threshold, allowFuzzy) {
    threshold = typeof threshold === 'number' ? threshold : DEFAULT_THRESHOLD;
    if (!accentedCandidate) return { matched: false, distance: Infinity };

    var units = decomposeUnits(accentedCandidate);
    if (units.length === 0) return { matched: false, distance: Infinity };
    var toneKey = unitsToneKey(units);

    if (dict.exactToneKeys.has(toneKey)) return { matched: true, distance: 0 };
    if (allowFuzzy === false) return { matched: false, distance: Infinity };

    var skeletonLen = units.length;
    if (skeletonLen < MIN_SKELETON_LENGTH_FOR_FUZZY) {
      return { matched: false, distance: Infinity };
    }

    var maxDistByRatio = Math.floor(skeletonLen * threshold);
    var absCap = skeletonLen <= 6 ? 1 : 2;
    var maxDist = Math.min(maxDistByRatio, absCap);
    if (maxDist < 1) return { matched: false, distance: Infinity };

    var best = Infinity;
    for (var len = skeletonLen - maxDist; len <= skeletonLen + maxDist; len++) {
      var bucket = dict.byLength.get(len);
      if (!bucket) continue;
      for (var i = 0; i < bucket.length; i++) {
        var dist = toneAwareDistanceBounded(units, bucket[i].units, maxDist);
        if (dist < best) best = dist;
        if (best === 0) break;
      }
    }
    return best <= maxDist ? { matched: true, distance: best } : { matched: false, distance: Infinity };
  }

  // ── Stage 5: scoring ────────────────────────────────────────────────────

  /**
   * Score a candidate string against a dictionary index.
   * @param {string} candidate - normalized text (basic/tight/accented form)
   * @param {{exact: Set, byLength: Map}} dict
   * @param {number} threshold - max normalized-distance ratio to count as a match
   * @param {boolean} [allowFuzzy] - if false, only an exact match counts
   * @returns {{matched: boolean, distance: number, matchedWord: (string|null)}}
   */
  function scoreCandidate(candidate, dict, threshold, allowFuzzy) {
    threshold = typeof threshold === 'number' ? threshold : DEFAULT_THRESHOLD;
    if (!candidate) return { matched: false, distance: Infinity, matchedWord: null };

    if (dict.exact.has(candidate)) {
      return { matched: true, distance: 0, matchedWord: candidate };
    }

    if (allowFuzzy === false) {
      return { matched: false, distance: Infinity, matchedWord: null };
    }

    // Short tokens must match exactly — never fuzzy — to avoid false-flagging
    // legitimate short words purely for being within edit distance 1.
    if (candidate.length < MIN_TOKEN_LENGTH_FOR_FUZZY) {
      return { matched: false, distance: Infinity, matchedWord: null };
    }

    var maxDistByRatio = Math.floor(candidate.length * threshold);
    // Absolute cap tightens the ratio bound further for short-to-mid words.
    var absCap = candidate.length <= 6 ? 1 : 2;
    var maxDist = Math.min(maxDistByRatio, absCap);
    if (maxDist < 1) return { matched: false, distance: Infinity, matchedWord: null };

    var best = { matched: false, distance: Infinity, matchedWord: null };
    for (var len = candidate.length - maxDist; len <= candidate.length + maxDist; len++) {
      var bucket = dict.byLength.get(len);
      if (!bucket) continue;
      for (var i = 0; i < bucket.length; i++) {
        var dist = levenshteinBounded(candidate, bucket[i], maxDist);
        if (dist < best.distance) {
          best = { matched: true, distance: dist, matchedWord: bucket[i] };
          if (dist === 0) return best;
        }
      }
    }
    return best.distance <= maxDist ? best : { matched: false, distance: Infinity, matchedWord: null };
  }

  // ── Stage 6: masking ─────────────────────────────────────────────────────

  /**
   * Replace given [start,end) spans (offsets into `text`) with asterisks.
   * Spans must be non-overlapping. Everything outside the spans (whitespace,
   * punctuation, other text) and the overall message length is preserved.
   * @param {string} text
   * @param {Array<[number, number]>} spans
   * @returns {string}
   */
  function maskMessage(text, spans) {
    if (!spans.length) return text;
    var sorted = spans.slice().sort(function (a, b) { return a[0] - b[0]; });
    var out = '';
    var cursor = 0;
    sorted.forEach(function (span) {
      var start = span[0], end = span[1];
      if (start < cursor) return; // skip overlap defensively
      out += text.slice(cursor, start);
      out += '*'.repeat(end - start);
      cursor = end;
    });
    out += text.slice(cursor);
    return out;
  }

  // ── Stage 7: classifier reject-stage (optional) ─────────────────────────

  // Loaded from client/js/profanity-classifier-model.js (auto-generated by
  // tools/profanity-training/train.py). Absent in environments that haven't
  // loaded it — the filter degrades gracefully to rule-only matching, never
  // throws. See that file's header for what trained it and on what data.
  var classifierModel = (function loadClassifierModel() {
    if (typeof module === 'object' && module.exports) {
      try {
        return require('./profanity-classifier-model.js');
      } catch (e) {
        return null;
      }
    }
    var g = typeof globalThis !== 'undefined' ? globalThis : null;
    return (g && g.ProfanityClassifierModel) || null;
  })();

  /**
   * Char n-gram linear model score for a single word: sum(weight * count)
   * over n-grams present in both the word and the trained vocabulary, + bias.
   * Mirrors sklearn's CountVectorizer(analyzer='char', ngram_range) + a
   * linear SVM's decision_function — no ML runtime needed, just a dot
   * product over a small precomputed weight table.
   * @param {string} word
   * @returns {number|null} null if no model is loaded
   */
  function classifierScore(word) {
    if (!classifierModel) return null;
    var nMin = classifierModel.ngramRange[0];
    var nMax = classifierModel.ngramRange[1];
    var vocab = classifierModel.vocab;
    var weights = classifierModel.weights;
    var score = classifierModel.bias;
    for (var n = nMin; n <= nMax; n++) {
      for (var i = 0; i + n <= word.length; i++) {
        var gram = word.slice(i, i + n);
        if (Object.prototype.hasOwnProperty.call(vocab, gram)) {
          score += weights[vocab[gram]];
        }
      }
    }
    return score;
  }

  /**
   * True if the classifier is confident `word` is an ordinary word rather
   * than an obfuscated bad word — used only to REJECT a fuzzy (non-exact)
   * rule-based match, never to create a new one. If no model is loaded,
   * always returns false (i.e. defers entirely to the rule-based match).
   * @param {string} word
   */
  function classifierSaysReal(word) {
    var score = classifierScore(word);
    if (score === null) return false;
    return score <= classifierModel.threshold;
  }

  // ── Orchestration ────────────────────────────────────────────────────────

  var DEFAULT_DICT = buildDictionary(VI_BADWORDS.concat(EN_BADWORDS));

  /**
   * Run the full filter pipeline over a raw chat message.
   * @param {string} text
   * @param {object} [options]
   * @param {number} [options.threshold]
   * @param {{exact:Set, byLength:Map}} [options.dict] - defaults to the built-in VI+EN dictionary
   * @returns {string} the message with any matched spans masked
   */
  function filterMessage(text, options) {
    if (typeof text !== 'string' || text.length === 0) return text;
    options = options || {};
    var threshold = options.threshold;
    var dict = options.dict || DEFAULT_DICT;

    var tokens = tokenize(text);
    if (tokens.length === 0) return text;

    var candidates = buildCandidates(tokens);

    // Prefer longer spans first so a matched phrase masks as one unit
    // rather than being re-masked token-by-token.
    candidates.sort(function (a, b) { return (b.end - b.start) - (a.end - a.start); });

    var matchedSpans = [];
    var claimedTokens = new Array(tokens.length).fill(false);

    candidates.forEach(function (cand) {
      var lo = cand.tokenSpan[0], hi = cand.tokenSpan[1];
      for (var t = lo; t <= hi; t++) {
        if (claimedTokens[t]) return; // overlaps an already-matched span
      }

      // Multi-word spans (n>=2) require an exact match — fuzzy edit-distance
      // over concatenated common words (e.g. "con" + "cua") false-positives
      // constantly in Vietnamese, which uses short classifier words heavily.
      var isMultiWord = hi > lo;
      var allowFuzzy = !isMultiWord;

      var hit;
      if (cand.hasDiacritics) {
        // Token(s) already carry proper Vietnamese accents — score with the
        // tone-aware distance (see toneAwareDistanceBounded) rather than
        // plain Levenshtein, so a tone-only difference ("buổi" vs "buồi")
        // never counts as a match while genuine typos still can.
        hit = scoreToneAware(cand.accentedGlued, dict.toneAware, threshold, allowFuzzy);
        if (!hit.matched && cand.accentedSpaced !== cand.accentedGlued) {
          hit = scoreToneAware(cand.accentedSpaced, dict.toneAware, threshold, false);
        }
      } else {
        hit = scoreCandidate(cand.basicGlued, dict.stripped, threshold, allowFuzzy);
        if (!hit.matched) hit = scoreCandidate(cand.tightGlued, dict.stripped, threshold, allowFuzzy);
        if (!hit.matched && cand.basicSpaced !== cand.basicGlued) {
          hit = scoreCandidate(cand.basicSpaced, dict.stripped, threshold, false);
        }
      }
      if (!hit.matched) return;

      // Classifier reject-stage: only for fuzzy (non-exact) single-token
      // matches — exact dictionary hits are ground truth and always stand.
      // This can only IMPROVE precision (it removes matches, never adds
      // any), so it's safe to layer on top of the existing rule thresholds.
      if (hit.distance > 0 && !isMultiWord) {
        var candidateWord = cand.hasDiacritics ? cand.accentedGlued : cand.basicGlued;
        if (classifierSaysReal(candidateWord)) return;
      }

      for (t = lo; t <= hi; t++) claimedTokens[t] = true;
      matchedSpans.push([cand.start, cand.end]);
    });

    return maskMessage(text, matchedSpans);
  }

  return {
    normalizeToken: normalizeToken,
    toTelex: toTelex,
    tokenize: tokenize,
    buildCandidates: buildCandidates,
    buildDictionary: buildDictionary,
    decomposeUnits: decomposeUnits,
    levenshteinBounded: levenshteinBounded,
    toneAwareDistanceBounded: toneAwareDistanceBounded,
    scoreCandidate: scoreCandidate,
    scoreToneAware: scoreToneAware,
    classifierScore: classifierScore,
    classifierSaysReal: classifierSaysReal,
    maskMessage: maskMessage,
    filterMessage: filterMessage,
    VI_BADWORDS: VI_BADWORDS,
    EN_BADWORDS: EN_BADWORDS,
    DEFAULT_THRESHOLD: DEFAULT_THRESHOLD,
    MIN_TOKEN_LENGTH_FOR_FUZZY: MIN_TOKEN_LENGTH_FOR_FUZZY,
    MIN_SKELETON_LENGTH_FOR_FUZZY: MIN_SKELETON_LENGTH_FOR_FUZZY,
  };
});
