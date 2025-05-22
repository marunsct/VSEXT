(function() {
  const vscode = acquireVsCodeApi();
  const toggle = document.getElementById('toggleInline');
  const defaultModel = document.getElementById('defaultModel');
  const apiKeysDiv = document.getElementById('apiKeys');

  window.addEventListener('message', event => {
    const { settings, modelStatus } = event.data;
    // Populate default model
    defaultModel.innerHTML = '';
    settings.modelStatus = modelStatus; // pass api key status
    ['gpt-4','gpt-3.5-turbo','claude-3-opus','claude-3-sonnet','gemini-pro','gemini-1.5-pro','custom'].forEach(id => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.text = id + (settings.defaultModel === id ? ' (current)' : '');
      defaultModel.appendChild(opt);
    });
    defaultModel.value = settings.defaultModel;

    // Populate API keys section
    apiKeysDiv.innerHTML = '';
    for (const id in modelStatus) {
      const has = modelStatus[id];
      const div = document.createElement('div');
      div.textContent = id + ': ' + (has ? '✅' : '❌');
      const btn = document.createElement('button');
      btn.textContent = has ? 'Remove' : 'Set';
      btn.onclick = () => {
        if (has) {vscode.postMessage({ type: 'removeApiKey', modelId: id });}
        else {vscode.postMessage({ type: 'setApiKey', modelId: id });}
      };
      div.appendChild(btn);
      apiKeysDiv.appendChild(div);
    }

    // Set inline toggle
    toggle.textContent = settings.inlineCompletionsEnabled ? 'Disable Inline Completions' : 'Enable Inline Completions';
    toggle.onclick = () => vscode.postMessage({ type: 'toggleInlineCompletions', enabled: !settings.inlineCompletionsEnabled });

    // Default model change
    defaultModel.onchange = () => vscode.postMessage({ type: 'setDefaultModel', modelId: defaultModel.value });
  });

  // Request initial settings
  vscode.postMessage({ type: 'refresh' });
})();
