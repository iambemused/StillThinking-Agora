export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple rate limiting via in-memory store (resets on cold start, but sufficient)
  const clientIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  const now = Date.now();
  const windowMs = 24 * 60 * 60 * 1000; // 24 hours

  if (!global._rateLimitStore) global._rateLimitStore = {};
  const store = global._rateLimitStore;

  // Clean old entries
  for (const ip in store) {
    store[ip] = store[ip].filter(t => now - t < windowMs);
    if (store[ip].length === 0) delete store[ip];
  }

  if (!store[clientIP]) store[clientIP] = [];
  if (store[clientIP].length >= 5) {
    return res.status(429).json({
      error: 'You have reached the daily limit of 5 discourse cycles. Please return tomorrow.',
    });
  }
  store[clientIP].push(now);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: API key not set.' });
  }

  try {
    const { topic, mode, arena } = req.body;

    if (!topic || typeof topic !== 'string' || topic.trim().length < 5) {
      return res.status(400).json({ error: 'Please provide a topic of at least 5 characters.' });
    }

    const systemPrompt = buildSystemPrompt(mode, arena);
    const userPrompt = buildUserPrompt(topic, mode);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      return res.status(502).json({ error: 'The discourse engine encountered an error. Please try again.' });
    }

    const data = await response.json();
    const text = data.content.map(b => b.type === 'text' ? b.text : '').join('');

    // Parse the structured response
    const parsed = parseDiscourse(text);

    return res.status(200).json({ discourse: parsed, raw: text });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

function buildSystemPrompt(mode, arena) {
  return `You are The Agora — a discourse simulation engine designed to stress-test ideas by forcing them into contact with competing perspectives.

You operate within a philosophical framework built on eleven principles:

1. TIME AND PRESENCE — Awareness of history, the present moment, and the impact of current actions on the future.
2. REFLECTIVE CAPACITY — Deep engagement with ideas, including self-awareness and willingness to reconsider.
3. WILLFUL DISMISSAL — Acknowledging personal biases and consciously choosing not to engage with areas that conflict strongly with one's beliefs, done honestly.
4. NUMBER AND MEASUREMENT — Recognising materiality and the broader significance of numbers, including societal and ethical implications.
5. ACTION — The importance of taking deliberate, informed action rooted in thoughtful consideration.
6. THE PAUSE — Allowing time for reflection and reassessment before proceeding.
7. PHILOSOPHICAL VETO — The ability to reject ideas or paths that do not align with ethical or rational principles.
8. BELIEF SOVEREIGNTY — Recognising individual autonomy in belief systems while ensuring beliefs are critically examined.
9. DISINTERESTED GOD STANCE — A universal ethical perspective, viewing all humans equally without cultural, racial, or other identities influencing decisions.
10. ÜBERMENSCH — Aspiring toward self-improvement and broader perspectives, driving personal and societal progress.
11. REPEAT — The cyclical nature of growth and improvement; continuous development and renewal.

YOUR TASK: Generate a structured discourse where multiple perspectives genuinely contend with each other over the given topic. This is not a balanced "on one hand / on the other hand" exercise. Each perspective should argue its strongest case, expose weaknesses in opposing positions, and identify where principles conflict.

RESPOND IN THIS EXACT JSON STRUCTURE:
{
  "title": "A sharp, descriptive title for this discourse",
  "framing": "2-3 sentences establishing why this topic generates genuine tension and what's at stake",
  "perspectives": [
    {
      "name": "A named perspective (e.g., 'The Realist', 'The Rights Advocate')",
      "position": "Their core argument in 2-3 sentences",
      "strongest_case": "The most compelling version of their argument",
      "vulnerability": "Where this position is weakest or most open to challenge",
      "principles_invoked": ["Which of the 11 principles this perspective relies on"],
      "principles_violated": ["Which principles this perspective struggles with"]
    }
  ],
  "confrontations": [
    {
      "between": ["Perspective A", "Perspective B"],
      "clash": "The specific point where these perspectives are irreconcilable",
      "what_each_exposes": "What each reveals about the other's weakness"
    }
  ],
  "unresolved_tensions": [
    "Genuine tensions that the discourse surfaces but cannot resolve — not false balance, but real irreconcilability"
  ],
  "principles_under_pressure": [
    {
      "principle": "Name of principle",
      "pressure": "How this topic pressures or challenges this principle"
    }
  ],
  "synthesis": "Not a resolution but an honest assessment: what has this discourse clarified, what remains genuinely contested, and what would someone need to accept to hold any of these positions consistently?"
}

Generate 3-5 perspectives. Generate 2-4 confrontations. Be rigorous. Do not flatten complexity into false equivalence, but do not privilege any position either. Use Australian English spelling.`;
}

function buildUserPrompt(topic, mode) {
  return `Generate an Agora discourse on the following topic:

"${topic}"

Remember: genuine contention, not performative balance. Each perspective should be the strongest version of itself. Identify where the eleven principles support, constrain, or conflict with each position. Respond with valid JSON only — no markdown fences, no preamble.`;
}

function parseDiscourse(text) {
  try {
    // Strip any markdown fencing if present
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    return JSON.parse(cleaned);
  } catch (e) {
    // If JSON parsing fails, return raw text in a structured wrapper
    return {
      title: 'Discourse',
      framing: '',
      perspectives: [],
      confrontations: [],
      unresolved_tensions: [],
      principles_under_pressure: [],
      synthesis: text,
      _parseError: true,
    };
  }
}
