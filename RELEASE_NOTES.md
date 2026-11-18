Matra 0.4.1 — fixes for Gemini and punctuation.
• Fixed "This Gemini model isn't available for your key": Matra now talks to Google's current API, and if a model still isn't available for your key it switches to the best one that is and remembers it.
• Punctuation is checked every time: a missing full stop, dari (।) or question mark at the end, "." ending a Bangla sentence, spaces before punctuation, a missing space after a comma, doubled marks like ",," or "।।", a lowercase start, and a lone "i". These checks run in Matra itself, so they work even when the AI is busy or offline.
• The AI also looks harder at commas, run-on sentences and missing apostrophes.
