"""
train.py — Train a lightweight char-n-gram linear classifier to reject
false positives in the profanity filter's "suspect zone" (fuzzy matches
close to, but not exactly, a bad word).

Positive class (1 = bad word): vendored bad-word forms + synthetic
single-edit typo variants of them.
Negative class (0 = real word): the mined confusable set (hard negatives —
real words that sit close to a bad word) + a random sample of ordinary
words from Viet74K.txt (easy negatives).

Viet74K.txt and confusables.csv are offline-only (gitignored, disputed
license — see .gitignore) and never shipped; only the trained weight
vector below ends up in the repo, exported to model.json.

Usage: source ../../.venv/bin/activate && python train.py
"""

import csv
import json
import random
from pathlib import Path

from sklearn.feature_extraction.text import CountVectorizer
from sklearn.svm import LinearSVC
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, precision_recall_fscore_support

random.seed(42)

HERE = Path(__file__).parent
DATA = HERE / "data"

ALPHABET = "abcdefghijklmnopqrstuvwxyzăâđêôơư"


def random_edit(word):
    """Apply one random char insert/delete/substitute — simulates a typo."""
    if len(word) < 2:
        return word
    op = random.choice(["ins", "del", "sub"])
    i = random.randrange(len(word))
    if op == "del":
        return word[:i] + word[i + 1 :]
    ch = random.choice(ALPHABET)
    if op == "ins":
        return word[:i] + ch + word[i:]
    return word[:i] + ch + word[i + 1 :]


def load_real_word_reference():
    """Every word from either wordlist, used to catch synthetic typos that
    accidentally land on an actual word (see load_positive)."""
    real_words = set()
    for fname in ("Viet74K.txt", "words_en.txt"):
        with open(DATA / fname, encoding="utf-8") as f:
            real_words.update(w.strip().lower() for w in f if w.strip())
    return real_words


def load_positive(real_words):
    with open(DATA / "badword_forms.json", encoding="utf-8") as f:
        forms = json.load(f)
    positives = set(forms)
    # Augment with typo variants so the classifier doesn't just memorize
    # exact bad-word spellings (those are already caught by exact match
    # anyway — the point of this model is the *fuzzy* zone). A random
    # single-char edit can land on an unrelated real word (e.g. one edit of
    # a bad-word form produced "itch", "gu", "bò", "vol" — all real, none
    # bad); labeling those "1/bad" would be flat-out wrong ground truth, so
    # discard any generated variant that collides with a known real word
    # rather than trust the edit distance alone to preserve meaning.
    discarded = 0
    for w in list(forms):
        for _ in range(3):
            variant = random_edit(w)
            if variant in real_words:
                discarded += 1
                continue
            positives.add(variant)
    print(f"discarded {discarded} synthetic typo(s) that collided with a real word")
    return positives


def load_confusables():
    confusables = set()
    with open(DATA / "confusables.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            confusables.add(row["word"])
    return confusables


def load_easy_negative():
    words = []
    for fname, n in [("Viet74K.txt", 4000), ("words_en.txt", 4000)]:
        with open(DATA / fname, encoding="utf-8") as f:
            candidates = [
                w.strip().lower()
                for w in f
                if w.strip() and " " not in w and "-" not in w and "'" not in w
            ]
        words.extend(random.sample(candidates, min(n, len(candidates))))
    return set(words)


def main():
    real_words = load_real_word_reference()
    positives = load_positive(real_words)
    confusables = load_confusables()
    easy_negatives = load_easy_negative()
    # A word can't be both — bad-word forms win (they're the ground truth
    # we vendored on purpose); drop any overlap from the negative side.
    confusables -= positives
    easy_negatives -= positives
    easy_negatives -= confusables  # keep the hard set exclusively held out

    # Confusables are held out entirely from training — they're the exact
    # false positives we're trying to fix, so scoring on them must be a
    # true out-of-training evaluation, not just a random test split.
    X = list(positives) + list(easy_negatives)
    y = [1] * len(positives) + [0] * len(easy_negatives)
    print(f"positives={len(positives)} easy_negatives={len(easy_negatives)} "
          f"held-out confusables={len(confusables)}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    vectorizer = CountVectorizer(analyzer="char", ngram_range=(2, 3), min_df=3)
    X_train_vec = vectorizer.fit_transform(X_train)
    X_test_vec = vectorizer.transform(X_test)

    clf = LinearSVC(class_weight="balanced", C=1.0, max_iter=10000)
    clf.fit(X_train_vec, y_train)

    y_pred = clf.predict(X_test_vec)
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_test, y_pred, average="binary"
    )
    print(f"\n== Random test split (positives + easy negatives) ==")
    print(f"Precision={precision:.3f}  Recall={recall:.3f}  F1={f1:.3f}\n")
    print(classification_report(y_test, y_pred, target_names=["real", "bad"]))

    # The metric that actually matters: of the words we know are real but
    # sit close to a bad word (never seen during training), how many does
    # the classifier correctly save from being masked?
    confusables = list(confusables)
    X_conf_vec = vectorizer.transform(confusables)
    y_conf_pred = clf.predict(X_conf_vec)
    saved = sum(1 for p in y_conf_pred if p == 0)
    print(f"== Held-out confusable real words ==")
    print(f"{saved}/{len(confusables)} correctly kept unmasked "
          f"({saved / len(confusables):.1%} recall on the false-positive set)")

    # Export a plain dot-product model: score = w . x + b, for a small,
    # dependency-free JS inference function (no runtime ML library needed).
    # Round weights and drop near-zero ones to keep the shipped JSON small —
    # this is a reject-stage for a narrow suspect zone, not a general model.
    vocab = vectorizer.vocabulary_  # ngram -> column index
    raw_weights = clf.coef_[0]
    bias = float(clf.intercept_[0])

    kept_vocab = {}
    kept_weights = []
    for ngram, idx in vocab.items():
        w = round(float(raw_weights[idx]), 3)
        if w == 0.0:
            continue
        kept_vocab[ngram] = len(kept_weights)
        kept_weights.append(w)

    model = {
        "ngramRange": [2, 3],
        "vocab": kept_vocab,
        "weights": kept_weights,
        "bias": round(bias, 3),
        "threshold": 0.0,  # score > threshold => classify as "bad"
    }
    # Written as a UMD .js file (same loading pattern as profanity-filter.js
    # itself) rather than .json, so it works as a plain `require()` on the
    # server and a side-effect `<script type=module>` import in the browser
    # without needing import-assertion syntax for JSON.
    out_path = HERE.parent.parent / "client" / "js" / "profanity-classifier-model.js"
    model_json = json.dumps(model, ensure_ascii=False)
    js = (
        "'use strict';\n\n"
        "// AUTO-GENERATED by tools/profanity-training/train.py — do not hand-edit.\n"
        "// Char-n-gram linear classifier weights for the profanity-filter\n"
        "// fuzzy-match reject stage. Retrain via train.py to regenerate.\n"
        "(function (root, factory) {\n"
        "  if (typeof module === 'object' && module.exports) {\n"
        "    module.exports = factory();\n"
        "  } else {\n"
        "    root.ProfanityClassifierModel = factory();\n"
        "  }\n"
        "})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n"
        f"  return {model_json};\n"
        "});\n"
    )
    out_path.write_text(js, encoding="utf-8")
    print(f"Model written to {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
