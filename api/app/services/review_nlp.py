from __future__ import annotations

_QUIET_REFS = [
    "This place is very quiet and peaceful.",
    "Great spot to work on your laptop or study in silence.",
    "Perfect for a focused work session or deep concentration.",
    "The atmosphere is calm and relaxed, easy to have a conversation.",
    "You can actually hear yourself think here.",
    "Cozy and intimate, not too crowded.",
    "I always come here to get work done with no distractions.",
    "Soft background music that doesn't interrupt your focus.",
    "Surprisingly quiet for a NYC café, love it.",
    "Very chill vibe, staff speak softly, good for reading.",
    "Low ambient noise, great acoustics for a call or meeting.",
    "The espresso machine is tucked away and not disruptive.",
    "Never too busy, easy to find a quiet corner.",
    "A true hidden gem for anyone needing a calm workspace.",
    "People mostly keep to themselves here.",
    "Lots of people reading or working quietly.",
    "Peaceful environment, perfect for writing.",
    "No loud music, just a gentle background hum.",
    "Great place to take a Zoom call.",
    "Everyone seems focused and respectful of the space.",
    "Quiet enough to have a low voice conversation.",
    "Very relaxing atmosphere.",
    "You can sit here for hours without distractions.",
    "Nice mellow vibe without much chatter.",
    "Calm energy throughout the café.",
    "The space feels tranquil and comfortable.",
    "Minimal background noise even when it's busy.",
    "Even during peak hours it stays relatively quiet.",
    "People are mostly on laptops working.",
    "Nice peaceful environment to read a book.",
    "You can hear the pages turning.",
    "A calm retreat from the busy streets outside.",
    "The vibe is subdued and mellow.",
    "Great for studying before exams.",
]

_LOUD_REFS = [
    "This place is extremely loud and noisy.",
    "You can't hear anything over the music and crowd.",
    "So crowded and chaotic, had to shout to be heard.",
    "The music was blasting the entire time.",
    "Very rowdy bar atmosphere, not great for conversation.",
    "Packed wall to wall, no room to breathe.",
    "The espresso machine is deafeningly loud.",
    "Baristas shout drink orders constantly, impossible to focus.",
    "Echo-y space, every sound bounces off the walls.",
    "Construction outside makes it unbearable.",
    "Music is always too loud here, can't concentrate.",
    "Gets incredibly crowded during lunch, noise is overwhelming.",
    "Tables are jammed together and everyone's conversation bleeds.",
    "Forget working here — it's a party venue with coffee.",
    "Impossible to focus with all the chatter.",
    "Way too busy and chaotic for getting work done.",
    "Feels like a nightclub during the evening.",
    "Groups of people laughing and shouting everywhere.",
    "Constant clatter from dishes and cups.",
    "The sound level is overwhelming.",
    "Hard to take a phone call here.",
    "Everyone is talking over each other.",
    "The acoustics make it even louder.",
    "Feels crowded and noisy most of the time.",
    "Music plus crowd noise makes it unbearable.",
    "Very high energy but also very loud.",
    "People are practically yelling to talk.",
    "The crowd noise never stops.",
    "Definitely not a place to study.",
    "Way too much going on to concentrate.",
    "The sound echoes across the whole room.",
    "Feels chaotic and overstimulating.",
    "Hard to hear the person sitting across from you.",
    "Not a calm environment at all.",
]

_QUIET_KEYWORDS = [
    "quiet", "peaceful", "calm", "tranquil", "serene", "silent",
    "focused", "productive", "cozy", "chill", "relaxed", "intimate",
    "low-key", "undisturbed", "library-like", "hushed", "muted",
    "good for work", "great for work", "perfect for work", "work-friendly",
    "good wifi", "great wifi", "great for studying",
]

_LOUD_KEYWORDS = [
    "loud", "noisy", "noisy", "blasting", "deafening", "ear-splitting",
    "chaotic", "rowdy", "crowded", "packed", "overwhelming", "echoey",
    "echo", "echoing", "construction", "shouting", "shout", "screaming",
    "can't concentrate", "cannot concentrate", "hard to focus",
    "too loud", "really loud", "super loud", "very loud", "way too loud",
    "music is loud", "loud music", "blaring music",
]

_SIGNAL_THRESHOLD = 0.06
_MAX_REVIEWS      = 100
_MIN_CHARS        = 15
_model      = None
_quiet_emb  = None
_loud_emb   = None


def _get_model():
    global _model, _quiet_emb, _loud_emb
    if _model is None:
        from sentence_transformers import SentenceTransformer
        import numpy as np
        _model     = SentenceTransformer("all-MiniLM-L6-v2")
        _quiet_emb = np.mean(_model.encode(_QUIET_REFS, batch_size=32, show_progress_bar=False), axis=0)
        _loud_emb  = np.mean(_model.encode(_LOUD_REFS,  batch_size=32, show_progress_bar=False), axis=0)
    return _model, _quiet_emb, _loud_emb


def _keyword_delta(text: str) -> float:
    lower = text.lower()
    q = sum(1 for kw in _QUIET_KEYWORDS if kw in lower)
    l = sum(1 for kw in _LOUD_KEYWORDS  if kw in lower)
    total = q + l
    if total == 0:
        return 0.0
    return (q - l) / total


def _length_weight(text: str) -> float:
    n = len(text)
    if n < 30:
        return 0.4
    if n >= 120:
        return 1.0
    return 0.4 + 0.6 * (n - 30) / 90


def score_reviews(reviews: list[str]) -> tuple[float | None, int, float]:
    if not reviews:
        return None, 0, 0.0

    cleaned = [r.strip() for r in reviews if len(r.strip()) >= _MIN_CHARS]
    if not cleaned:
        return None, 0, 0.0

    try:
        import numpy as np
        model, quiet_emb, loud_emb = _get_model()

        review_embs = model.encode(cleaned, batch_size=32, show_progress_bar=False)

        weighted_scores: list[tuple[float, float]] = []
        net_signal = 0
        signal_weight_sum = 0.0
        total_weight_sum  = 0.0

        for text, emb in zip(cleaned, review_embs):
            norm_e = np.linalg.norm(emb)
            if norm_e == 0:
                continue

            sim_q = float(np.dot(emb, quiet_emb) / (norm_e * np.linalg.norm(quiet_emb)))
            sim_l = float(np.dot(emb, loud_emb)  / (norm_e * np.linalg.norm(loud_emb)))
            sem_delta = sim_q - sim_l
            kw_delta = _keyword_delta(text)
            delta = 0.35 * kw_delta + 0.65 * sem_delta
            delta = max(-1.0, min(1.0, delta))

            w = _length_weight(text)
            weighted_scores.append((delta, w))
            total_weight_sum += w

            if delta > _SIGNAL_THRESHOLD:
                net_signal += 1
                signal_weight_sum += w
            elif delta < -_SIGNAL_THRESHOLD:
                net_signal -= 1
                signal_weight_sum += w

        if not weighted_scores or total_weight_sum == 0:
            return None, 0, 0.0

        mean_sentiment = sum(d * w for d, w in weighted_scores) / total_weight_sum
        confidence     = round(signal_weight_sum / total_weight_sum, 2)
        return round(float(mean_sentiment), 4), net_signal, confidence
    except Exception:
        return None, 0, 0.0


def extract_noise_sentiment(reviews: list[str]) -> float | None:
    sentiment, _, _ = score_reviews(reviews)
    return sentiment