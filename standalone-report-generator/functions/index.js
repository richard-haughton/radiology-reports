const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();

const openAiApiKey = defineSecret('OPENAI_API_KEY');

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

async function callGemini(model, prompt, apiKey) {
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: String(prompt.system || '') }]
        },
        contents: [{ role: 'user', parts: [{ text: String(prompt.user || '') }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048
        }
      })
    }
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(mapProviderError('Gemini', response.status, body));
  }

  const content = body && body.candidates && body.candidates[0] && body.candidates[0].content && Array.isArray(body.candidates[0].content.parts)
    ? body.candidates[0].content.parts.map((part) => String((part && part.text) || '')).join('')
    : '';

  return content;
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
  secrets: [openAiApiKey]
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
      let apiKey = providerApiKey;
      if (apiKey) {
        await saveProviderApiKey(decodedUser.uid, 'anthropic', apiKey);
      } else {
        apiKey = await getStoredProviderApiKey(decodedUser.uid, 'anthropic');
      }

      if (!apiKey) {
        throw new Error('Claude API key is not saved yet. Enter your Claude key in AI Settings and generate once to save it.');
      }

      content = await callAnthropic(model, prompt, apiKey);
    } else if (provider === 'gemini') {
      throw new Error('Gemini is not configured yet. Add GEMINI_API_KEY and bind it in functions before using this provider.');
    } else {
      const apiKey = String(openAiApiKey.value() || '').trim();
      if (!apiKey) {
        throw new Error('OpenAI API key is not configured on Firebase Functions.');
      }
      content = await callOpenAi(model, prompt, apiKey);
    }

    res.status(200).json({ content });
  } catch (err) {
    const message = err && err.message ? err.message : 'Failed to generate report.';
    res.status(500).json({ error: { message } });
  }
});
