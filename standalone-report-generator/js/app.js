var _uid = null;
var _templates = [];
var _pendingTemplateSelection = '';
var _unsubscribeTemplates = null;
var _phraseHandlings = [];
var _pendingPhraseHandlingSelection = '';
var _unsubscribePhraseHandlings = null;
var _toastTimer = null;
var OPENAI_KEY_STORAGE_KEY = 'reportGenerator.openAiApiKey';

document.addEventListener('DOMContentLoaded', function() {
  // Dark mode
  var THEME_KEY = 'reportGenerator.theme';
  function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var toggleBtn = document.getElementById('btn-dark-toggle');
    if (toggleBtn) toggleBtn.textContent = dark ? '☀️' : '🌙';
  }
  var savedTheme = localStorage.getItem(THEME_KEY);
  var prefersDark = savedTheme ? savedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark);

  var darkToggleBtn = document.getElementById('btn-dark-toggle');
  if (darkToggleBtn) {
    darkToggleBtn.addEventListener('click', function() {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      applyTheme(!isDark);
      localStorage.setItem(THEME_KEY, !isDark ? 'dark' : 'light');
    });
  }

  var signInBtn = document.getElementById('btn-google-sign-in');
  var signOutBtn = document.getElementById('btn-sign-out');

  if (signInBtn) {
    signInBtn.addEventListener('click', function() {
      var errEl = document.getElementById('auth-error');
      if (errEl) errEl.style.display = 'none';

      var provider = new firebase.auth.GoogleAuthProvider();
      appAuth.signInWithPopup(provider).catch(function(err) {
        if (errEl) {
          errEl.textContent = err && err.message ? err.message : 'Sign-in failed.';
          errEl.style.display = 'block';
        }
      });
    });
  }

  if (signOutBtn) {
    signOutBtn.addEventListener('click', function() {
      appAuth.signOut();
    });
  }

  bindReportEvents();
  initOpenAiKeyControls();

  appAuth.onAuthStateChanged(function(user) {
    if (!user) {
      teardownUserSubscriptions();
      _uid = null;
      document.getElementById('auth-screen').style.display = 'grid';
      document.getElementById('app').style.display = 'none';
      return;
    }

    _uid = user.uid;
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('user-name').textContent = user.displayName || user.email || '';

    subscribeTemplates();
    subscribePhraseHandlings();
  });
});

function bindReportEvents() {
  var templateSelect = document.getElementById('report-template-select');
  var importBtn = document.getElementById('btn-report-template-import');
  var importInput = document.getElementById('report-template-import-input');

  if (templateSelect) {
    templateSelect.addEventListener('change', function() {
      _pendingTemplateSelection = String(templateSelect.value || '').trim();
      populateTemplateEditorFromSelection();
    });
  }

  if (importBtn && importInput) {
    importBtn.addEventListener('click', function() {
      importInput.click();
    });
    importInput.addEventListener('change', handleImportTemplateFile);
  }

  var saveBtn = document.getElementById('btn-save-manual-template');
  if (saveBtn) saveBtn.addEventListener('click', handleSaveTemplate);

  var newBtn = document.getElementById('btn-new-manual-template');
  if (newBtn) newBtn.addEventListener('click', handleNewTemplate);

  var deleteBtn = document.getElementById('btn-delete-manual-template');
  if (deleteBtn) deleteBtn.addEventListener('click', handleDeleteTemplate);

  var appendBtn = document.getElementById('btn-append-template-to-body');
  if (appendBtn) appendBtn.addEventListener('click', handleAppendTemplateToBody);

  var generateBtn = document.getElementById('btn-generate-report');
  if (generateBtn) generateBtn.addEventListener('click', handleGenerateReport);

  var useDirectBtn = document.getElementById('btn-use-template-direct');
  if (useDirectBtn) useDirectBtn.addEventListener('click', handleUseTemplateDirect);

  var copyBtn = document.getElementById('btn-copy-report');
  if (copyBtn) copyBtn.addEventListener('click', handleCopyReportOutput);

  var clearSavedKeyBtn = document.getElementById('btn-clear-openai-api-key');
  if (clearSavedKeyBtn) clearSavedKeyBtn.addEventListener('click', handleClearSavedOpenAiKey);

  var savePhraseBtn = document.getElementById('btn-save-phrase-handling');
  if (savePhraseBtn) savePhraseBtn.addEventListener('click', handleSavePhraseHandling);

  var newPhraseBtn = document.getElementById('btn-new-phrase-handling');
  if (newPhraseBtn) newPhraseBtn.addEventListener('click', handleNewPhraseHandling);

  var deletePhraseBtn = document.getElementById('btn-delete-phrase-handling');
  if (deletePhraseBtn) deletePhraseBtn.addEventListener('click', handleDeletePhraseHandling);

  var phraseSelect = document.getElementById('phrase-handling-select');
  if (phraseSelect) {
    phraseSelect.addEventListener('change', function() {
      _pendingPhraseHandlingSelection = String(phraseSelect.value || '').trim();
      populatePhraseHandlingEditorFromSelection();
    });
  }
}

function initOpenAiKeyControls() {
  var keyInput = document.getElementById('openai-api-key-input');
  var rememberCheckbox = document.getElementById('remember-openai-api-key');
  if (!keyInput || !rememberCheckbox) return;

  var saved = '';
  try {
    saved = String(localStorage.getItem(OPENAI_KEY_STORAGE_KEY) || '').trim();
  } catch (err) {
    saved = '';
  }

  if (saved) {
    keyInput.value = saved;
    rememberCheckbox.checked = true;
  }

  keyInput.addEventListener('input', function() {
    if (!rememberCheckbox.checked) return;
    persistOpenAiKey(String(keyInput.value || '').trim());
  });

  rememberCheckbox.addEventListener('change', function() {
    if (rememberCheckbox.checked) {
      persistOpenAiKey(String(keyInput.value || '').trim());
      return;
    }
    clearPersistedOpenAiKey();
  });
}

function persistOpenAiKey(value) {
  var clean = String(value || '').trim();
  try {
    if (!clean) {
      localStorage.removeItem(OPENAI_KEY_STORAGE_KEY);
      return;
    }
    localStorage.setItem(OPENAI_KEY_STORAGE_KEY, clean);
  } catch (err) {
    // Ignore storage failures (private mode / quota).
  }
}

function clearPersistedOpenAiKey() {
  try {
    localStorage.removeItem(OPENAI_KEY_STORAGE_KEY);
  } catch (err) {
    // Ignore storage failures (private mode / quota).
  }
}

function handleClearSavedOpenAiKey() {
  var keyInput = document.getElementById('openai-api-key-input');
  var rememberCheckbox = document.getElementById('remember-openai-api-key');
  if (keyInput) keyInput.value = '';
  if (rememberCheckbox) rememberCheckbox.checked = false;
  clearPersistedOpenAiKey();
  setReportStatus('Saved OpenAI key cleared from this browser.', false);
}

function teardownUserSubscriptions() {
  if (_unsubscribeTemplates) {
    _unsubscribeTemplates();
    _unsubscribeTemplates = null;
  }
  if (_unsubscribePhraseHandlings) {
    _unsubscribePhraseHandlings();
    _unsubscribePhraseHandlings = null;
  }
  _templates = [];
  _pendingTemplateSelection = '';
  _phraseHandlings = [];
  _pendingPhraseHandlingSelection = '';
}

function userRef(uid) {
  return appDb.collection('users').doc(uid);
}

function reportTemplatesRef(uid) {
  return userRef(uid).collection('reportTemplates');
}

function subscribeTemplates() {
  if (!_uid) return;
  if (_unsubscribeTemplates) _unsubscribeTemplates();

  _unsubscribeTemplates = reportTemplatesRef(_uid).onSnapshot(function(snapshot) {
    _templates = snapshot.docs.map(function(doc) {
      var data = doc.data() || {};
      data.id = doc.id;
      data.name = String(data.name || '').trim() || 'Untitled Template';
      data.body = String(data.body || '');
      data.rulesText = String(data.rulesText || '');
      return data;
    }).sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });

    renderTemplateOptions();
  }, function(err) {
    console.error('templates subscription error:', err);
    setReportStatus('Failed to load templates: ' + ((err && err.message) || 'Unknown error.'), true);
  });
}

function renderTemplateOptions() {
  var select = document.getElementById('report-template-select');
  if (!select) return;

  var selected = String(_pendingTemplateSelection || select.value || '').trim();

  function option(t) {
    return '<option value="' + escapeHtmlAttr(t.id) + '">' + escapeHtmlText(t.name) + '</option>';
  }

  var html = '<option value="">No template</option>';
  _templates.forEach(function(t) { html += option(t); });

  select.innerHTML = html;
  if (selected && _templates.some(function(t) { return t.id === selected; })) {
    select.value = selected;
  } else {
    select.value = '';
  }

  _pendingTemplateSelection = String(select.value || '').trim();
  populateTemplateEditorFromSelection();
}

function getSelectedTemplate() {
  var select = document.getElementById('report-template-select');
  var id = select ? String(select.value || '').trim() : '';
  if (!id) return null;
  return _templates.find(function(t) { return t.id === id; }) || null;
}

function populateTemplateEditorFromSelection() {
  var selected = getSelectedTemplate();
  var nameEl = document.getElementById('manual-template-name');
  var bodyEl = document.getElementById('manual-template-input');

  if (!nameEl || !bodyEl) return;

  if (!selected) {
    nameEl.value = '';
    bodyEl.value = '';
    return;
  }

  nameEl.value = String(selected.name || '');
  bodyEl.value = String(selected.body || '');
}

function getTemplateEditorState() {
  var nameEl = document.getElementById('manual-template-name');
  var bodyEl = document.getElementById('manual-template-input');
  return {
    name: nameEl ? String(nameEl.value || '').trim() : '',
    body: bodyEl ? String(bodyEl.value || '').trim() : ''
  };
}

function handleNewTemplate() {
  var select = document.getElementById('report-template-select');
  if (select) select.value = '';
  _pendingTemplateSelection = '';
  populateTemplateEditorFromSelection();
}

function handleAppendTemplateToBody() {
  var selected = getSelectedTemplate();
  if (!selected || !String(selected.body || '').trim()) {
    setReportStatus('Select a template with body text first.', true);
    return;
  }

  var bodyEl = document.getElementById('manual-template-input');
  if (!bodyEl) return;

  var current = String(bodyEl.value || '');
  bodyEl.value = current ? current.trimEnd() + '\n\n' + selected.body : selected.body;
}

async function handleSaveTemplate() {
  if (!_uid) return;

  var state = getTemplateEditorState();
  if (!state.body) {
    setReportStatus('Template body cannot be empty.', true);
    return;
  }

  var selected = getSelectedTemplate();
  var templateId = selected ? String(selected.id || '').trim() : '';
  var name = state.name || (selected ? String(selected.name || '') : '') || 'Manual Template';

  var payload = {
    name: name,
    body: state.body,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdAt: selected && selected.createdAt ? selected.createdAt : firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    if (templateId) {
      await reportTemplatesRef(_uid).doc(templateId).set(payload, { merge: true });
      _pendingTemplateSelection = templateId;
    } else {
      var ref = await reportTemplatesRef(_uid).add(payload);
      _pendingTemplateSelection = ref.id;
    }

    showToast('Template saved.');
    setReportStatus('Template saved.', false);
  } catch (err) {
    setReportStatus((err && err.message) || 'Failed to save template.', true);
  }
}

async function handleDeleteTemplate() {
  if (!_uid) return;

  var selected = getSelectedTemplate();
  if (!selected) {
    setReportStatus('Select a template to delete.', true);
    return;
  }

  var ok = window.confirm('Delete "' + selected.name + '"? This cannot be undone.');
  if (!ok) return;

  try {
    await reportTemplatesRef(_uid).doc(selected.id).delete();
    _pendingTemplateSelection = '';
    populateTemplateEditorFromSelection();
    showToast('Template deleted.');
    setReportStatus('Template deleted.', false);
  } catch (err) {
    setReportStatus((err && err.message) || 'Failed to delete template.', true);
  }
}

async function handleImportTemplateFile(event) {
  if (!_uid) return;

  var input = event && event.target ? event.target : null;
  var file = input && input.files && input.files[0] ? input.files[0] : null;
  if (!file) return;

  var lower = String(file.name || '').toLowerCase();
  var isTxt = lower.endsWith('.txt');
  var isRtf = lower.endsWith('.rtf');

  if (!isTxt && !isRtf) {
    setReportStatus('Only .txt and .rtf files are supported.', true);
    if (input) input.value = '';
    return;
  }

  try {
    var raw = await file.text();
    var body = isRtf ? stripRtfToText(raw) : raw;
    var name = String(file.name || '').replace(/\.[^.]+$/, '') || 'Imported Template';

    var ref = await reportTemplatesRef(_uid).add({
      name: name,
      body: body,
      rulesText: '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    _pendingTemplateSelection = ref.id;
    showToast('Template imported.');
    setReportStatus('Template imported.', false);
  } catch (err) {
    setReportStatus((err && err.message) || 'Failed to import template.', true);
  } finally {
    if (input) input.value = '';
  }
}

function getReportLanguageMode() {
  var select = document.getElementById('report-findings-language-mode');
  var value = select ? String(select.value || '').trim() : '';
  if (value === 'keep' || value === 'omit') return value;
  return 'improve';
}

function getReportImpressionMode() {
  var select = document.getElementById('report-impression-mode');
  var value = select ? String(select.value || '').trim() : '';
  if (value === 'expound' || value === 'omit') return value;
  return 'concise';
}

function getRequestedSections() {
  var sections = [];
  if (getReportLanguageMode() !== 'omit') sections.push('Findings');
  if (getReportImpressionMode() !== 'omit') sections.push('Impression');
  return sections;
}

async function handleGenerateReport() {
  if (!_uid) return;

  var findingsEl = document.getElementById('report-findings-input');
  var outputEl = document.getElementById('report-output');

  if (!findingsEl || !outputEl) return;

  var findings = String(findingsEl.value || '').trim();
  var selectedTemplate = getSelectedTemplate();
  var templateState = getTemplateEditorState();
  var requestedSections = getRequestedSections();

  if (!requestedSections.length) {
    setReportStatus('Enable at least one output section before generating.', true);
    return;
  }

  setReportStatus('Generating report...', false);

  try {
    var response = await generateWithBrowserOpenAi({
      provider: getSelectedAiProvider(),
      model: getSelectedAiModel(),
      findings: findings,
      sectionOrder: requestedSections,
      findingsLanguageMode: getReportLanguageMode(),
      impressionMode: getReportImpressionMode(),
      templateText: templateState.body || (selectedTemplate ? selectedTemplate.body : ''),
      phraseHandlingText: getActivePhraseHandlingText()
    });

    var sections = response && response.data && response.data.sections ? response.data.sections : (response && response.sections ? response.sections : {});
    var ordered = Object.keys(sections || {});

    if (!ordered.length) {
      var message = response && response.data && response.data.text ? String(response.data.text) : '';
      outputEl.value = message;
    } else {
      outputEl.value = ordered.map(function(key) {
        return String(key).toUpperCase() + ':\n' + String(sections[key] || '').trim();
      }).join('\n\n');
    }

    setReportStatus('Draft generated.', false);
    showToast('Report draft generated.');
  } catch (err) {
    setReportStatus((err && err.message) || 'Failed to generate report.', true);
  }
}

function handleCopyReportOutput() {
  var outputEl = document.getElementById('report-output');
  if (!outputEl) return;

  var text = String(outputEl.value || '').trim();
  if (!text) {
    setReportStatus('No report text to copy.', true);
    return;
  }

  if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      showToast('Report copied.');
      setReportStatus('Report copied to clipboard.', false);
    }).catch(function() {
      setReportStatus('Failed to copy report.', true);
    });
    return;
  }

  outputEl.focus();
  outputEl.select();
  try {
    document.execCommand('copy');
    showToast('Report copied.');
    setReportStatus('Report copied to clipboard.', false);
  } catch (err) {
    setReportStatus('Failed to copy report.', true);
  }
}

function getOpenAiApiKey() {
  var keyInput = document.getElementById('openai-api-key-input');
  var rememberCheckbox = document.getElementById('remember-openai-api-key');
  var key = keyInput ? String(keyInput.value || '').trim() : '';

  if (rememberCheckbox && rememberCheckbox.checked) {
    persistOpenAiKey(key);
  }

  return key;
}

// ── Phrase Handling ──────────────────────────────────────────────────────────

function phraseHandlingsRef(uid) {
  return userRef(uid).collection('phraseHandlings');
}

function subscribePhraseHandlings() {
  if (!_uid) return;
  if (_unsubscribePhraseHandlings) _unsubscribePhraseHandlings();

  _unsubscribePhraseHandlings = phraseHandlingsRef(_uid).onSnapshot(function(snapshot) {
    _phraseHandlings = snapshot.docs.map(function(doc) {
      var data = doc.data() || {};
      data.id = doc.id;
      data.name = String(data.name || '').trim() || 'Untitled';
      data.text = String(data.text || '');
      return data;
    }).sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });

    renderPhraseHandlingOptions();
    renderPhraseHandlingChecklist();
  }, function(err) {
    console.error('phrase handlings subscription error:', err);
  });
}

function renderPhraseHandlingOptions() {
  var select = document.getElementById('phrase-handling-select');
  if (!select) return;

  var selected = String(_pendingPhraseHandlingSelection || select.value || '').trim();
  var html = '<option value="">New phrase handling</option>';
  _phraseHandlings.forEach(function(p) {
    html += '<option value="' + escapeHtmlAttr(p.id) + '">' + escapeHtmlText(p.name) + '</option>';
  });

  select.innerHTML = html;
  if (selected && _phraseHandlings.some(function(p) { return p.id === selected; })) {
    select.value = selected;
  } else {
    select.value = '';
  }

  _pendingPhraseHandlingSelection = String(select.value || '').trim();
  populatePhraseHandlingEditorFromSelection();
}

function renderPhraseHandlingChecklist() {
  var container = document.getElementById('phrase-handling-checklist');
  if (!container) return;

  if (!_phraseHandlings.length) {
    container.innerHTML = '<p class="phrase-checklist-empty muted">No phrase handling saved yet.</p>';
    return;
  }

  // Preserve current checked state across re-renders.
  var checked = {};
  container.querySelectorAll('input.phrase-check').forEach(function(cb) {
    checked[cb.value] = cb.checked;
  });

  var html = '';
  _phraseHandlings.forEach(function(p) {
    var isChecked = p.id in checked ? checked[p.id] : true;
    html += '<label class="phrase-check-item">'
      + '<input type="checkbox" class="phrase-check" value="' + escapeHtmlAttr(p.id) + '"' + (isChecked ? ' checked' : '') + ' />'
      + ' ' + escapeHtmlText(p.name)
      + '</label>';
  });

  container.innerHTML = html;
}

function getSelectedPhraseHandling() {
  var select = document.getElementById('phrase-handling-select');
  var id = select ? String(select.value || '').trim() : '';
  if (!id) return null;
  return _phraseHandlings.find(function(p) { return p.id === id; }) || null;
}

function populatePhraseHandlingEditorFromSelection() {
  var selected = getSelectedPhraseHandling();
  var nameEl = document.getElementById('phrase-handling-name');
  var textEl = document.getElementById('phrase-handling-text');

  if (!nameEl || !textEl) return;

  if (!selected) {
    nameEl.value = '';
    textEl.value = '';
    return;
  }

  nameEl.value = String(selected.name || '');
  textEl.value = String(selected.text || '');
}

function getPhraseHandlingEditorState() {
  var nameEl = document.getElementById('phrase-handling-name');
  var textEl = document.getElementById('phrase-handling-text');
  return {
    name: nameEl ? String(nameEl.value || '').trim() : '',
    text: textEl ? String(textEl.value || '').trim() : ''
  };
}

function handleNewPhraseHandling() {
  var select = document.getElementById('phrase-handling-select');
  if (select) select.value = '';
  _pendingPhraseHandlingSelection = '';
  populatePhraseHandlingEditorFromSelection();
}

async function handleSavePhraseHandling() {
  if (!_uid) return;

  var state = getPhraseHandlingEditorState();
  if (!state.text) {
    setReportStatus('Phrase handling instructions cannot be empty.', true);
    return;
  }

  var selected = getSelectedPhraseHandling();
  var phraseId = selected ? String(selected.id || '').trim() : '';
  var name = state.name || 'Unnamed';

  var payload = {
    name: name,
    text: state.text,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdAt: selected && selected.createdAt ? selected.createdAt : firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    if (phraseId) {
      await phraseHandlingsRef(_uid).doc(phraseId).set(payload, { merge: true });
      _pendingPhraseHandlingSelection = phraseId;
    } else {
      var ref = await phraseHandlingsRef(_uid).add(payload);
      _pendingPhraseHandlingSelection = ref.id;
    }
    showToast('Phrase handling saved.');
    setReportStatus('Phrase handling saved.', false);
  } catch (err) {
    setReportStatus((err && err.message) || 'Failed to save phrase handling.', true);
  }
}

async function handleDeletePhraseHandling() {
  if (!_uid) return;

  var selected = getSelectedPhraseHandling();
  if (!selected) {
    setReportStatus('Select a phrase handling to delete.', true);
    return;
  }

  var ok = window.confirm('Delete "' + selected.name + '"? This cannot be undone.');
  if (!ok) return;

  try {
    await phraseHandlingsRef(_uid).doc(selected.id).delete();
    _pendingPhraseHandlingSelection = '';
    populatePhraseHandlingEditorFromSelection();
    showToast('Phrase handling deleted.');
    setReportStatus('Phrase handling deleted.', false);
  } catch (err) {
    setReportStatus((err && err.message) || 'Failed to delete phrase handling.', true);
  }
}

function getActivePhraseHandlingText() {
  var container = document.getElementById('phrase-handling-checklist');
  if (!container) return '';

  var lines = [];
  container.querySelectorAll('input.phrase-check:checked').forEach(function(cb) {
    var id = String(cb.value || '').trim();
    var ph = _phraseHandlings.find(function(p) { return p.id === id; });
    if (ph && String(ph.text || '').trim()) {
      lines.push(String(ph.text).trim());
    }
  });
  return lines.join('\n');
}

function handleUseTemplateDirect() {
  var templateState = getTemplateEditorState();
  var selectedTemplate = getSelectedTemplate();
  var body = templateState.body || (selectedTemplate ? selectedTemplate.body : '');
  var outputEl = document.getElementById('report-output');
  if (!outputEl) return;

  if (!body) {
    setReportStatus('No template body to use. Select or create a template first.', true);
    return;
  }

  outputEl.value = body;
  setReportStatus('Template placed in output. Edit as needed.', false);
  showToast('Template applied directly.');
}

// ─────────────────────────────────────────────────────────────────────────────

function buildReportPrompt(payload) {
  var findingsModeMap = {
    keep: 'Keep findings wording exactly the same when possible.',
    improve: 'Improve grammar and readability while preserving clinical meaning.',
    omit: 'Do not include a Findings section.'
  };
  var impressionModeMap = {
    concise: 'Write a concise Impression.',
    expound: 'Write an expanded Impression with clear prioritization.',
    omit: 'Do not include an Impression section.'
  };

  var instructions = [
    'You are generating a radiology report draft.',
    'Return valid JSON only with this shape:',
    '{"sections":{"Findings":"...","Impression":"..."}}',
    'Only include requested sections.',
    'Do not add markdown fences.',
    'If phraseHandlingRules are provided, follow them exactly when choosing wording.'
  ];

  var context = {
    requestedSections: payload.sectionOrder || [],
    findingsLanguageRule: findingsModeMap[payload.findingsLanguageMode] || findingsModeMap.improve,
    impressionRule: impressionModeMap[payload.impressionMode] || impressionModeMap.concise,
    findingsInput: payload.findings || '',
    templateText: payload.templateText || '',
    phraseHandlingRules: payload.phraseHandlingText || ''
  };

  return {
    system: instructions.join('\n'),
    user: JSON.stringify(context)
  };
}

function extractJsonObject(text) {
  var raw = String(text || '').trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (err) {
    // Continue and attempt to parse the first JSON object in free text.
  }

  var first = raw.indexOf('{');
  var last = raw.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;

  var candidate = raw.slice(first, last + 1);
  try {
    return JSON.parse(candidate);
  } catch (err2) {
    return null;
  }
}

async function generateWithBrowserOpenAi(payload) {
  if (String(payload.provider || '').trim() !== 'openai') {
    throw new Error('Only OpenAI provider is supported in browser-key mode.');
  }

  var apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error('Enter an OpenAI API key to generate a report.');
  }

  var prompt = buildReportPrompt(payload || {});
  var response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model: String(payload.model || 'gpt-4o-mini').trim(),
      temperature: 0.2,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ]
    })
  });

  var data = await response.json().catch(function() { return {}; });
  if (!response.ok) {
    var msg = (data && data.error && data.error.message) || ('OpenAI request failed (' + response.status + ').');
    throw new Error(msg);
  }

  var content = data && data.choices && data.choices[0] && data.choices[0].message
    ? String(data.choices[0].message.content || '')
    : '';

  var parsed = extractJsonObject(content);
  if (parsed && parsed.sections && typeof parsed.sections === 'object') {
    return { data: { sections: parsed.sections } };
  }

  return { data: { text: content, sections: {} } };
}

function getSelectedAiProvider() {
  var select = document.getElementById('ai-provider-select');
  return select ? String(select.value || 'openai').trim() : 'openai';
}

function getSelectedAiModel() {
  var select = document.getElementById('ai-model-input');
  return select ? String(select.value || '').trim() : '';
}

function setReportStatus(message, isError) {
  var el = document.getElementById('report-status');
  if (!el) return;
  el.textContent = message || '';
  el.style.color = isError ? 'var(--danger)' : 'var(--ink-muted)';
}

function showToast(message) {
  var el = document.getElementById('toast');
  if (!el) return;

  el.textContent = String(message || '');
  el.style.display = 'block';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function() {
    el.style.display = 'none';
  }, 2600);
}

function stripRtfToText(raw) {
  var text = String(raw || '');
  text = text.replace(/\\par[d]?\b/gi, '\n');
  text = text.replace(/\\line\b/gi, '\n');
  text = text.replace(/\\'([0-9a-fA-F]{2})/g, function(_, hex) {
    return String.fromCharCode(parseInt(hex, 16));
  });
  text = text.replace(/\\[a-z]+-?\d* ?/gi, '');
  text = text.replace(/\\([{}\\])/g, '$1');
  text = text.replace(/[{}]/g, '');
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function escapeHtmlText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeHtmlAttr(value) {
  return escapeHtmlText(value).replace(/`/g, '&#096;');
}
