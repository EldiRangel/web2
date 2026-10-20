// Logica de la pagina de login: el componente avisa y la pagina navega
import '../components/Login.js';

window.addEventListener('login-success', () => {
    window.location.replace('/');
});
