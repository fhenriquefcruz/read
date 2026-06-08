// Registro nativo de Service Worker e Gerenciamento de PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(reg => console.log('⚡ Mind Forge Service Worker registrado com sucesso:', reg.scope))
      .catch(err => console.error('❌ Falha ao registrar Service Worker:', err));
  });
}

// Suporte para instalação in-app elegante
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Opcional: Criar botão flutuante ou aviso visual discreto para instalação se desejado
});
