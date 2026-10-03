# Security Policy

## Regras do frontend

- Segredos e credenciais privadas nunca devem ser enviados ao bundle do navegador.
- Integrações que exijam chave privada devem passar por um gateway server-side.
- Dados locais do usuário permanecem no IndexedDB até existir sincronização autenticada e consentida.
- Service Worker não fabrica respostas de sucesso para APIs remotas.
- Dependências com vulnerabilidade de severidade alta ou crítica bloqueiam o quality gate.

## Credencial legada

Uma credencial de Google Books existia em código legado e foi removida da árvore ativa durante a reconstrução v3. Ela deve ser considerada exposta e rotacionada ou revogada no projeto Google correspondente antes de qualquer reutilização.
