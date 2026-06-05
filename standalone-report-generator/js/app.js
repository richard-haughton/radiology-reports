var _uid = null;
var _templates = [];
var _templateFolders = [];
var _pendingTemplateSelection = '';
var _unsubscribeTemplates = null;
var _unsubscribeTemplateFolders = null;
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
    subscribeTemplateFolders();
    subscribePhraseHandlings();
  });
});

function bindReportEvents() {
  var templateSelect = document.getElementById('report-template-select');
  var templateFolderFilterSelect = document.getElementById('template-folder-filter-select');
  var createTemplateFolderBtn = document.getElementById('btn-create-template-folder');
  var importBtn = document.getElementById('btn-report-template-import');
  var importInput = document.getElementById('report-template-import-input');

  if (templateSelect) {
    templateSelect.addEventListener('change', function() {
      _pendingTemplateSelection = String(templateSelect.value || '').trim();
      populateTemplateEditorFromSelection();
      // Sync gen template select to match
      var genSelect = document.getElementById('gen-template-select');
      if (genSelect && genSelect.value !== templateSelect.value) {
        var opt = genSelect.querySelector('option[value="' + templateSelect.value.replace(/"/g, '\\"') + '"]');
        if (opt || !templateSelect.value) {
          genSelect.value = templateSelect.value;
        } else {
          renderGenerationTemplateOptions();
        }
      }
    });
  }

  if (templateFolderFilterSelect) {
    templateFolderFilterSelect.addEventListener('change', function() {
      var selected = getSelectedTemplate();
      var matchesFilter = selected && templateMatchesFolderFilter(selected);
      if (!matchesFilter) {
        _pendingTemplateSelection = '';
      }
      renderTemplateOptions();
    });
  }

  if (createTemplateFolderBtn) {
    createTemplateFolderBtn.addEventListener('click', handleCreateTemplateFolder);
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

  var moveTemplateFolderBtn = document.getElementById('btn-move-template-folder');
  if (moveTemplateFolderBtn) moveTemplateFolderBtn.addEventListener('click', handleMoveTemplateFolder);

  var appendBtn = document.getElementById('btn-append-template-to-body');
  if (appendBtn) appendBtn.addEventListener('click', handleAppendTemplateToBody);

  var newTemplateBtn = document.getElementById('btn-new-template');
  if (newTemplateBtn) newTemplateBtn.addEventListener('click', handleNewTemplate);

  var createTemplateConfirmBtn = document.getElementById('btn-create-template-confirm');
  if (createTemplateConfirmBtn) createTemplateConfirmBtn.addEventListener('click', handleCreateTemplateConfirm);

  var createTemplateCancelBtn = document.getElementById('btn-create-template-cancel');
  if (createTemplateCancelBtn) {
    createTemplateCancelBtn.addEventListener('click', function() {
      var dialog = document.getElementById('create-template-dialog');
      if (dialog) dialog.close();
    });
  }

  var createTemplateNameInput = document.getElementById('create-template-name');
  if (createTemplateNameInput) {
    createTemplateNameInput.addEventListener('keydown', function(event) {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      var bodyEl = document.getElementById('create-template-body');
      if (bodyEl) bodyEl.focus();
    });
  }

  var genFolderSelect = document.getElementById('gen-folder-select');
  if (genFolderSelect) {
    genFolderSelect.addEventListener('change', renderGenerationTemplateOptions);
  }

  var genTemplateSelect = document.getElementById('gen-template-select');
  if (genTemplateSelect) {
    genTemplateSelect.addEventListener('change', function() {
      var val = String(genTemplateSelect.value || '').trim();
      _pendingTemplateSelection = val;
      // Sync sidebar editor template select
      var editorSelect = document.getElementById('report-template-select');
      if (editorSelect) {
        var opt = val ? editorSelect.querySelector('option[value="' + val.replace(/"/g, '\\"') + '"]') : true;
        if (opt) {
          editorSelect.value = val;
        } else {
          // Clear stale sidebar selection when current sidebar filter does not contain the generator template.
          editorSelect.value = '';
        }
      }
      var selectedFromGenerator = _templates.find(function(t) { return t.id === val; }) || null;
      applyTemplateContextToGenerationFields(selectedFromGenerator);
      populateTemplateEditorFromSelection();
    });
  }

  var sidebarToggleBtn = document.getElementById('btn-toggle-sidebar');
  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener('click', function() {
      var layout = document.getElementById('report-layout');
      if (!layout) return;
      var isCollapsed = layout.classList.contains('sidebar-collapsed');
      if (isCollapsed) {
        layout.classList.remove('sidebar-collapsed');
        sidebarToggleBtn.textContent = '\u25c0';
        sidebarToggleBtn.title = 'Collapse sidebar';
      } else {
        layout.classList.add('sidebar-collapsed');
        sidebarToggleBtn.textContent = '\u25b6';
        sidebarToggleBtn.title = 'Expand sidebar';
      }
    });
  }

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

  var saveDesiredLearningBtn = document.getElementById('btn-save-desired-output-learning');
  if (saveDesiredLearningBtn) saveDesiredLearningBtn.addEventListener('click', handleSaveDesiredOutputLearning);

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
  if (_unsubscribeTemplateFolders) {
    _unsubscribeTemplateFolders();
    _unsubscribeTemplateFolders = null;
  }
  if (_unsubscribePhraseHandlings) {
    _unsubscribePhraseHandlings();
    _unsubscribePhraseHandlings = null;
  }
  _templates = [];
  _templateFolders = [];
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

function templateFoldersRef(uid) {
  return userRef(uid).collection('templateFolders');
}

function desiredOutputLearningsRef(uid) {
  return userRef(uid).collection('desiredOutputLearnings');
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
      data.folder = normalizeTemplateFolderName(data.folder);
      data.studyType = String(data.studyType || '').trim();
      data.rulesText = String(data.rulesText || '');
      data.hasSelectedPhraseHandlingIds = Array.isArray(data.selectedPhraseHandlingIds);
      data.selectedPhraseHandlingIds = normalizePhraseHandlingIds(data.selectedPhraseHandlingIds);
      return data;
    });

    renderTemplateFolderOptions();
    renderTemplateOptions();
  }, function(err) {
    console.error('templates subscription error:', err);
    setReportStatus('Failed to load templates: ' + ((err && err.message) || 'Unknown error.'), true);
  });
}

function subscribeTemplateFolders() {
  if (!_uid) return;
  if (_unsubscribeTemplateFolders) _unsubscribeTemplateFolders();

  _unsubscribeTemplateFolders = templateFoldersRef(_uid).onSnapshot(function(snapshot) {
    _templateFolders = snapshot.docs.map(function(doc) {
      var data = doc.data() || {};
      return {
        id: doc.id,
        name: normalizeTemplateFolderName(data.name || doc.id)
      };
    }).filter(function(folder) {
      return !!folder.name;
    }).sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });

    renderTemplateFolderOptions();
    renderTemplateOptions();
  }, function(err) {
    console.error('template folders subscription error:', err);
    setReportStatus('Failed to load template folders: ' + ((err && err.message) || 'Unknown error.'), true);
  });
}

function normalizeTemplateFolderName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getAllTemplateFolderNames() {
  var seen = {};
  var names = [];

  _templateFolders.forEach(function(folder) {
    var name = normalizeTemplateFolderName(folder && folder.name);
    if (!name) return;
    var key = name.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    names.push(name);
  });

  _templates.forEach(function(template) {
    var name = normalizeTemplateFolderName(template && template.folder);
    if (!name) return;
    var key = name.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    names.push(name);
  });

  return names.sort(function(a, b) {
    return a.localeCompare(b);
  });
}

function renderTemplateFolderOptions() {
  var editorSelect = document.getElementById('template-folder-select');
  var filterSelect = document.getElementById('template-folder-filter-select');
  var folderNames = getAllTemplateFolderNames();

  if (editorSelect) {
    var selectedFolder = normalizeTemplateFolderName(editorSelect.value);
    var editorHtml = '<option value="">No folder</option>';
    folderNames.forEach(function(name) {
      editorHtml += '<option value="' + escapeHtmlAttr(name) + '">' + escapeHtmlText(name) + '</option>';
    });
    editorSelect.innerHTML = editorHtml;
    if (selectedFolder && folderNames.some(function(name) { return name === selectedFolder; })) {
      editorSelect.value = selectedFolder;
    } else {
      editorSelect.value = '';
    }
  }

  if (filterSelect) {
    var selectedFilter = normalizeTemplateFolderName(filterSelect.value);
    var filterHtml = '<option value="">All folders</option>';
    folderNames.forEach(function(name) {
      filterHtml += '<option value="' + escapeHtmlAttr(name) + '">' + escapeHtmlText(name) + '</option>';
    });
    filterSelect.innerHTML = filterHtml;
    if (selectedFilter && folderNames.some(function(name) { return name === selectedFilter; })) {
      filterSelect.value = selectedFilter;
    } else {
      filterSelect.value = '';
    }
  }
}

function getTemplateSortMode() {
  return 'name-asc';
}

function getTemplateFolderFilter() {
  var select = document.getElementById('template-folder-filter-select');
  return normalizeTemplateFolderName(select ? select.value : '');
}

function templateMatchesFolderFilter(template) {
  var filter = getTemplateFolderFilter();
  if (!filter) return true;
  var folder = normalizeTemplateFolderName(template && template.folder);
  return folder === filter;
}

function getTimestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  var asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : 0;
}

function sortTemplates(templates) {
  var mode = getTemplateSortMode();
  return templates.slice().sort(function(a, b) {
    var folderA = normalizeTemplateFolderName(a && a.folder).toLowerCase();
    var folderB = normalizeTemplateFolderName(b && b.folder).toLowerCase();
    var nameA = String((a && a.name) || '').toLowerCase();
    var nameB = String((b && b.name) || '').toLowerCase();

    if (mode === 'name-asc') return nameA.localeCompare(nameB);
    if (mode === 'name-desc') return nameB.localeCompare(nameA);
    if (mode === 'newest') {
      var updatedA = getTimestampMillis(a && a.updatedAt);
      var updatedB = getTimestampMillis(b && b.updatedAt);
      return updatedB - updatedA || nameA.localeCompare(nameB);
    }
    if (mode === 'oldest') {
      var createdA = getTimestampMillis((a && a.createdAt) || (a && a.updatedAt));
      var createdB = getTimestampMillis((b && b.createdAt) || (b && b.updatedAt));
      return createdA - createdB || nameA.localeCompare(nameB);
    }

    return folderA.localeCompare(folderB) || nameA.localeCompare(nameB);
  });
}

function getVisibleTemplates() {
  return sortTemplates(_templates.filter(templateMatchesFolderFilter));
}

function renderTemplateOptions() {
  var select = document.getElementById('report-template-select');
  if (!select) return;

  var selected = String(_pendingTemplateSelection || select.value || '').trim();
  var visibleTemplates = getVisibleTemplates();

  function option(t) {
    return '<option value="' + escapeHtmlAttr(t.id) + '">' + escapeHtmlText(t.name) + '</option>';
  }

  var html = '<option value="">New template</option>';
  visibleTemplates.forEach(function(t) { html += option(t); });

  select.innerHTML = html;
  if (selected && visibleTemplates.some(function(t) { return t.id === selected; })) {
    select.value = selected;
  } else {
    select.value = '';
  }

  _pendingTemplateSelection = String(select.value || '').trim();
  populateTemplateEditorFromSelection();
  renderGenerationTemplateOptions();
}

function renderGenerationTemplateOptions() {
  var genFolderSelect = document.getElementById('gen-folder-select');
  var genTemplateSelect = document.getElementById('gen-template-select');
  if (!genTemplateSelect) return;

  // Populate gen folder dropdown
  if (genFolderSelect) {
    var folderNames = getAllTemplateFolderNames();
    var selectedGenFolder = normalizeTemplateFolderName(genFolderSelect.value);
    var folderHtml = '<option value="">All folders</option>';
    folderNames.forEach(function(name) {
      folderHtml += '<option value="' + escapeHtmlAttr(name) + '">' + escapeHtmlText(name) + '</option>';
    });
    genFolderSelect.innerHTML = folderHtml;
    if (selectedGenFolder && folderNames.some(function(n) { return n === selectedGenFolder; })) {
      genFolderSelect.value = selectedGenFolder;
    } else {
      genFolderSelect.value = '';
    }
  }

  // Filter templates by selected gen folder
  var genFolder = normalizeTemplateFolderName(genFolderSelect ? genFolderSelect.value : '');
  var visibleTemplates = sortTemplates(_templates.filter(function(t) {
    if (!genFolder) return true;
    return normalizeTemplateFolderName(t && t.folder) === genFolder;
  }));

  function option(t) {
    return '<option value="' + escapeHtmlAttr(t.id) + '">' + escapeHtmlText(t.name) + '</option>';
  }

  var selectedId = _pendingTemplateSelection || String(genTemplateSelect.value || '').trim();
  var html = '<option value="">No template</option>';
  visibleTemplates.forEach(function(t) { html += option(t); });
  genTemplateSelect.innerHTML = html;

  if (selectedId && visibleTemplates.some(function(t) { return t.id === selectedId; })) {
    genTemplateSelect.value = selectedId;
  } else {
    genTemplateSelect.value = '';
  }
}

function getSelectedTemplate() {
  var select = document.getElementById('report-template-select');
  var id = select ? String(select.value || '').trim() : '';
  if (!id) {
    id = String(_pendingTemplateSelection || '').trim();
  }
  if (!id) return null;
  return _templates.find(function(t) { return t.id === id; }) || null;
}

function populateTemplateEditorFromSelection() {
  var selected = getSelectedTemplate();
  var bodyEl = document.getElementById('manual-template-input');
  var folderEl = document.getElementById('template-folder-select');

  if (!bodyEl || !folderEl) return;

  if (!selected) {
    bodyEl.value = '';
    folderEl.value = '';
    setDraftTemplatePhraseHandlingIds(getDefaultPhraseHandlingSelectionIds());
    renderPhraseHandlingChecklist();
    applyTemplateContextToGenerationFields(null);
    return;
  }

  bodyEl.value = String(selected.body || '');
  folderEl.value = normalizeTemplateFolderName(selected.folder);
  setDraftTemplatePhraseHandlingIds(getTemplatePhraseHandlingIds(selected));
  renderPhraseHandlingChecklist();
  applyTemplateContextToGenerationFields(selected);
}

function getTemplateEditorState() {
  var bodyEl = document.getElementById('manual-template-input');
  var folderEl = document.getElementById('template-folder-select');
  return {
    body: bodyEl ? String(bodyEl.value || '').trim() : '',
    folder: normalizeTemplateFolderName(folderEl ? folderEl.value : '')
  };
}

async function handleCreateTemplateFolder() {
  if (!_uid) return;

  var editorSelect = document.getElementById('template-folder-select');

  var folderName = normalizeTemplateFolderName(window.prompt('New folder name:') || '');
  if (!folderName) return;

  var existing = getAllTemplateFolderNames().find(function(name) {
    return name.toLowerCase() === folderName.toLowerCase();
  });

  if (existing) {
    renderTemplateFolderOptions();
    if (editorSelect) editorSelect.value = existing;
    setReportStatus('Folder already exists. Using existing folder.', false);
    return;
  }

  try {
    await templateFoldersRef(_uid).add({
      name: folderName,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('Folder created.');
    setReportStatus('Folder created.', false);
  } catch (err) {
    setReportStatus((err && err.message) || 'Failed to create folder.', true);
  }
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
  var name = (selected ? String(selected.name || '') : '') || 'Manual Template';

  var payload = {
    name: name,
    body: state.body,
    folder: state.folder,
    studyType: inferStudyTypeFromTemplate({
      name: name,
      body: state.body,
      studyType: selected ? selected.studyType : ''
    }),
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

async function handleMoveTemplateFolder() {
  if (!_uid) return;

  var selected = getSelectedTemplate();
  if (!selected || !selected.id) {
    setReportStatus('Select a template first.', true);
    return;
  }

  var folderEl = document.getElementById('template-folder-select');
  var targetFolder = normalizeTemplateFolderName(folderEl ? folderEl.value : '');

  try {
    await reportTemplatesRef(_uid).doc(selected.id).set({
      folder: targetFolder,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    showToast('Template moved.');
    setReportStatus('Moved to ' + (targetFolder ? '"' + targetFolder + '"' : 'no folder') + '.', false);
  } catch (err) {
    setReportStatus((err && err.message) || 'Failed to move template.', true);
  }
}

function handleNewTemplate() {
  var dialog = document.getElementById('create-template-dialog');
  if (!dialog) return;
  var nameInput = document.getElementById('create-template-name');
  var bodyInput = document.getElementById('create-template-body');
  if (nameInput) nameInput.value = '';
  if (bodyInput) bodyInput.value = '';
  dialog.showModal();
  if (nameInput) nameInput.focus();
}

async function handleCreateTemplateConfirm() {
  if (!_uid) return;

  var nameInput = document.getElementById('create-template-name');
  var bodyInput = document.getElementById('create-template-body');
  var name = nameInput ? String(nameInput.value || '').trim() : '';
  var body = bodyInput ? String(bodyInput.value || '').trim() : '';

  if (!name) {
    if (nameInput) nameInput.focus();
    setReportStatus('Enter a template name.', true);
    return;
  }

  // Default new template to the currently-filtered folder
  var filterEl = document.getElementById('template-folder-filter-select');
  var folder = normalizeTemplateFolderName(filterEl ? filterEl.value : '');

  var payload = {
    name: name,
    body: body,
    folder: folder,
    selectedPhraseHandlingIds: [],
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    var ref = await reportTemplatesRef(_uid).add(payload);
    _pendingTemplateSelection = ref.id;
    var dialog = document.getElementById('create-template-dialog');
    if (dialog) dialog.close();
    showToast('Template created.');
    setReportStatus('Template created.', false);
  } catch (err) {
    setReportStatus((err && err.message) || 'Failed to create template.', true);
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
      folder: normalizeTemplateFolderName((document.getElementById('template-folder-select') || {}).value),
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

async function handleSaveDesiredOutputLearning() {
  if (!_uid) {
    setDesiredOutputLearningStatus('Sign in first to save learning.', true);
    return;
  }

  var outputMode = getReportOutputMode();
  var findings = String((document.getElementById('report-findings-input') || {}).value || '').trim();
  var desiredOutputDraft = getDesiredOutputDraft();
  var generatedDraft = String((document.getElementById('report-output') || {}).value || '').trim();

  if (!desiredOutputDraft) {
    setDesiredOutputLearningStatus('Paste a final draft first.', true);
    return;
  }

  if (!findings) {
    setDesiredOutputLearningStatus('Enter findings input before saving learning.', true);
    return;
  }

  var payload = {
    findingsInput: findings,
    generationMode: outputMode,
    desiredOutputDraft: desiredOutputDraft,
    generatedDraft: generatedDraft,
    studyType: getReportStudyType(),
    indication: getReportIndication(),
    aiProvider: getSelectedAiProvider(),
    aiModel: getSelectedAiModel(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    setDesiredOutputLearningStatus('Saving desired output learning...', false);
    await desiredOutputLearningsRef(_uid).add(payload);
    setDesiredOutputLearningStatus('Desired output learning saved to Firebase.', false);
    setReportStatus('Desired output learning saved.', false);
    showToast('Desired output learning saved.');
  } catch (err) {
    var msg = (err && err.message) || 'Failed to save desired output learning.';
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
    system += '\nFor impression output, write a concise numbered list (e.g., 1., 2., 3.) with each line containing: key finding summary; most likely diagnosis (or focused differential when uncertain); and actionable recommendation when indicated.';
    system += '\nPrioritize highest-risk and management-changing abnormalities first, avoid restating full findings, and avoid hedging when a leading diagnosis is supported.';
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

  var body = String(template.body || '');
  var examMatch = body.match(/(?:^|\n)\s*(?:EXAM|STUDY|PROCEDURE)\s*:\s*([^\n]+)/i);
  if (examMatch && examMatch[1]) {
    return String(examMatch[1]).trim();
  }

  var name = String(template.name || '').trim();
  if (name) return name;

  var explicit = String(template.studyType || '').trim();
  if (explicit) return explicit;
  return '';
}

function applyTemplateContextToGenerationFields(template) {
  var studyTypeInput = document.getElementById('report-study-type-input');
  if (!studyTypeInput) return;

  var nextStudyType = inferStudyTypeFromTemplate(template);
  studyTypeInput.value = nextStudyType || '';
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
    instructions.push('Write the Impression as a concise radiology-expert numbered list (1., 2., 3.).');
    instructions.push('Each numbered line must include: key finding summary; most likely diagnosis or a focused differential diagnosis if uncertain; and a recommendation only when clinically indicated.');
    instructions.push('Order by urgency/clinical impact and keep wording decisive, specific, and actionable.');
  } else if (outputMode === 'improve-impression') {
    instructions.push('Rewrite the provided impression text for clarity and professionalism without changing meaning.');
    instructions.push('Return a concise radiology-expert numbered list (1., 2., 3.) where each item states finding summary, diagnosis or focused differential, and recommendation when indicated.');
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
