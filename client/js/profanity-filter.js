'use strict';

/**
 * profanity-filter.js — Lightweight VI/EN chat profanity filter.
 *
 * UMD-style module: `require()`-able from server (CommonJS) and side-effect
 * `import`-able from the browser (ES module), attaching to `globalThis` there.
 *
 * Vietnamese dictionary data (VI_BADWORDS below) is vendored verbatim from
 * TheQuantumCrew/viet_badwords_filter_python (WTFPL — public domain-equivalent,
 * no attribution/permission required), specifically its
 * `viet_badwords_filter/badwords_list.py`. Only the data was reused; the
 * matching algorithm in this file is an original implementation.
 *
 * Pipeline (each stage independently callable/testable):
 *   normalizeToken  → per-token lowercase/diacritic/leet/repeat normalization
 *   tokenize        → splits raw text into tokens with original-text offsets
 *   buildCandidates → word tokens + overlapping n-grams (multi-word phrases,
 *                     and glued single-letter runs like "c u c" → "cuc")
 *   buildDictionary → indexes a wordlist for fast lookup/scoring
 *   scoreCandidate  → exact + bounded edit-distance match against a dictionary
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
    'cailon', 'lồn', 'lồng', 'lờ', 'mé', 'má', 'mọe', 'buồi', 'cu', 'cứt',
    'con mẹ', 'vãi lồn', 'vl', 'vãi cả lồn', 'vcl', 'vãi cặc', 'vãi lồng',
    'vãi lìn', 'vãi con cặc', 'vcc', 'như cái lồn', 'như con cặc', 'chịch',
    'lếu lều', 'liếm lồn', 'bú cu', 'xoạc', 'mặt lồn', 'mặt lờ', 'đầu buồi',
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
    'mát lon', 'mat lon', 'cái lon', 'cai lon', 'lòi lon', 'loi lon',
    'ham lon', 'củ lon', 'cu lon', 'ngu lon', 'tuổi lon', 'tuoi lon',
    'mõm lon', 'mồm lon', 'mom lon', 'như lon', 'nhu lon', 'nứng lon',
    'nung lon', 'nug lon', 'nuglon', 'rảnh lon', 'ranh lon', 'đách lon',
    'dach lon', 'mu lon', 'banh lon', 'tét lon', 'tet lon', 'vạch lon',
    'vach lon', 'cào lon', 'cao lon', 'tung lon', 'mặt lon', 'cái lờ', 'cl',
    'clgt', 'cờ lờ gờ tờ', 'cái lề gì thốn', 'đốn cửa lòng', 'sml',
    'sapmatlol', 'sapmatlon', 'sapmatloz', 'sấp mặt', 'sap mat', 'vlon',
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
    'ke mje', 'bỏ mẹ', 'bỏ mịa', 'bỏ mịe', 'bỏ mja', 'bỏ mje', 'bo me',
    'bo mia', 'bo mie', 'bo mje', 'bo mja', 'chetme', 'chet me', 'chết mẹ',
    'chết mịa', 'chết mja', 'chết mịe', 'chết mie', 'chet mia', 'chet mie',
    'chet mja', 'chet mje', 'thấy mẹ', 'thấy mịe', 'thấy mịa', 'thay me',
    'thay mie', 'thay mia', 'tổ cha', 'bà cha mày', 'cmn', 'cmnl',
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
  // other), so fuzzy-matching below length 6 flags ordinary words constantly.
  var MIN_TOKEN_LENGTH_FOR_FUZZY = 6;
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
        var basicGlued  = slice.map(function (t) { return t.basic; }).join('');
        var tightGlued  = collapseRepeats(basicGlued);
        var accentedSpaced = slice.map(function (t) { return t.accented; }).join(' ');
        var accentedGlued  = slice.map(function (t) { return t.accented; }).join('');
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
   *    (there's no tone information left to disambiguate them safely).
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
  // the "l_ng" frame). Same reasoning as MIN_TOKEN_LENGTH_FOR_FUZZY: keep
  // the floor high enough that a single full-letter swap can't cross it.
  var MIN_SKELETON_LENGTH_FOR_FUZZY = 6;

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

      for (t = lo; t <= hi; t++) claimedTokens[t] = true;
      matchedSpans.push([cand.start, cand.end]);
    });

    return maskMessage(text, matchedSpans);
  }

  return {
    normalizeToken: normalizeToken,
    tokenize: tokenize,
    buildCandidates: buildCandidates,
    buildDictionary: buildDictionary,
    decomposeUnits: decomposeUnits,
    levenshteinBounded: levenshteinBounded,
    toneAwareDistanceBounded: toneAwareDistanceBounded,
    scoreCandidate: scoreCandidate,
    scoreToneAware: scoreToneAware,
    maskMessage: maskMessage,
    filterMessage: filterMessage,
    VI_BADWORDS: VI_BADWORDS,
    EN_BADWORDS: EN_BADWORDS,
    DEFAULT_THRESHOLD: DEFAULT_THRESHOLD,
    MIN_TOKEN_LENGTH_FOR_FUZZY: MIN_TOKEN_LENGTH_FOR_FUZZY,
    MIN_SKELETON_LENGTH_FOR_FUZZY: MIN_SKELETON_LENGTH_FOR_FUZZY,
  };
});
