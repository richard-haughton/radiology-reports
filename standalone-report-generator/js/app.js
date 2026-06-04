var _uid = null;
var _templates = [];
var _pendingTemplateSelection = '';
var _unsubscribeTemplates = null;
var _draftTemplatePhraseHandlingIds = null;
var _phraseHandlings = [];
var _pendingPhraseHandlingSelection = '';
var _unsubscribePhraseHandlings = null;
var _toastTimer = null;
var DESIRED_OUTPUT_TEXT_KEY = 'reportGenerator.desiredOutputDraft';
var DESIRED_OUTPUT_ENABLED_KEY = 'reportGenerator.desiredOutputLearningEnabled';
var ADAPTIVE_GUIDANCE_KEY = 'reportGenerator.adaptiveGuidanceByMode';
var AI_PROVIDER_CONFIG = {
  openai: {
    label: 'OpenAI',
    keyLabel: 'OpenAI API key',
    placeholder: 'sk-...',
    defaultModel: 'gpt-4o-mini',
    models: [
      { value: 'gpt-5.5', label: 'ChatGPT 5.5 (default)' },
      { value: 'gpt-5', label: 'ChatGPT 5' },
      { value: 'gpt-5-mini', label: 'ChatGPT 5 mini' },
      { value: 'gpt-4.5', label: 'GPT-4.5' },
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o mini' }
    ]
  },
  anthropic: {
    label: 'Claude / Anthropic',
    keyLabel: 'Claude / Anthropic API key',
    placeholder: 'sk-ant-...',
    defaultModel: 'claude-3-5-sonnet-latest',
    models: [
      { value: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' },
      { value: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
      { value: 'claude-3-opus-latest', label: 'Claude 3 Opus' }
    ]
  },
  gemini: {
    label: 'Gemini',
    keyLabel: 'Gemini API key',
    placeholder: 'AIza...',
    defaultModel: 'gemini-2.0-flash',
    models: [
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
      { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' }
    ]
  }
};

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
  initAiSettingsToggle();
  initDesiredOutputLearningUi();

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

  var clearSavedKeyBtn = document.getElementById('btn-clear-ai-api-key');
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

  var phraseChecklist = document.getElementById('phrase-handling-checklist');
  if (phraseChecklist) {
    phraseChecklist.addEventListener('change', handlePhraseChecklistChange);
  }

  var applyDesiredLearningBtn = document.getElementById('btn-apply-desired-output-learning');
  if (applyDesiredLearningBtn) applyDesiredLearningBtn.addEventListener('click', handleApplyDesiredOutputLearning);

  var desiredOutputInput = document.getElementById('desired-output-input');
  if (desiredOutputInput) {
    desiredOutputInput.addEventListener('input', function() {
      persistDesiredOutputDraft(desiredOutputInput.value || '');
    });
  }

  var desiredLearningToggle = document.getElementById('desired-output-learning-toggle');
  if (desiredLearningToggle) {
    desiredLearningToggle.addEventListener('change', function() {
      persistDesiredOutputLearningEnabled(desiredLearningToggle.checked);
    });
  }
}

function initOpenAiKeyControls() {
  var providerSelect = document.getElementById('ai-provider-select');
  var keyInput = document.getElementById('ai-api-key-input');
  var rememberCheckbox = document.getElementById('remember-ai-api-key');
  var keyLabel = document.getElementById('ai-api-key-label');
  var modelSelect = document.getElementById('ai-model-input');
  if (!providerSelect || !keyInput || !rememberCheckbox || !keyLabel || !modelSelect) return;

  function refreshForProvider(provider) {
    renderAiModelOptions(provider, modelSelect);
    applyAiProviderUi(provider, keyInput, rememberCheckbox, keyLabel);
    loadSavedAiKey(provider, keyInput, rememberCheckbox);
  }

  providerSelect.addEventListener('change', function() {
    refreshForProvider(getSelectedAiProvider());
  });

  keyInput.addEventListener('input', function() {
    var provider = getSelectedAiProvider();
    if (!rememberCheckbox.checked) return;
    persistAiKey(provider, String(keyInput.value || '').trim());
  });

  rememberCheckbox.addEventListener('change', function() {
    var provider = getSelectedAiProvider();
    if (rememberCheckbox.checked) {
      persistAiKey(provider, String(keyInput.value || '').trim());
      return;
    }
    clearPersistedAiKey(provider);
  });

  refreshForProvider(getSelectedAiProvider());
}

function initAiSettingsToggle() {
  var toggleBtn = document.getElementById('btn-toggle-ai-settings');
  var bodyEl = document.getElementById('ai-settings-body');
  if (!toggleBtn || !bodyEl) return;

  toggleBtn.addEventListener('click', function() {
    var expanded = String(toggleBtn.getAttribute('aria-expanded') || 'false') === 'true';
    var next = !expanded;
    toggleBtn.setAttribute('aria-expanded', next ? 'true' : 'false');
    bodyEl.style.display = next ? 'block' : 'none';
  });
}

function initDesiredOutputLearningUi() {
  var toggleBtn = document.getElementById('btn-toggle-desired-output');
  var bodyEl = document.getElementById('desired-output-body');
  var desiredOutputInput = document.getElementById('desired-output-input');
  var desiredLearningToggle = document.getElementById('desired-output-learning-toggle');

  if (desiredOutputInput) {
    desiredOutputInput.value = loadDesiredOutputDraft();
  }

  if (desiredLearningToggle) {
    desiredLearningToggle.checked = loadDesiredOutputLearningEnabled();
  }

  if (!toggleBtn || !bodyEl) return;
  toggleBtn.addEventListener('click', function() {
    var expanded = String(toggleBtn.getAttribute('aria-expanded') || 'false') === 'true';
    var next = !expanded;
    toggleBtn.setAttribute('aria-expanded', next ? 'true' : 'false');
    bodyEl.style.display = next ? 'block' : 'none';
  });
}

function setDesiredOutputLearningStatus(message, isError) {
  var el = document.getElementById('desired-output-learning-status');
  if (!el) return;
  el.textContent = message || '';
  el.style.color = isError ? 'var(--danger)' : 'var(--ink-muted)';
}

function getDesiredOutputDraft() {
  var input = document.getElementById('desired-output-input');
  return input ? String(input.value || '').trim() : '';
}

function getDesiredOutputLearningEnabled() {
  var toggle = document.getElementById('desired-output-learning-toggle');
  return !!(toggle && toggle.checked);
}

function persistDesiredOutputDraft(value) {
  try {
    localStorage.setItem(DESIRED_OUTPUT_TEXT_KEY, String(value || ''));
  } catch (err) {
    // Ignore localStorage failures.
  }
}

function loadDesiredOutputDraft() {
  try {
    return String(localStorage.getItem(DESIRED_OUTPUT_TEXT_KEY) || '');
  } catch (err) {
    return '';
  }
}

function persistDesiredOutputLearningEnabled(enabled) {
  try {
    localStorage.setItem(DESIRED_OUTPUT_ENABLED_KEY, enabled ? '1' : '0');
  } catch (err) {
    // Ignore localStorage failures.
  }
}

function loadDesiredOutputLearningEnabled() {
  try {
    var raw = String(localStorage.getItem(DESIRED_OUTPUT_ENABLED_KEY) || '').trim();
    if (!raw) return true;
    return raw !== '0';
  } catch (err) {
    return true;
  }
}

function loadAdaptiveGuidanceMap() {
  try {
    var raw = String(localStorage.getItem(ADAPTIVE_GUIDANCE_KEY) || '').trim();
    if (!raw) return {};
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch (err) {
    return {};
  }
}

function persistAdaptiveGuidanceMap(map) {
  try {
    localStorage.setItem(ADAPTIVE_GUIDANCE_KEY, JSON.stringify(map || {}));
  } catch (err) {
    // Ignore localStorage failures.
  }
}

function getSavedAdaptiveGuidanceForMode(outputMode) {
  var map = loadAdaptiveGuidanceMap();
  var cleanMode = String(outputMode || 'full').trim() || 'full';
  var entry = map[cleanMode] && typeof map[cleanMode] === 'object' ? map[cleanMode] : null;
  return entry ? String(entry.guidance || '').trim() : '';
}

function saveAdaptiveGuidanceForMode(outputMode, guidance, meta) {
  var cleanMode = String(outputMode || 'full').trim() || 'full';
  var cleanGuidance = String(guidance || '').trim();
  if (!cleanGuidance) return;

  var map = loadAdaptiveGuidanceMap();
  map[cleanMode] = {
    guidance: cleanGuidance,
    updatedAt: new Date().toISOString(),
    source: meta && meta.source ? String(meta.source) : 'desired-output'
  };
  persistAdaptiveGuidanceMap(map);
}

function handleClearSavedOpenAiKey() {
  var provider = getSelectedAiProvider();
  var providerConfig = getAiProviderConfig(provider);
  var keyInput = document.getElementById('ai-api-key-input');
  var rememberCheckbox = document.getElementById('remember-ai-api-key');
  if (keyInput) keyInput.value = '';
  if (rememberCheckbox) rememberCheckbox.checked = false;
  clearPersistedAiKey(provider);
  setReportStatus('Saved ' + providerConfig.label + ' key cleared from this browser.', false);
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
  _draftTemplatePhraseHandlingIds = null;
  _phraseHandlings = [];
  _pendingPhraseHandlingSelection = '';
}

function normalizePhraseHandlingIds(value) {
  if (!Array.isArray(value)) return [];

  var seen = {};
  return value.map(function(item) {
    return String(item || '').trim();
  }).filter(function(item) {
    if (!item || seen[item]) return false;
    seen[item] = true;
    return true;
  });
}

function getDefaultPhraseHandlingSelectionIds() {
  return _phraseHandlings.map(function(item) {
    return String(item.id || '').trim();
  }).filter(Boolean);
}

function getTemplatePhraseHandlingIds(template) {
  if (!template) return getDefaultPhraseHandlingSelectionIds();
  if (template.hasSelectedPhraseHandlingIds) {
    return normalizePhraseHandlingIds(template.selectedPhraseHandlingIds);
  }
  return getDefaultPhraseHandlingSelectionIds();
}

function setDraftTemplatePhraseHandlingIds(ids) {
  _draftTemplatePhraseHandlingIds = normalizePhraseHandlingIds(ids);
}

function getDraftTemplatePhraseHandlingIds() {
  return normalizePhraseHandlingIds(_draftTemplatePhraseHandlingIds || []);
}

function getSelectedPhraseHandlingIds() {
  var container = document.getElementById('phrase-handling-checklist');
  if (container) {
    return normalizePhraseHandlingIds(Array.prototype.map.call(
      container.querySelectorAll('input.phrase-check:checked'),
      function(cb) { return cb.value; }
    ));
  }

  return getDraftTemplatePhraseHandlingIds();
}

async function persistSelectedPhraseHandlingIdsForCurrentTemplate() {
  if (!_uid) return;

  var selectedTemplate = getSelectedTemplate();
  if (!selectedTemplate || !selectedTemplate.id) return;

  var selectedIds = getSelectedPhraseHandlingIds();
  setDraftTemplatePhraseHandlingIds(selectedIds);

  try {
    await reportTemplatesRef(_uid).doc(selectedTemplate.id).set({
      selectedPhraseHandlingIds: selectedIds,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    setReportStatus((err && err.message) || 'Failed to save phrase handling selection.', true);
  }
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
      data.studyType = String(data.studyType || '').trim();
      data.rulesText = String(data.rulesText || '');
      data.hasSelectedPhraseHandlingIds = Array.isArray(data.selectedPhraseHandlingIds);
      data.selectedPhraseHandlingIds = normalizePhraseHandlingIds(data.selectedPhraseHandlingIds);
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
    setDraftTemplatePhraseHandlingIds(getDefaultPhraseHandlingSelectionIds());
    renderPhraseHandlingChecklist();
    applyTemplateContextToGenerationFields(null);
    return;
  }

  nameEl.value = String(selected.name || '');
  bodyEl.value = String(selected.body || '');
  setDraftTemplatePhraseHandlingIds(getTemplatePhraseHandlingIds(selected));
  renderPhraseHandlingChecklist();
  applyTemplateContextToGenerationFields(selected);
}

function getTemplateEditorState() {
  var nameEl = document.getElementById('manual-template-name');
  var bodyEl = document.getElementById('manual-template-input');
  return {
    name: nameEl ? String(nameEl.value || '').trim() : '',
    body: bodyEl ? String(bodyEl.value || '').trim() : ''
  };
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
    studyType: getReportStudyType(),
    selectedPhraseHandlingIds: getSelectedPhraseHandlingIds(),
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
      studyType: inferStudyTypeFromTemplate({ name: name, body: body }),
      rulesText: '',
      selectedPhraseHandlingIds: getSelectedPhraseHandlingIds(),
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

function getReportOutputMode() {
  var select = document.getElementById('report-output-mode');
  var value = select ? String(select.value || '').trim() : '';
  if (
    value === 'impression' ||
    value === 'improve-impression' ||
    value === 'improve-finding' ||
    value === 'full-keep-findings'
  ) return value;
  return 'full';
}

function isFullReportMode(mode) {
  var clean = String(mode || '').trim();
  return clean === 'full' || clean === 'full-keep-findings';
}

function isImpressionMode(mode) {
  var clean = String(mode || '').trim();
  return clean === 'impression' || clean === 'improve-impression';
}

function getReportChatModeEnabled() {
  var checkbox = document.getElementById('report-chat-mode-toggle');
  return !!(checkbox && checkbox.checked);
}

function getReportStudyType() {
  var input = document.getElementById('report-study-type-input');
  return input ? String(input.value || '').trim() : '';
}

function getReportIndication() {
  var input = document.getElementById('report-indication-input');
  return input ? String(input.value || '').trim() : '';
}

async function handleGenerateReport() {
  if (!_uid) return;

  var findingsEl = document.getElementById('report-findings-input');
  var outputEl = document.getElementById('report-output');

  if (!findingsEl || !outputEl) return;

  var findings = String(findingsEl.value || '').trim();
  var selectedTemplate = getSelectedTemplate();
  var templateState = getTemplateEditorState();
  var templateText = templateState.body || (selectedTemplate ? selectedTemplate.body : '');
  var outputMode = getReportOutputMode();
  var chatModeEnabled = getReportChatModeEnabled();
  var studyType = getReportStudyType();
  var indication = getReportIndication();
  var desiredOutputDraft = getDesiredOutputDraft();
  var desiredLearningEnabled = getDesiredOutputLearningEnabled();

  if (!findings && !isFullReportMode(outputMode)) {
    setReportStatus('Enter findings input for this generation mode.', true);
    return;
  }

  setReportStatus('Generating report...', false);

  try {
    if (!String(templateText || '').trim() && isFullReportMode(outputMode)) {
      setReportStatus('No template provided. Generating comprehensive template...', false);
      templateText = await generateComprehensiveTemplateWithAi({
        provider: getSelectedAiProvider(),
        model: getSelectedAiModel(),
        findings: findings,
        studyType: studyType,
        indication: indication,
        phraseHandlingText: getActivePhraseHandlingText()
      });
      setReportStatus('Comprehensive template generated. Building report draft...', false);
    }

    var adaptiveGuidance = await prepareAdaptiveGuidanceForGeneration({
      provider: getSelectedAiProvider(),
      model: getSelectedAiModel(),
      outputMode: outputMode,
      findings: findings,
      studyType: studyType,
      indication: indication,
      templateText: templateText,
      currentDraft: String(outputEl.value || '').trim(),
      desiredOutputDraft: desiredOutputDraft,
      desiredLearningEnabled: desiredLearningEnabled,
      announceProgress: true
    });

    var response = await generateWithBrowserAiProvider({
      provider: getSelectedAiProvider(),
      model: getSelectedAiModel(),
      outputMode: outputMode,
      chatModeEnabled: chatModeEnabled,
      findings: findings,
      studyType: studyType,
      indication: indication,
      templateText: templateText,
      phraseHandlingText: getActivePhraseHandlingText(),
      desiredOutputDraft: desiredLearningEnabled ? desiredOutputDraft : '',
      adaptiveGuidance: adaptiveGuidance
    });

    var data = response && response.data ? response.data : {};
    outputEl.value = formatReportOutputFromData(data, outputMode);

    if (chatModeEnabled) {
      var initialQuestions = normalizeFollowUpQuestions(data && data.followUpQuestions);
      if (initialQuestions.length) {
        setReportStatus('CHAT mode: asking follow-up questions...', false);
        var answers = collectFollowUpAnswers(initialQuestions);
        if (answers.length) {
          setReportStatus('CHAT mode: refining report with your answers...', false);
          var refinement = await generateWithBrowserAiProvider({
            provider: getSelectedAiProvider(),
            model: getSelectedAiModel(),
            promptOverride: buildChatRefinementPrompt({
              findings: findings,
              outputMode: outputMode,
              studyType: studyType,
              indication: indication,
              templateText: templateText,
              phraseHandlingText: getActivePhraseHandlingText(),
              desiredOutputDraft: desiredLearningEnabled ? desiredOutputDraft : '',
              adaptiveGuidance: adaptiveGuidance,
              initialDraft: data,
              followUpAnswers: answers
            })
          });
          var refinementData = refinement && refinement.data ? refinement.data : {};
          outputEl.value = formatReportOutputFromData(refinementData, outputMode);
          setReportStatus('CHAT mode: draft refined with follow-up answers.', false);
          showToast('CHAT refinement complete.');
          return;
        }
      }
    }

    setReportStatus('Draft generated.', false);
    showToast('Report draft generated.');
  } catch (err) {
    setReportStatus((err && err.message) || 'Failed to generate report.', true);
  }
}

async function handleApplyDesiredOutputLearning() {
  var outputMode = getReportOutputMode();
  var findings = String((document.getElementById('report-findings-input') || {}).value || '').trim();
  var outputText = String((document.getElementById('report-output') || {}).value || '').trim();
  var desiredOutputDraft = getDesiredOutputDraft();

  if (!desiredOutputDraft) {
    setDesiredOutputLearningStatus('Paste a final draft first.', true);
    return;
  }

  try {
    setDesiredOutputLearningStatus('Applying desired output learning...', false);
    await prepareAdaptiveGuidanceForGeneration({
      provider: getSelectedAiProvider(),
      model: getSelectedAiModel(),
      outputMode: outputMode,
      findings: findings,
      studyType: getReportStudyType(),
      indication: getReportIndication(),
      templateText: (getTemplateEditorState() || {}).body || '',
      currentDraft: outputText,
      desiredOutputDraft: desiredOutputDraft,
      desiredLearningEnabled: true,
      announceProgress: false,
      forceLearning: true
    });

    setDesiredOutputLearningStatus('Desired output learning updated for this generation mode.', false);
    setReportStatus('Algorithm guidance updated from desired output.', false);
    showToast('Desired output learning applied.');
  } catch (err) {
    var msg = (err && err.message) || 'Failed to apply desired output learning.';
    setDesiredOutputLearningStatus(msg, true);
    setReportStatus(msg, true);
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

function dedupeSectionKeys(keys) {
  var seen = {};
  var result = [];

  (keys || []).forEach(function(key) {
    var raw = String(key || '').trim();
    if (!raw) return;

    var canonical = raw.toLowerCase();
    if (seen[canonical]) return;
    seen[canonical] = true;
    result.push(raw);
  });

  return result;
}

function formatReportOutputFromData(data, outputMode) {
  var mode = String(outputMode || 'full').trim();
  var payload = data && typeof data === 'object' ? data : {};

  if (isImpressionMode(mode)) {
    var impression = String(payload.impression || '').trim();
    if (!impression && payload.sections && typeof payload.sections === 'object') {
      impression = String(payload.sections.Impression || payload.sections.impression || '').trim();
    }
    return impression || String(payload.text || '').trim();
  }

  if (mode === 'improve-finding') {
    var improved = String(payload.improvedFinding || payload.finding || '').trim();
    return improved || String(payload.text || '').trim();
  }

  var sections = payload && payload.sections && typeof payload.sections === 'object' ? payload.sections : {};
  var ordered = dedupeSectionKeys(Object.keys(sections || {}));
  if (!ordered.length) {
    return String(payload.text || '').trim();
  }

  return ordered.map(function(key) {
    return String(key).toUpperCase() + ':\n' + normalizeSectionNarrative(key, sections[key]);
  }).join('\n\n');
}

function normalizeSectionNarrative(sectionName, sectionText) {
  var clean = String(sectionText || '').trim();
  var fallback = getSectionPertinentNegativeFallback(sectionName);

  if (!clean) return fallback || '';
  if (looksLikeMissingSectionPlaceholder(clean) && fallback) return fallback;
  return clean;
}

function looksLikeMissingSectionPlaceholder(text) {
  var clean = String(text || '').trim();
  if (!clean) return true;

  return /not specifically described|not described|not mentioned|not provided|not visualized|not evaluated|cannot be assessed|nondiagnostic|limited evaluation/i.test(clean);
}

function getSectionPertinentNegativeFallback(sectionName) {
  var name = String(sectionName || '').toLowerCase();
  if (!name) return '';

  if (/kidney|renal|ureter/.test(name)) return 'No hydronephrosis or hydroureter.';
  if (/liver|hepatic/.test(name)) return 'No focal hepatic lesion.';
  if (/gallbladder|biliary|bile duct/.test(name)) return 'No gallbladder distention or biliary ductal dilatation.';
  if (/pancrea/.test(name)) return 'No peripancreatic inflammatory change or ductal dilatation.';
  if (/spleen|splenic/.test(name)) return 'No splenomegaly or focal splenic lesion.';
  if (/adrenal/.test(name)) return 'No adrenal nodule.';
  if (/bowel|intestin|colon|small bowel|large bowel/.test(name)) return 'No bowel obstruction or focal bowel wall thickening.';
  if (/appendix|appendiceal/.test(name)) return 'No periappendiceal inflammatory change.';
  if (/bladder|urinary bladder/.test(name)) return 'No focal urinary bladder wall thickening.';
  if (/reproductive|uterus|ovar|adnexa|prostate|seminal/.test(name)) return 'No acute abnormality identified.';
  if (/peritone|mesenter|retroperitone/.test(name)) return 'No ascites or free intraperitoneal air.';
  if (/vascul|aorta|arter/.test(name)) return 'No abdominal aortic aneurysm.';
  if (/lymph|node|adenopathy/.test(name)) return 'No pathologically enlarged lymph nodes.';
  if (/lung|pleura|lower chest|thorax/.test(name)) return 'No pleural effusion or focal basilar airspace opacity.';
  if (/bones|osseous|skeleton|spine/.test(name)) return 'No acute osseous abnormality.';
  return '';
}

function normalizeFollowUpQuestions(questions) {
  if (!Array.isArray(questions)) return [];

  var result = [];
  var seen = {};
  questions.forEach(function(item) {
    var question = '';
    if (typeof item === 'string') {
      question = String(item || '').trim();
    } else if (item && typeof item === 'object') {
      question = String(item.question || item.prompt || '').trim();
    }

    if (!question) return;
    var key = question.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;

    result.push({
      question: question,
      rationale: item && typeof item === 'object' ? String(item.rationale || '').trim() : ''
    });
  });

  return result.slice(0, 4);
}

function collectFollowUpAnswers(questions) {
  var responses = [];
  (questions || []).forEach(function(item, idx) {
    var promptText = 'AI follow-up question ' + (idx + 1) + ':\n' + item.question + '\n\n';
    if (item.rationale) {
      promptText += 'Why this matters: ' + item.rationale + '\n\n';
    }
    promptText += 'Optional: enter an answer, or leave blank/cancel to skip.';

    var answer = window.prompt(promptText, '');
    if (answer === null) return;
    var trimmed = String(answer || '').trim();
    if (!trimmed) return;

    responses.push({
      question: item.question,
      answer: trimmed
    });
  });
  return responses;
}

function buildChatRefinementPrompt(payload) {
  var system = [
    'You are a subspecialty-experienced radiologist refining a report draft using user-provided clarifications.',
    'Return valid JSON only. Do not return markdown fences or prose outside JSON.',
    'Do not invent findings that are not in the original input or follow-up answers.',
    'Never use placeholders like "Not specifically described" or "Not evaluated" for unremarkable sections.',
    'When no positive finding is present in a section, use concise anatomy-appropriate pertinent negatives.',
    'Apply phraseHandlingRules exactly when they are provided.'
  ].join('\n');

  var outputMode = String(payload.outputMode || 'full').trim();
  var adaptiveGuidance = String(payload.adaptiveGuidance || '').trim();
  if (adaptiveGuidance) {
    system += '\nAdaptive guidance from user final drafts for this mode:\n' + adaptiveGuidance;
  }
  if (isImpressionMode(outputMode)) {
    system += '\nOutput shape must be exactly: {"impression":"..."}.';
    system += '\nReturn only an updated impression based on the initial draft and follow-up clarifications.';
  } else if (outputMode === 'improve-finding') {
    system += '\nOutput shape must be exactly: {"improvedFinding":"..."}.';
    system += '\nReturn only an updated improved finding based on the initial draft and follow-up clarifications.';
  } else {
    system += '\nOutput shape must be exactly: {"sections":{"FIELD_NAME":"...","FIELD_NAME":"...","Other":"...","Impression":"..."}}.';
  }

  var user = {
    outputMode: outputMode,
    studyType: payload.studyType || '',
    indication: payload.indication || '',
    findingsInput: payload.findings || '',
    templateText: payload.templateText || '',
    templateFields: extractTemplateFieldNames(payload.templateText || ''),
    templateSectionDefaults: extractTemplateSectionDefaults(payload.templateText || ''),
    phraseHandlingRules: payload.phraseHandlingText || '',
    desiredOutputDraft: payload.desiredOutputDraft || '',
    adaptiveGuidance: adaptiveGuidance,
    initialDraft: payload.initialDraft || {},
    followUpClarifications: payload.followUpAnswers || []
  };

  return {
    system: system,
    user: JSON.stringify(user)
  };
}

function buildComprehensiveTemplatePrompt(payload) {
  var system = [
    'You are a subspecialty-experienced radiologist creating a structured report template.',
    'Return valid JSON only. Do not return markdown fences or prose outside JSON.',
    'Output shape must be exactly: {"templateText":"..."}.',
    'Generate a comprehensive template with all anatomically associated section headers relevant to the study context.',
    'Each section should include concise default pertinent negative language where appropriate.',
    'Do not use placeholders such as "Not specifically described" or "Not evaluated" in template defaults.',
    'Include an Impression section at the end.',
    'Format templateText as plain report template text with section labels ending in a colon.'
  ].join('\n');

  var user = {
    studyType: payload.studyType || '',
    indication: payload.indication || '',
    findingsInput: payload.findings || '',
    phraseHandlingRules: payload.phraseHandlingText || ''
  };

  return {
    system: system,
    user: JSON.stringify(user)
  };
}

async function generateComprehensiveTemplateWithAi(payload) {
  var response = await generateWithBrowserAiProvider({
    provider: payload.provider,
    model: payload.model,
    promptOverride: buildComprehensiveTemplatePrompt(payload)
  });

  var data = response && response.data ? response.data : {};
  var templateText = String(data.templateText || data.text || '').trim();
  if (!templateText) {
    throw new Error('AI could not generate a comprehensive template. Please try again.');
  }

  return templateText;
}

function getAiProviderConfig(provider) {
  return AI_PROVIDER_CONFIG[String(provider || '').trim()] || AI_PROVIDER_CONFIG.openai;
}

function getAiApiStorageKey(provider) {
  return 'reportGenerator.aiApiKey.' + String(provider || 'openai').trim();
}

function loadSavedAiKey(provider, keyInput, rememberCheckbox) {
  var saved = '';
  try {
    saved = String(localStorage.getItem(getAiApiStorageKey(provider)) || '').trim();
  } catch (err) {
    saved = '';
  }

  if (keyInput) keyInput.value = saved;
  if (rememberCheckbox) rememberCheckbox.checked = !!saved;
}

function applyAiProviderUi(provider, keyInput, rememberCheckbox, keyLabel) {
  var providerConfig = getAiProviderConfig(provider);
  if (keyInput) keyInput.placeholder = providerConfig.placeholder || '';
  if (keyLabel) keyLabel.textContent = providerConfig.keyLabel || 'AI API key';
  if (rememberCheckbox) rememberCheckbox.setAttribute('aria-label', 'Remember ' + providerConfig.label + ' key on this device');
}

function renderAiModelOptions(provider, modelSelect) {
  if (!modelSelect) return;

  var providerConfig = getAiProviderConfig(provider);
  var current = String(modelSelect.value || '').trim();
  var html = '';

  providerConfig.models.forEach(function(option) {
    html += '<option value="' + escapeHtmlAttr(option.value) + '">' + escapeHtmlText(option.label) + '</option>';
  });

  modelSelect.innerHTML = html;

  var available = providerConfig.models.some(function(option) {
    return option.value === current;
  });
  modelSelect.value = available ? current : providerConfig.defaultModel;
}

function persistAiKey(provider, value) {
  var clean = String(value || '').trim();
  try {
    if (!clean) {
      localStorage.removeItem(getAiApiStorageKey(provider));
      return;
    }
    localStorage.setItem(getAiApiStorageKey(provider), clean);
  } catch (err) {
    // Ignore storage failures (private mode / quota).
  }
}

function clearPersistedAiKey(provider) {
  try {
    localStorage.removeItem(getAiApiStorageKey(provider));
  } catch (err) {
    // Ignore storage failures (private mode / quota).
  }
}

function getAiApiKey(provider) {
  var keyInput = document.getElementById('ai-api-key-input');
  var rememberCheckbox = document.getElementById('remember-ai-api-key');
  var key = keyInput ? String(keyInput.value || '').trim() : '';

  if (rememberCheckbox && rememberCheckbox.checked) {
    persistAiKey(String(provider || 'openai').trim(), key);
  }

  return key;
}

function getOpenAiApiKey() {
  return getAiApiKey('openai');
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
    syncDraftPhraseHandlingSelection();
    renderPhraseHandlingChecklist();
  }, function(err) {
    console.error('phrase handlings subscription error:', err);
  });
}

function syncDraftPhraseHandlingSelection() {
  var selectedTemplate = getSelectedTemplate();
  if (_draftTemplatePhraseHandlingIds === null) {
    setDraftTemplatePhraseHandlingIds(getTemplatePhraseHandlingIds(selectedTemplate));
    return;
  }

  var available = getDefaultPhraseHandlingSelectionIds();
  var availableMap = {};
  available.forEach(function(id) { availableMap[id] = true; });

  var filtered = getDraftTemplatePhraseHandlingIds().filter(function(id) {
    return !!availableMap[id];
  });

  if (!filtered.length && _phraseHandlings.length && !selectedTemplate) {
    filtered = getDefaultPhraseHandlingSelectionIds();
  }

  setDraftTemplatePhraseHandlingIds(filtered);
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
    setDraftTemplatePhraseHandlingIds([]);
    container.innerHTML = '<p class="phrase-checklist-empty muted">No phrase handling saved yet.</p>';
    return;
  }

  var checked = {};
  syncDraftPhraseHandlingSelection();
  getDraftTemplatePhraseHandlingIds().forEach(function(id) {
    checked[id] = true;
  });

  var html = '';
  _phraseHandlings.forEach(function(p) {
    var isChecked = !!checked[p.id];
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
  var lines = [];
  getSelectedPhraseHandlingIds().forEach(function(id) {
    var ph = _phraseHandlings.find(function(p) { return p.id === id; });
    if (ph && String(ph.text || '').trim()) {
      lines.push(String(ph.text).trim());
    }
  });
  return lines.join('\n');
}

function handlePhraseChecklistChange(event) {
  var target = event && event.target ? event.target : null;
  if (!target || !target.classList || !target.classList.contains('phrase-check')) return;

  setDraftTemplatePhraseHandlingIds(getSelectedPhraseHandlingIds());
  persistSelectedPhraseHandlingIdsForCurrentTemplate();
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

function inferStudyTypeFromTemplate(template) {
  if (!template) return '';

  var explicit = String(template.studyType || '').trim();
  if (explicit) return explicit;

  var body = String(template.body || '');
  var examMatch = body.match(/(?:^|\n)\s*(?:EXAM|STUDY|PROCEDURE)\s*:\s*([^\n]+)/i);
  if (examMatch && examMatch[1]) {
    return String(examMatch[1]).trim();
  }

  var name = String(template.name || '').trim();
  if (name) return name;
  return '';
}

function applyTemplateContextToGenerationFields(template) {
  var studyTypeInput = document.getElementById('report-study-type-input');
  if (!studyTypeInput) return;

  var nextStudyType = inferStudyTypeFromTemplate(template);
  if (studyTypeInput && nextStudyType) {
    studyTypeInput.value = nextStudyType;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function buildReportPrompt(payload) {
  var outputMode = String(payload.outputMode || 'full').trim();
  var chatModeEnabled = !!payload.chatModeEnabled;
  var templateText = String(payload.templateText || '').trim();
  var hasTemplate = !!templateText;
  var adaptiveGuidance = String(payload.adaptiveGuidance || '').trim();

  var instructions = [
    'You are a subspecialty-experienced radiologist generating a high-quality diagnostic report draft.',
    'Return valid JSON only. Do not return markdown fences or prose outside JSON.',
    'Do not invent findings that are not in the input. Use medically appropriate uncertainty language when needed.',
    'Apply phraseHandlingRules exactly when they are provided.'
  ];

  if (adaptiveGuidance) {
    instructions.push('Adaptive guidance from prior user final drafts for this mode:\n' + adaptiveGuidance);
  }

  if (outputMode === 'impression') {
    instructions.push('Generate only the Impression text directly from findings and prioritize clinically important conclusions.');
  } else if (outputMode === 'improve-impression') {
    instructions.push('Rewrite the provided impression text for clarity and professionalism without changing meaning.');
  } else if (outputMode === 'improve-finding') {
    instructions.push('Rewrite the finding text for clarity and professionalism without changing meaning.');
  } else if (hasTemplate) {
    instructions.push('Use the template field labels (lines ending in a colon) as section keys and preserve their order.');
    instructions.push('Sort each finding into the best matching template field.');
    if (outputMode === 'full-keep-findings') {
      instructions.push('Keep finding language exact while sorting into sections; do not paraphrase or improve wording.');
    } else {
      instructions.push('Improve language for clarity and professionalism while preserving original clinical meaning.');
    }
    instructions.push('Findings that do not match any template field must go into an Other section.');
    instructions.push('If no input findings apply to a template field, keep that field text exactly the same as templateSectionDefaults for that field.');
    instructions.push('Never replace a section with placeholder text like "Not specifically described", "Not evaluated", or "Not mentioned".');
    instructions.push('If a section has no positive finding, preserve or provide concise anatomy-appropriate pertinent negatives instead.');
    instructions.push('If the template does not contain Impression, include an Impression section at the end.');
  } else {
    instructions.push('Generate a full report from findings and study context.');
    if (outputMode === 'full-keep-findings') {
      instructions.push('Keep finding language exact; organize and sort findings without paraphrasing.');
    } else {
      instructions.push('Improve language for clarity and professionalism while preserving original clinical meaning.');
    }
    instructions.push('Include pertinent negatives appropriate for the study type when clinically justified.');
  }

  if (chatModeEnabled) {
    if (isImpressionMode(outputMode)) {
      instructions.push('Output shape must be exactly: {"impression":"...","followUpQuestions":[{"question":"...","rationale":"..."}]}.');
    } else if (outputMode === 'improve-finding') {
      instructions.push('Output shape must be exactly: {"improvedFinding":"...","followUpQuestions":[{"question":"...","rationale":"..."}]}.');
    } else {
      instructions.push('Output shape must be exactly: {"sections":{"FIELD_NAME":"...","FIELD_NAME":"...","Other":"...","Impression":"..."},"followUpQuestions":[{"question":"...","rationale":"..."}]}.');
    }
    instructions.push('Generate the requested draft first, then include 0-4 concise follow-up questions that would materially improve report quality if answered.');
    instructions.push('Ask only clinically meaningful missing details. Example: if aortic dissection is described without flap location, ask for flap location.');
    instructions.push('If no high-value clarifications are needed, return an empty followUpQuestions array.');
  } else if (isImpressionMode(outputMode)) {
    instructions.push('Output shape must be exactly: {"impression":"..."}.');
  } else if (outputMode === 'improve-finding') {
    instructions.push('Output shape must be exactly: {"improvedFinding":"..."}.');
  } else if (hasTemplate) {
    instructions.push('Output shape must be exactly: {"sections":{"FIELD_NAME":"...","FIELD_NAME":"...","Other":"...","Impression":"..."}}.');
  } else {
    instructions.push('Output shape must be exactly: {"sections":{"Findings":"...","Impression":"..."}}.');
  }

  var context = {
    outputMode: outputMode,
    chatModeEnabled: chatModeEnabled,
    studyType: payload.studyType || '',
    indication: payload.indication || '',
    findingsInput: payload.findings || '',
    templateText: templateText,
    templateFields: extractTemplateFieldNames(templateText),
    templateSectionDefaults: extractTemplateSectionDefaults(templateText),
    phraseHandlingRules: payload.phraseHandlingText || '',
    desiredOutputDraft: payload.desiredOutputDraft || '',
    adaptiveGuidance: adaptiveGuidance
  };

  return {
    system: instructions.join('\n'),
    user: JSON.stringify(context)
  };
}

function buildAdaptiveGuidancePrompt(payload) {
  var system = [
    'You are improving a radiology report generation algorithm from supervised user edits.',
    'Return valid JSON only. Do not return markdown fences or prose outside JSON.',
    'Output shape must be exactly: {"guidance":"..."}.',
    'Produce concise, implementation-ready guidance that can be appended to future prompt instructions.',
    'Focus on changes implied by the user final draft compared with findings and current draft.',
    'Never include patient identifiers, dates, or personally identifying details.'
  ].join('\n');

  var user = {
    outputMode: String(payload.outputMode || 'full').trim(),
    studyType: payload.studyType || '',
    indication: payload.indication || '',
    findingsInput: payload.findings || '',
    templateFields: extractTemplateFieldNames(payload.templateText || ''),
    currentDraft: payload.currentDraft || '',
    desiredOutputDraft: payload.desiredOutputDraft || '',
    priorGuidanceForMode: payload.priorGuidance || ''
  };

  return {
    system: system,
    user: JSON.stringify(user)
  };
}

async function generateAdaptiveGuidanceWithAi(payload) {
  var response = await generateWithBrowserAiProvider({
    provider: payload.provider,
    model: payload.model,
    promptOverride: buildAdaptiveGuidancePrompt(payload)
  });

  var data = response && response.data ? response.data : {};
  return String(data.guidance || data.text || '').trim();
}

async function prepareAdaptiveGuidanceForGeneration(payload) {
  var outputMode = String(payload.outputMode || 'full').trim() || 'full';
  var savedGuidance = getSavedAdaptiveGuidanceForMode(outputMode);
  var desiredOutputDraft = String(payload.desiredOutputDraft || '').trim();
  var learningEnabled = !!payload.desiredLearningEnabled;
  var forceLearning = !!payload.forceLearning;
  var shouldLearnNow = !!desiredOutputDraft && (forceLearning || learningEnabled);

  if (!shouldLearnNow) {
    return savedGuidance;
  }

  if (payload.announceProgress) {
    setReportStatus('Improving algorithm from desired output...', false);
  }
  setDesiredOutputLearningStatus('Deriving adaptive guidance from your final draft...', false);

  var learnedGuidance = await generateAdaptiveGuidanceWithAi({
    provider: payload.provider,
    model: payload.model,
    outputMode: outputMode,
    findings: payload.findings,
    studyType: payload.studyType,
    indication: payload.indication,
    templateText: payload.templateText,
    currentDraft: payload.currentDraft,
    desiredOutputDraft: desiredOutputDraft,
    priorGuidance: savedGuidance
  });

  if (!learnedGuidance) {
    setDesiredOutputLearningStatus('No new guidance extracted from desired output.', false);
    return savedGuidance;
  }

  saveAdaptiveGuidanceForMode(outputMode, learnedGuidance, { source: 'desired-output' });
  setDesiredOutputLearningStatus('Adaptive guidance saved for this mode.', false);
  return learnedGuidance;
}

function extractTemplateFieldNames(templateText) {
  var lines = String(templateText || '').split(/\r?\n/);
  var seen = {};
  var fields = [];

  lines.forEach(function(line) {
    var match = String(line || '').match(/^\s*([A-Za-z][A-Za-z0-9\s\/()&+\-]{0,60})\s*:/);
    if (!match || !match[1]) return;
    var field = String(match[1]).trim();
    var key = field.toLowerCase();
    if (!field || seen[key]) return;
    seen[key] = true;
    fields.push(field);
  });

  return fields;
}

function extractTemplateSectionDefaults(templateText) {
  var lines = String(templateText || '').split(/\r?\n/);
  var sections = {};
  var currentField = null;
  var buffer = [];

  function flushBuffer() {
    if (!currentField) return;
    sections[currentField] = buffer.join('\n').trim();
  }

  lines.forEach(function(line) {
    var raw = String(line || '');
    var match = raw.match(/^\s*([A-Za-z][A-Za-z0-9\s\/()&+\-]{0,60})\s*:\s*(.*)$/);
    if (match && match[1]) {
      flushBuffer();
      currentField = String(match[1]).trim();
      buffer = [];
      var inlineText = String(match[2] || '').trim();
      if (inlineText) buffer.push(inlineText);
      return;
    }

    if (currentField) {
      buffer.push(raw);
    }
  });

  flushBuffer();
  return sections;
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

async function generateWithBrowserAiProvider(payload) {
  var provider = String(payload.provider || 'openai').trim() || 'openai';
  var providerConfig = getAiProviderConfig(provider);
  var apiKey = getAiApiKey(provider);
  if (!apiKey) {
    throw new Error('Enter a ' + providerConfig.label + ' API key to generate a report.');
  }

  var prompt = payload && payload.promptOverride ? payload.promptOverride : buildReportPrompt(payload || {});
  var model = String(payload.model || providerConfig.defaultModel || '').trim();
  var response;

  if (provider === 'anthropic') {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 2048,
        system: prompt.system,
        messages: [
          { role: 'user', content: prompt.user }
        ]
      })
    });
  } else if (provider === 'gemini') {
    response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: prompt.system }]
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt.user }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048
        }
      })
    });
  } else {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user }
        ]
      })
    });
  }

  var data = await response.json().catch(function() { return {}; });
  if (!response.ok) {
    var msg = (data && data.error && data.error.message) || (providerConfig.label + ' request failed (' + response.status + ').');
    throw new Error(msg);
  }

  var content = '';
  if (provider === 'anthropic') {
    content = Array.isArray(data && data.content)
      ? data.content.map(function(part) { return String(part && part.text || ''); }).join('')
      : '';
  } else if (provider === 'gemini') {
    content = data && data.candidates && data.candidates[0] && data.candidates[0].content && Array.isArray(data.candidates[0].content.parts)
      ? data.candidates[0].content.parts.map(function(part) { return String(part && part.text || ''); }).join('')
      : '';
  } else {
    content = data && data.choices && data.choices[0] && data.choices[0].message
      ? String(data.choices[0].message.content || '')
      : '';
  }

  var parsed = extractJsonObject(content);
  if (parsed && typeof parsed === 'object') {
    return { data: parsed };
  }

  return { data: { text: content } };
}

function getSelectedAiProvider() {
  var select = document.getElementById('ai-provider-select');
  return select ? String(select.value || 'openai').trim() : 'openai';
}

function getSelectedAiModel() {
  var select = document.getElementById('ai-model-input');
  if (!select) {
    return getAiProviderConfig(getSelectedAiProvider()).defaultModel;
  }
  return String(select.value || '').trim() || getAiProviderConfig(getSelectedAiProvider()).defaultModel;
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
