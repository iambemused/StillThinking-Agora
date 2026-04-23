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

  // Rate limiting via in-memory store (resets on cold start)
  const clientIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  const now = Date.now();
  const windowMs = 24 * 60 * 60 * 1000; // 24 hours

  if (!global._rateLimitStore) global._rateLimitStore = {};
  const store = global._rateLimitStore;

  for (const ip in store) {
    store[ip] = store[ip].filter(t => now - t < windowMs);
    if (store[ip].length === 0) delete store[ip];
  }

  if (!store[clientIP]) store[clientIP] = [];
  if (store[clientIP].length >= 8) {
    return res.status(429).json({
      error: 'You have reached the daily limit of 8 discourse cycles. Please return tomorrow.',
    });
  }
  store[clientIP].push(now);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: API key not set.' });
  }

  try {
    const { topic, mode, discourse } = req.body;

    // Plain English summary mode
    if (mode === 'plain') {
      if (!discourse) {
        return res.status(400).json({ error: 'No discourse provided for plain English summary.' });
      }

      const prompt = `You have been given a structured philosophical discourse in JSON format. Rewrite it as a clear, plain-English summary that any intelligent adult can follow — regardless of their background in philosophy or policy.

Rules:
- Write in short paragraphs, plain sentences. No jargon without immediate plain-English explanation in brackets.
- Do not talk down to the reader. Assume intelligence, not prior knowledge.
- Keep the real tensions — do not flatten them into false simplicity. The point is that this is genuinely hard, and the reader should feel that.
- Structure: one short paragraph per major perspective (what they believe and their best argument), then the key confrontations in plain terms, then the unresolved tensions, then a plain synthesis.
- Use bold text sparingly to highlight the single most important phrase in each section.
- End with one sentence that captures what the discourse has genuinely clarified — and one sentence about what it has not.
- Format as HTML paragraphs only: <p> tags, <strong> for emphasis. No headings, no lists, no other tags.
- Do not use the word "boundaries".
- Use Australian English spelling.

Here is the discourse:
${JSON.stringify(discourse, null, 2)}`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        return res.status(502).json({ error: 'The discourse engine encountered an error. Please try again.' });
      }

      const data = await response.json();
      const html = data.content.map(b => b.type === 'text' ? b.text : '').join('');
      return res.status(200).json({ html });
    }

    // Standard discourse mode
    if (!topic || typeof topic !== 'string' || topic.trim().length < 5) {
      return res.status(400).json({ error: 'Please provide a topic of at least 5 characters.' });
    }

    const systemPrompt = buildSystemPrompt();
    const userPrompt = `Generate an Agora discourse on the following topic:\n\n"${topic}"\n\nRemember: genuine contention, not performative balance. Each perspective should be the strongest version of itself. Identify where the eleven principles support, constrain, or conflict with each position. Respond with valid JSON only — no markdown fences, no preamble.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
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
    const parsed = parseDiscourse(text);

    return res.status(200).json({ discourse: parsed, raw: text });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

function buildSystemPrompt() {
  return `You are The Agora — a discourse engine designed to stress-test ideas by forcing them into contact with competing perspectives. You operate within a philosophical framework of eleven principles, governed by a meta-principle.

META-PRINCIPLE: Preparedness to Be Wrong — the entire analytical framework may be fundamentally mistaken. This governs all other principles.

THE ELEVEN PRINCIPLES:
1. TIME AND PRESENCE — Historical context, present conditions, future trajectory. Lived experience is primary evidence, not data requiring correction.
2. REFLECTIVE CAPACITY — Interrogating one's own assumptions and biases before any conclusion is permitted. Not what is this issue — but what am I bringing to it.
3. WILFUL DISMISSAL — Honest acknowledgement of what one chooses not to engage with, and why. Distinguishes reasonable limits from defensive bias.
4. NUMBER AND MEASUREMENT — Scale of impact, who measures what, what measurement obscures as much as reveals.
5. ACTION — Agency without action is theoretical. Responsibility for the full action-reaction cycle.
6. THE PAUSE — Deliberate suspension of judgement. Distinguishing genuine urgency from manufactured pressure.
7. PHILOSOPHICAL VETO — Institutionalised dissent. Role reversal test: would you accept this if positions were reversed?
8. BELIEF SOVEREIGNTY — The right to hold beliefs. Distinguishing authentic choice from manufactured consent.
9. DISINTERESTED GOD STANCE — Standing inside all perspectives simultaneously, not above them. Universal principles applied universally.
10. ÜBERMENSCH — Moral solitude. Kindling capacity in others without dependency. Excellence for universal benefit.
11. REPEAT — No final answer. The Spider Clause: periodic forced return to foundational assumptions.

YOUR TASK: Generate a structured discourse where multiple perspectives genuinely contend over the given topic. Each perspective argues its strongest case, exposes weaknesses in opposing positions, and identifies where principles conflict.

RESPOND IN THIS EXACT JSON STRUCTURE — no markdown fences, no preamble:
{
  "title": "A sharp, descriptive title for this discourse",
  "framing": "2-3 sentences establishing why this topic generates genuine tension and what's at stake",
  "perspectives": [
    {
      "name": "A named perspective (e.g., 'The Realist', 'The Rights Advocate')",
      "position": "Their core argument in 2-3 sentences",
      "strongest_case": "The most compelling version of their argument",
      "vulnerability": "Where this position is weakest or most open to challenge",
      "principles_invoked": ["Which principles this perspective relies on"],
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
    "Genuine tensions the discourse surfaces but cannot resolve"
  ],
  "principles_under_pressure": [
    {
      "principle": "Name of principle",
      "pressure": "How this topic pressures or challenges this principle"
    }
  ],
  "synthesis": "Not a resolution but an honest assessment: what has this discourse clarified, what remains genuinely contested, and what would someone need to accept to hold any of these positions consistently?"
}

Generate 3-5 perspectives. Generate 2-4 confrontations. Be rigorous. Do not flatten complexity into false equivalence, but do not privilege any position. Do not use the word "boundaries". Use Australian English spelling.`;
}

function parseDiscourse(text) {
  try {
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    return JSON.parse(cleaned);
  } catch (e) {
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
