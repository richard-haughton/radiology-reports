const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();

const openAiApiKey = defineSecret('OPENAI_API_KEY');
const claudeApiKey = defineSecret('CLAUDE_API_KEY');

function badRequest(res, message) {
  res.status(400).json({ error: { message } });
}

function unauthorized(res, message) {
  res.status(401).json({ error: { message } });
}

function mapProviderError(provider, status, body) {
  if (body && body.error && typeof body.error.message === 'string') {
    return body.error.message;
  }
  return provider + ' request failed (' + status + ').';
}

async function callOpenAi(model, prompt, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: String(prompt.system || '') },
        { role: 'user', content: String(prompt.user || '') }
      ]
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(mapProviderError('OpenAI', response.status, body));
  }

  const content = body && body.choices && body.choices[0] && body.choices[0].message
    ? String(body.choices[0].message.content || '')
    : '';

  return content;
}

async function callAnthropic(model, prompt, apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: String(prompt.system || ''),
      messages: [{ role: 'user', content: String(prompt.user || '') }]
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(mapProviderError('Anthropic', response.status, body));
  }

  const content = Array.isArray(body && body.content)
    ? body.content.map((part) => String((part && part.text) || '')).join('')
    : '';

  return content;
}

function normalizeAnthropicModel(model) {
  const clean = String(model || '').trim();
  if (!clean) return 'claude-sonnet-4-6';

  const aliases = {
    'claude-3-5-sonnet-latest': 'claude-sonnet-4-6',
    'claude-3-5-haiku-latest': 'claude-sonnet-4-6',
    'claude-3-opus-latest': 'claude-opus-4-6',
    'claude-sonnet-4-6': 'claude-sonnet-4-6',
    'claude-opus-4-6': 'claude-opus-4-6',
    'claude-opus-4-7': 'claude-opus-4-7',
    'claude-opus-4-8': 'claude-opus-4-8',
    'claude-fable-5': 'claude-fable-5'
  };

  return aliases[clean] || 'claude-sonnet-4-6';
}

async function getVerifiedUser(req) {
  const authHeader = String(req.headers.authorization || '');
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new Error('Missing Firebase auth token.');
  }

  const idToken = match[1].trim();
  if (!idToken) {
    throw new Error('Missing Firebase auth token.');
  }

  return admin.auth().verifyIdToken(idToken);
}

async function getStoredProviderApiKey(uid, provider) {
  const doc = await admin.firestore()
    .collection('users')
    .doc(uid)
    .collection('aiProviderKeys')
    .doc(provider)
    .get();

  if (!doc.exists) return '';
  const data = doc.data() || {};
  return String(data.apiKey || '').trim();
}

async function saveProviderApiKey(uid, provider, apiKey) {
  await admin.firestore()
    .collection('users')
    .doc(uid)
    .collection('aiProviderKeys')
    .doc(provider)
    .set({
      apiKey: String(apiKey || '').trim(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}

exports.aiProxy = onRequest({
  region: 'us-central1',
  timeoutSeconds: 60,
  cors: true,
  secrets: [openAiApiKey, claudeApiKey]
}, async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed.' } });
    return;
  }

  let decodedUser;
  try {
    decodedUser = await getVerifiedUser(req);
  } catch (err) {
    unauthorized(res, err && err.message ? err.message : 'Unauthorized request.');
    return;
  }

  const provider = String((req.body && req.body.provider) || 'openai').trim().toLowerCase() || 'openai';
  const model = String((req.body && req.body.model) || '').trim();
  const providerApiKey = String((req.body && req.body.providerApiKey) || '').trim();
  const prompt = req.body && req.body.prompt ? req.body.prompt : {};

  if (!model) {
    badRequest(res, 'Missing model.');
    return;
  }

  if (!prompt || typeof prompt !== 'object') {
    badRequest(res, 'Missing prompt.');
    return;
  }

  try {
    let content = '';

    if (provider === 'anthropic') {
      // Key priority: (1) key sent in this request body, (2) CLAUDE_API_KEY Firebase secret, (3) user-stored Firestore key
      const normalizedModel = normalizeAnthropicModel(model);
      let apiKey = providerApiKey;
      if (apiKey) {
        // User provided a key in this request — save it for future Firestore fallback
        await saveProviderApiKey(decodedUser.uid, 'anthropic', apiKey).catch(() => {});
      } else {
        // Prefer the shared Firebase Secret over any previously-stored per-user key
        apiKey = String(claudeApiKey.value() || '').trim();
        if (apiKey) {
          console.log('Using CLAUDE_API_KEY Firebase secret.');
        } else {
          // Last resort: user-stored Firestore key (e.g. before secret was configured)
          try {
            apiKey = await getStoredProviderApiKey(decodedUser.uid, 'anthropic');
          } catch (fsErr) {
            console.error('Firestore key lookup failed:', fsErr);
          }
        }
      }

      if (!apiKey) {
        throw new Error('Claude API key is not configured. Save a Claude key in AI Settings or set CLAUDE_API_KEY in Firebase Functions and deploy.');
      }

      if (normalizedModel !== model) {
        console.log('Normalized Anthropic model from', model, 'to', normalizedModel);
      }

      content = await callAnthropic(normalizedModel, prompt, apiKey);
    } else {
      const apiKey = String(openAiApiKey.value() || '').trim();
      if (!apiKey) {
        throw new Error('OpenAI API key is not configured on Firebase Functions.');
      }
      content = await callOpenAi(model, prompt, apiKey);
    }

    res.status(200).json({ content });
  } catch (err) {
    console.error('aiProxy error:', err);
    const message = err && err.message ? err.message : 'Failed to generate report.';
    res.status(500).json({ error: { message } });
  }
});
