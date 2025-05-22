// @ts-nocheck
(function() {
  const vscode = acquireVsCodeApi();
  const chat = document.getElementById('chat');
  const stats = document.getElementById('stats');
  const input = document.getElementById('input');
  const send = document.getElementById('send');
  const clearBtn = document.getElementById('clear');

  function updateStats() {
    const count = chat.querySelectorAll('.message').length;
    stats.textContent = `Messages: ${count}`;
  }

  send.addEventListener('click', () => {
    const msg = input.value.trim();
    if (msg) { vscode.postMessage({ type: 'sendMessage', message: msg }); input.value = ''; }
  });
  clearBtn.addEventListener('click', () => vscode.postMessage({ type: 'clearChat' }));

  window.addEventListener('message', event => {
    const data = event.data;
    if (data.type === 'clearChat') {
      chat.innerHTML = '';
      updateStats();
      return;
    }
    if (data.type === 'setLoading') {
      // Show or hide a loading spinner
      let spinner = document.getElementById('loading');
      if (data.isLoading) {
        if (!spinner) {
          spinner = document.createElement('div');
          spinner.id = 'loading';
          spinner.textContent = 'Thinking...';
          chat.appendChild(spinner);
        }
      } else if (spinner) {
        spinner.remove();
      }
      return;
    }
    if (data.type === 'addMessage') {
      const { role, content } = data.message;
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message ' + role;

      const header = document.createElement('div');
      header.className = 'message-header';
      header.textContent = role === 'user' ? 'You' : 'Assistant';

      const body = document.createElement('div');
      body.className = 'message-body';
      body.innerHTML = content.replace(/\n/g, '<br>');

      const actions = document.createElement('div');
      actions.className = 'message-actions';
      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(content);
        copyBtn.textContent = 'Copied';
        setTimeout(() => copyBtn.textContent = 'Copy', 2000);
      });
      const insertBtn = document.createElement('button');
      insertBtn.textContent = 'Insert';
      insertBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'insertCode', code: content });
      });
      actions.appendChild(copyBtn);
      actions.appendChild(insertBtn);

      messageDiv.appendChild(header);
      messageDiv.appendChild(body);
      messageDiv.appendChild(actions);
      chat.appendChild(messageDiv);
      chat.scrollTop = chat.scrollHeight;
      updateStats();
    }
  });
})();
