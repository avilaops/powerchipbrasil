// Configuração da API
// Em produção, altere para a URL do Railway
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://powerchipbrasil-production.up.railway.app'; // Altere para sua URL do Railway

// Exportar configuração
window.CONFIG = {
    API_URL: API_URL
};
