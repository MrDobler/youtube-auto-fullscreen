const status = document.getElementById('status');

if (status) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'foundation:status',
    });
    if (response?.ready !== true) {
      throw new Error('Worker unavailable');
    }
    status.textContent = 'Base carregada.';
  } catch {
    status.textContent = 'Não foi possível iniciar. Recarregue a extensão.';
  }
}
