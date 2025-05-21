(function() {
  const vscode = acquireVsCodeApi();
  const chat = document.getElementById('chat');
  const input = document.getElementById('input');
  const send = document.getElementById('send');
  send.addEventListener('click', () => {
    const msg = input.value.trim();
    if (msg) { vscode.postMessage({ type: 'sendMessage', message: msg }); input.value = ''; }
  });
  window.addEventListener('message', event => {
    const msg = event.data;
    const div = document.createElement('div');
    div.textContent = (msg.role === 'user' ? 'You: ' : 'Assistant: ') + msg.content;
    div.className = 'message ' + msg.role;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  });
})();
